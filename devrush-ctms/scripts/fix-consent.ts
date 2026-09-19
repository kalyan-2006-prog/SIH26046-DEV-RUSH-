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

async function main() {
  const snap = await db.collection("participants").get();
  let fixed = 0;

  for (const d of snap.docs) {
    const p = d.data();
    console.log(`${p.name} | consentStatus: ${p.consentStatus} | dpdpConsentGiven: ${p.dpdpConsentGiven}`);

    if (p.consentStatus === "Active" && p.dpdpConsentGiven !== true) {
      await d.ref.update({ dpdpConsentGiven: true });
      console.log(`  -> fixed ${p.name}`);
      fixed++;
    }
  }
  console.log(`\nDone. Fixed ${fixed} participant(s).`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});