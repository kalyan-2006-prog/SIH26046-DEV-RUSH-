import { auth } from "@/lib/firebase";

/** Headers for calling our own protected API routes as the logged-in user. */
export async function authHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + token,
  };
}
