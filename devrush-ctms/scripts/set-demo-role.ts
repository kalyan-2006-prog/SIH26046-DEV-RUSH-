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

const role = process.argv[2];
const VALID = [
  "PI", "SUB_INVESTIGATOR", "COORDINATOR", "DATA_MANAGER",
  "MONITOR", "PV_OFFICER", "EC_MEMBER", "DSMB_MEMBER",
  "REGULATORY", "SPONSOR", "ADMIN",
];
if (!VALID.includes(role)) {
  console.error("Use one of: " + VALID.join(", "));
  process.exit(1);
}

async function main() {
  const snap = await db.collection("users").where("displayName", "==", "Test User").get();
  if (snap.empty) throw new Error("No user named Test User found");
  for (const d of snap.docs) {
    await d.ref.update({ role });
    console.log(`Set ${d.id} role to ${role}`);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});