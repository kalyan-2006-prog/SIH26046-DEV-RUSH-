import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "fs";

const serviceAccount = JSON.parse(
  readFileSync("./serviceAccountKey.json", "utf-8")
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const trialNames = [
  "Ashwagandha for Chronic Stress Management",
  "Triphala in Metabolic Syndrome",
  "Guggulu for Lipid Profile Improvement",
  "Brahmi for Cognitive Function in Elderly",
  "Turmeric-Curcumin in Osteoarthritis",
];

async function seed() {
  console.log("Seeding trials...");
  for (let i = 0; i < trialNames.length; i++) {
    await db.collection("trials").add({
      name: trialNames[i],
      phase: ["Phase II", "Phase III"][i % 2],
      status: ["Enrolling", "Active", "Data Analysis"][i % 3],
      startDate: Timestamp.fromDate(new Date(2025, i, 1)),
      ctriRegistrationStatus: i % 2 === 0 ? "Registered" : "Pending",
      enrollmentTarget: 100 + i * 20,
      enrollmentCurrent: 40 + i * 15,
    });
    console.log(`Added trial: ${trialNames[i]}`);
  }
  console.log("Seeding complete.");
}

seed().catch(console.error);