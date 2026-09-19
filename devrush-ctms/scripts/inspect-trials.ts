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
  const trialsSnap = await db.collection("trials").get();
  const participantsSnap = await db.collection("participants").get();

  const participantCounts: Record<string, number> = {};
  participantsSnap.docs.forEach((d) => {
    const trialId = d.data().trialId as string;
    participantCounts[trialId] = (participantCounts[trialId] || 0) + 1;
  });

  const rows = trialsSnap.docs
    .map((d) => {
      const t = d.data();
      return {
        id: d.id,
        name: t.name,
        hasEthicsApproval: t.ethicsApprovalDate ? "YES" : "no",
        ethicsRenewalDue: t.ethicsRenewalDueDate || "-",
        participants: participantCounts[d.id] || 0,
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  console.table(rows);
  console.log("Total trials:", trialsSnap.size);
  console.log("Total participants:", participantsSnap.size);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});