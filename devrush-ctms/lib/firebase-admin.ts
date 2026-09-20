import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_KEY environment variable."
    );
  }

  const serviceAccount = JSON.parse(raw);

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export const adminDb = getFirestore(getAdminApp());