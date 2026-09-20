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
  for (const col of ["participants", "adverse_events"]) {
    const snap = await db.collection(col).where("ingestSource", "==", "fhir-ingest").get();
    for (const d of snap.docs) await d.ref.delete();
    console.log(`Deleted ${snap.size} FHIR-ingested docs from ${col}`);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
