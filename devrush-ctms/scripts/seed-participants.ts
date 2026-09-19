import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";

const serviceAccount = JSON.parse(
  readFileSync("./serviceAccountKey.json", "utf-8")
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const siteIds = ["lq9aGPjgSqknfXXUhihG", "zsU1KiEhDJejyw3oNTaP"];

const participantNames = [
  "Participant A", "Participant B", "Participant C", "Participant D",
  "Participant E", "Participant F", "Participant G", "Participant H",
];

async function seed() {
  console.log("Fetching trials...");
  const trialsSnapshot = await db.collection("trials").get();
  const trialIds = trialsSnapshot.docs.map((doc) => doc.id);

  if (trialIds.length === 0) {
    throw new Error("No trials found — run seed.ts first.");
  }

  console.log(`Found ${trialIds.length} trials. Seeding participants...`);

  for (let i = 0; i < participantNames.length; i++) {
    const ref = await db.collection("participants").add({
      name: participantNames[i],
      trialId: trialIds[i % trialIds.length],
      siteId: siteIds[i % siteIds.length],
      enrollmentDate: new Date(2025, i % 12, 5).toISOString(),
      consentStatus: i % 3 === 0 ? "Withdrawn" : "Active",
      dpdpConsentGiven: true,
    });
    console.log(`Added participant: ${participantNames[i]} (${ref.id})`);
  }
  console.log("Seeding complete.");
}

seed().catch(console.error);