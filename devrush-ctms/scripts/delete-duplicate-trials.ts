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

const doDelete = process.argv.includes("--delete");

async function main() {
  const trialsSnap = await db.collection("trials").get();
  const participantsSnap = await db.collection("participants").get();

  const trialIdsInUse = new Set(
    participantsSnap.docs.map((d) => d.data().trialId as string)
  );

  // Group trials by name
  const groups: Record<string, FirebaseFirestore.QueryDocumentSnapshot[]> = {};
  trialsSnap.docs.forEach((d) => {
    const name = d.data().name as string;
    if (!groups[name]) groups[name] = [];
    groups[name].push(d);
  });

  const toDelete: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  for (const [name, docs] of Object.entries(groups)) {
    const hasKeeper = docs.some((d) => !!d.data().ethicsApprovalDate);
    if (!hasKeeper) {
      console.log(`SKIP "${name}": no copy has an ethics date, leaving all untouched.`);
      continue;
    }
    docs.forEach((d) => {
      const noEthics = !d.data().ethicsApprovalDate;
      const noParticipants = !trialIdsInUse.has(d.id);
      if (noEthics && noParticipants) {
        toDelete.push(d);
      }
    });
  }

  console.log("\nTrials that will be deleted:");
  toDelete.forEach((d) => console.log(`  ${d.id}  ${d.data().name}`));
  console.log(`\nTotal to delete: ${toDelete.length}`);
  console.log(`Trials remaining after delete: ${trialsSnap.size - toDelete.length}`);

  if (!doDelete) {
    console.log("\nDRY RUN ONLY. Nothing was deleted.");
    console.log("To really delete, run again with:  --delete");
    return;
  }

  const batch = db.batch();
  toDelete.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  console.log("\nDeleted. Done.");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});