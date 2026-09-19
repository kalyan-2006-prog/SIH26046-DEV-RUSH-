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

const sites = [
  { name: "AIIA Delhi Ayurveda Research Centre", city: "New Delhi", state: "Delhi", principalInvestigator: "Dr. R. Sharma" },
  { name: "National Institute of Ayurveda", city: "Jaipur", state: "Rajasthan", principalInvestigator: "Dr. S. Patel" },
];

async function seed() {
  console.log("Seeding sites...");
  const siteIds: string[] = [];
  for (const site of sites) {
    const ref = await db.collection("sites").add({
      ...site,
      status: "Active",
    });
    siteIds.push(ref.id);
    console.log(`Added site: ${site.name} (${ref.id})`);
  }
  console.log("Seeding complete. Site IDs:", siteIds);
}

seed().catch(console.error);