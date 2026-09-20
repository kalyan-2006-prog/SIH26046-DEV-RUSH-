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

// Demo drug dictionary in WHODrug's shape: drug name, ATC-style class, generic name.
// This is a small illustrative set, NOT the licensed WHODrug Global dictionary.
const demoDrugTerms = [
  { drugName: "Paracetamol", genericName: "Paracetamol", atcClass: "N02BE01 - Anilides" },
  { drugName: "Ashwagandha Extract", genericName: "Withania somnifera", atcClass: "Herbal - Adaptogen" },
  { drugName: "Triphala Churna", genericName: "Triphala", atcClass: "Herbal - Digestive" },
  { drugName: "Ibuprofen", genericName: "Ibuprofen", atcClass: "M01AE01 - Propionic acid derivatives" },
  { drugName: "Turmeric-Curcumin Complex", genericName: "Curcuma longa extract", atcClass: "Herbal - Anti-inflammatory" },
  { drugName: "Metformin", genericName: "Metformin hydrochloride", atcClass: "A10BA02 - Biguanides" },
  { drugName: "Guggulu Extract", genericName: "Commiphora mukul", atcClass: "Herbal - Lipid-lowering" },
  { drugName: "Brahmi Extract", genericName: "Bacopa monnieri", atcClass: "Herbal - Nootropic" },
];

async function main() {
  const batch = db.batch();
  const collectionRef = db.collection("whodrug_terms");

  demoDrugTerms.forEach((term) => {
    const docRef = collectionRef.doc();
    batch.set(docRef, term);
  });

  await batch.commit();
  console.log(`Seeded ${demoDrugTerms.length} demo drug terms into whodrug_terms collection.`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});