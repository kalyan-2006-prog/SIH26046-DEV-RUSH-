import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

const keyPath = path.join(process.cwd(), "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const mode = process.argv[2];

async function main() {
  if (mode === "clean") {
    const snap = await db.collection("adverse_events").where("demoSeed", "==", true).get();
    for (const d of snap.docs) await d.ref.delete();
    console.log(`Deleted ${snap.size} demo SAE events.`);
    return;
  }
  if (mode !== "seed") {
    console.error("Usage: npx tsx scripts/seed-demo-sae.ts seed | clean");
    process.exit(1);
  }

  const pSnap = await db.collection("participants").where("name", "==", "Participant A").get();
  if (pSnap.empty) throw new Error("Participant A not found");
  const participantId = pSnap.docs[0].id;

  const mSnap = await db.collection("meddra_terms").get();
  const terms = mSnap.docs.map((d) => d.data() as { code: string; ptTerm: string; socTerm: string });
  if (terms.length < 3) throw new Error("Need at least 3 MedDRA terms");

  const plan = [
    { hoursAgo: 2, severity: "Severe", term: terms[0] },
    { hoursAgo: 19, severity: "Life-threatening", term: terms[1] },
    { hoursAgo: 30, severity: "Life-threatening", term: terms[2] },
  ];

  for (const p of plan) {
    await db.collection("adverse_events").add({
      participantId,
      description: "DEMO SEED: backdated event for SAE clock demonstration",
      severity: p.severity,
      meddraCode: p.term.code,
      meddraTerm: p.term.ptTerm,
      meddraSoc: p.term.socTerm,
      whodrugId: "",
      whodrugName: "",
      whodrugGeneric: "",
      whodrugClass: "",
      reportedBy: "demo-seed",
      reportedAt: Timestamp.fromDate(new Date(Date.now() - p.hoursAgo * 3600 * 1000)),
      demoSeed: true,
    });
    console.log(`Created ${p.severity} event reported ${p.hoursAgo}h ago (${p.term.ptTerm})`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});