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

const NS = "https://devrush-ctms.example";
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

async function main() {
  const snap = await db.collection("trials").get();
  if (snap.empty) throw new Error("No trials found");
  const trialDoc = snap.docs.find((d) => d.data().status === "Active") ?? snap.docs[0];
  const trialId = trialDoc.id;

  const patient = (id: string, code: string, extra: Record<string, unknown>) => ({
    resourceType: "Patient",
    id,
    identifier: [{ system: `${NS}/participant-id`, value: code }],
    ...extra,
  });
  const subject = (pid: string) => ({
    resourceType: "ResearchSubject",
    id: `rs-${pid}`,
    status: "on-study",
    period: { start: "2026-08-15T00:00:00Z" },
    study: { reference: `ResearchStudy/${trialId}` },
    individual: { reference: `Patient/${pid}` },
  });
  const consent = (pid: string) => ({
    resourceType: "Consent",
    id: `consent-${pid}`,
    status: "active",
    patient: { reference: `Patient/${pid}` },
  });
  const adverse = (id: string, pid: string, sevCode: string, sevText: string, hours: number, term: string, serious: boolean) => ({
    resourceType: "AdverseEvent",
    id,
    actuality: "actual",
    event: { coding: [{ system: `${NS}/CodeSystem/meddra-demo`, code: `DEMO-${id}`, display: term }], text: term },
    subject: { reference: `Patient/${pid}` },
    recordedDate: hoursAgo(hours),
    severity: { coding: [{ code: sevCode }], text: sevText },
    ...(serious ? { seriousness: { coding: [{ code: "Serious" }], text: sevText } } : {}),
    suspectEntity: [{ instance: { reference: "Medication/demo-med-1" } }],
    extension: [{ url: `${NS}/StructureDefinition/meddra-soc`, valueString: "Gastrointestinal disorders" }],
  });

  const resources = [
    { resourceType: "ResearchStudy", id: trialId, title: String(trialDoc.data().name ?? ""), status: "active" },
    // Fake people. Names/phones are made up and must be discarded by the ingest.
    patient("demo-p1", "DEMO-0001", { name: [{ text: "Fake Name One" }], telecom: [{ system: "phone", value: "0000000000" }] }),
    subject("demo-p1"),
    consent("demo-p1"),
    // demo-p2 has NO Consent, so it must be rejected
    patient("demo-p2", "DEMO-0002", { name: [{ text: "Fake Name Two" }] }),
    subject("demo-p2"),
    patient("demo-p3", "DEMO-0003", { name: [{ text: "Fake Name Three" }], birthDate: "1990-01-01" }),
    subject("demo-p3"),
    consent("demo-p3"),
    {
      resourceType: "Medication",
      id: "demo-med-1",
      code: {
        coding: [{ system: `${NS}/CodeSystem/whodrug-demo`, code: "demo-med-1", display: "Demo Herbal Formulation" }],
        text: "Demo generic name",
      },
    },
    adverse("ae-demo-1", "demo-p1", "severe", "Life-threatening", 3, "Vomiting", true),
    adverse("ae-demo-2", "demo-p2", "moderate", "Moderate", 4, "Headache", false), // its Patient is rejected
    adverse("ae-demo-3", "demo-p3", "mild", "Mild", 5, "Nausea", false),
  ];

  const bundle = { resourceType: "Bundle", type: "collection", entry: resources.map((resource) => ({ resource })) };
  const out = path.join(process.cwd(), "public", "sample-fhir-bundle.json");
  fs.writeFileSync(out, JSON.stringify(bundle, null, 2));
  console.log(`Wrote ${out}`);
  console.log(`Using trial: ${String(trialDoc.data().name)} (${trialId})`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
