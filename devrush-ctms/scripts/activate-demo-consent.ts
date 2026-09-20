import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

const keyPath = path.join(process.cwd(), "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));

if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

// Demo data only: mark these three participants as properly consented
const NAMES = ["Participant A", "Participant D", "Participant G"];

async function main() {
  for (const name of NAMES) {
    const snap = await db.collection("participants").where("name", "==", name).get();
    for (const doc of snap.docs) {
      await doc.ref.update({ consentStatus: "Active", dpdpConsentGiven: true });
      console.log(`Updated ${name} (${doc.id})`);
    }
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});