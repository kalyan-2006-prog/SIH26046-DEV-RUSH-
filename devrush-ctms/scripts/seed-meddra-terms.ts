import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { MEDDRA_SEED_TERMS } from "./meddra-terms";

const serviceAccount = JSON.parse(
  readFileSync("./serviceAccountKey.json", "utf-8")
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

async function seedMeddraTerms() {
  console.log("Seeding MedDRA-style terms...");
  for (const term of MEDDRA_SEED_TERMS) {
    await db.collection("meddra_terms").doc(term.code).set({
      code: term.code,
      ptTerm: term.ptTerm,
      socTerm: term.socTerm,
    });
    console.log(`Added term: ${term.code} - ${term.ptTerm}`);
  }
  console.log("MedDRA term seeding complete.");
}

seedMeddraTerms().catch(console.error);