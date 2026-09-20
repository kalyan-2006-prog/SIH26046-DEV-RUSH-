import { adminAuth, adminDb } from "@/lib/firebase-admin";

export class ApiAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Verifies the Firebase ID token in the Authorization header and checks
 * that the caller's role is one of allowedRoles. Throws ApiAuthError
 * (with an appropriate status code) if the check fails.
 */
export async function requireRole(request: Request, allowedRoles: string[]) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiAuthError("Missing or malformed Authorization header. Expected 'Bearer <idToken>'.", 401);
  }

  const idToken = authHeader.slice("Bearer ".length).trim();

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch (err) {
    throw new ApiAuthError("Invalid or expired ID token.", 401);
  }

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  if (!userSnap.exists) {
    throw new ApiAuthError("No user record found for this account.", 403);
  }

  const role = userSnap.data()?.role;
  if (!role || !allowedRoles.includes(role)) {
    throw new ApiAuthError(`Role '${role ?? "unknown"}' is not permitted to access this resource.`, 403);
  }

  return { uid: decoded.uid, role };
}

/**
 * Like requireRole, but any logged-in user with a users/{uid} record is allowed.
 * Returns the verified uid and role. Used where every role may act (e.g. audit log).
 */
export async function requireUser(request: Request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiAuthError("Missing or malformed Authorization header. Expected 'Bearer <idToken>'.", 401);
  }
  const idToken = authHeader.slice("Bearer ".length).trim();

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    throw new ApiAuthError("Invalid or expired ID token.", 401);
  }

  const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
  if (!userSnap.exists) {
    throw new ApiAuthError("No user record found for this account.", 403);
  }
  return { uid: decoded.uid, role: userSnap.data()?.role as string | undefined };
}
