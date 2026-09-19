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
  const snap = await db.collection("adverse_events").get();
  let fixedNausea = 0;
  let fixedHeadache = 0;

  for (const d of snap.docs) {
    const description = String(d.data().description || "");

    if (description.startsWith("Nausea reported")) {
      await d.ref.update({
        meddraCode: "AE-001",
        meddraTerm: "Nausea",
        meddraSoc: "Gastrointestinal disorders",
      });
      fixedNausea++;
      console.log("Coded Nausea entry:", d.id);
    }

    if (description.startsWith("Mild frontal headache")) {
      await d.ref.update({ severity: "Mild" });
      fixedHeadache++;
      console.log("Set Headache severity to Mild:", d.id);
    }
  }

  console.log(`\nDone. Nausea fixed: ${fixedNausea}, Headache fixed: ${fixedHeadache}`);
  if (fixedNausea !== 1 || fixedHeadache !== 1) {
    console.log("WARNING: expected 1 and 1. Send me a screenshot of this output.");
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});