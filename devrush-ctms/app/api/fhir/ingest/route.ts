import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { requireRole, ApiAuthError } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prototype FHIR R4 ingest. Accepts a Bundle, saves Patient + ResearchSubject as
// participants and AdverseEvent as adverse_events. It is NOT a full FHIR server:
// it only validates the fields this app reads.

const ALLOWED_ROLES = ["PI", "SUB_INVESTIGATOR", "COORDINATOR", "ADMIN"];
const MAX_ENTRIES = 500;
// Identifying fields a hospital feed may carry. Never stored (DPDP data minimisation).
const PII_FIELDS = ["name", "telecom", "address", "birthDate", "photo", "contact"];

type Json = Record<string, unknown>;
type Rejection = { resource: string; reason: string };
type Write = { collection: string; id: string; data: Json };

function asObj(v: unknown): Json | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function refId(ref: unknown, type: string): string | undefined {
  const r = str(asObj(ref)?.reference);
  if (!r) return undefined;
  const parts = r.split("/");
  return parts.length >= 2 && parts[parts.length - 2] === type ? parts[parts.length - 1] : undefined;
}
function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
}
function toDate(v: unknown): Date | undefined {
  const s = str(v);
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}
function extString(res: Json, suffix: string): string | undefined {
  for (const e of asArr(res.extension)) {
    const o = asObj(e);
    if (o && typeof o.url === "string" && o.url.endsWith(suffix)) return str(o.valueString);
  }
  return undefined;
}
function mapSeverity(ae: Json): string | undefined {
  const sev = asObj(ae.severity);
  const ser = asObj(ae.seriousness);
  const serText = (str(ser?.text) || "").toLowerCase();
  const sevText = (str(sev?.text) || "").toLowerCase();
  if (serText === "life-threatening" || sevText === "life-threatening") return "Life-threatening";
  const code = (str(asObj(asArr(sev?.coding)[0])?.code) || sevText).toLowerCase();
  const table: Record<string, string> = { mild: "Mild", moderate: "Moderate", severe: "Severe" };
  return table[code];
}

async function findParticipant(fhirId: string): Promise<{ docId?: string; reason?: string }> {
  for (const candidate of [`fhir-${safeId(fhirId)}`, fhirId]) {
    try {
      const snap = await adminDb.collection("participants").doc(candidate).get();
      if (!snap.exists) continue;
      const d = snap.data() ?? {};
      if (d.dpdpConsentGiven === true && d.consentStatus !== "Withdrawn") return { docId: candidate };
      return { reason: "Participant exists but consent is not active" };
    } catch {
      // invalid document id: try the next candidate
    }
  }
  return { reason: "Patient is not in this bundle and not known to the CTMS" };
}

export async function POST(request: NextRequest) {
  try {
    const { uid } = await requireRole(request, ALLOWED_ROLES);
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

    let body: Json | null = null;
    try {
      body = asObj(await request.json());
    } catch {
      body = null;
    }
    if (!body || body.resourceType !== "Bundle") {
      return NextResponse.json(
        { error: 'Request body must be a FHIR R4 Bundle (resourceType "Bundle").' },
        { status: 400 }
      );
    }
    const resources = asArr(body.entry)
      .map((e) => asObj(asObj(e)?.resource))
      .filter((r): r is Json => r !== null);
    if (resources.length === 0) {
      return NextResponse.json({ error: "Bundle has no entries." }, { status: 400 });
    }
    if (resources.length > MAX_ENTRIES) {
      return NextResponse.json(
        { error: `Bundle too large for this prototype (max ${MAX_ENTRIES} entries).` },
        { status: 400 }
      );
    }

    const ofType = (t: string) => resources.filter((r) => r.resourceType === t);

    const subjects = new Map<string, Json>();
    for (const rs of ofType("ResearchSubject")) {
      const pid = refId(rs.individual, "Patient");
      if (pid) subjects.set(pid, rs);
    }
    const consented = new Set<string>();
    for (const c of ofType("Consent")) {
      const pid = refId(c.patient, "Patient");
      if (str(c.status) === "active" && pid) consented.add(pid);
    }
    const meds = new Map<string, Json>();
    for (const m of ofType("Medication")) {
      const id = str(m.id);
      if (id) meds.set(id, m);
    }

    const trialCache = new Map<string, boolean>();
    const trialExists = async (id: string): Promise<boolean> => {
      if (!trialCache.has(id)) {
        try {
          trialCache.set(id, (await adminDb.collection("trials").doc(id).get()).exists);
        } catch {
          trialCache.set(id, false);
        }
      }
      return trialCache.get(id) === true;
    };

    const writes: Write[] = [];
    const rejected: Rejection[] = [];
    const acceptedParticipants = new Map<string, string>(); // FHIR Patient id -> Firestore doc id
    const rejectedPatients = new Set<string>();
    let piiFieldsDiscarded = 0;

    // ---- Patient + ResearchSubject + Consent -> participants ----
    for (const p of ofType("Patient")) {
      const pid = str(p.id);
      if (!pid) {
        rejected.push({ resource: "Patient", reason: "Resource has no id" });
        continue;
      }
      for (const f of PII_FIELDS) if (p[f] !== undefined) piiFieldsDiscarded++;

      const label = `Patient/${pid}`;
      const reject = (reason: string) => {
        rejected.push({ resource: label, reason });
        rejectedPatients.add(pid);
      };

      const subject = subjects.get(pid);
      if (!subject) { reject("No ResearchSubject links this Patient to a study"); continue; }
      const trialId = refId(subject.study, "ResearchStudy");
      if (!trialId) { reject("ResearchSubject has no study reference"); continue; }
      if (!(await trialExists(trialId))) { reject(`Trial ${trialId} does not exist in the CTMS`); continue; }
      const enrolled = toDate(asObj(subject.period)?.start);
      if (!enrolled) { reject("ResearchSubject.period.start (enrolment date) is missing or invalid"); continue; }
      if (!consented.has(pid)) { reject("No active Consent resource for this Patient (DPDP)"); continue; }

      const docId = `fhir-${safeId(pid)}`;
      const existing = await adminDb.collection("participants").doc(docId).get();
      if (existing.exists) {
        const d = existing.data() ?? {};
        if (d.consentStatus === "Withdrawn" || d.dpdpConsentGiven === false) {
          reject("Consent was withdrawn in the CTMS; existing record not overwritten");
          continue;
        }
      }

      const subjectCode = str(asObj(asArr(p.identifier)[0])?.value) || pid;
      const siteId = extString(subject, "/site-id");
      const data: Json = {
        name: `Subject ${subjectCode}`,
        trialId,
        enrollmentDate: enrolled.toISOString(),
        consentStatus: "Active",
        dpdpConsentGiven: true,
        ingestSource: "fhir-ingest",
        ingestedBy: uid,
        ingestedAt: Timestamp.now(),
      };
      if (siteId) data.siteId = siteId;
      writes.push({ collection: "participants", id: docId, data });
      acceptedParticipants.set(pid, docId);
    }

    // ---- AdverseEvent (+ Medication) -> adverse_events ----
    for (const ae of ofType("AdverseEvent")) {
      const aid = str(ae.id);
      if (!aid) {
        rejected.push({ resource: "AdverseEvent", reason: "Resource has no id" });
        continue;
      }
      const label = `AdverseEvent/${aid}`;
      const reject = (reason: string) => rejected.push({ resource: label, reason });

      const patientId = refId(ae.subject, "Patient");
      if (!patientId) { reject("No subject Patient reference"); continue; }
      if (rejectedPatients.has(patientId)) { reject("Its Patient was rejected in this bundle"); continue; }

      let participantDocId = acceptedParticipants.get(patientId);
      if (!participantDocId) {
        const found = await findParticipant(patientId);
        if (!found.docId) { reject(found.reason || "Participant not found"); continue; }
        participantDocId = found.docId;
      }

      const event = asObj(ae.event);
      const coding = asObj(asArr(event?.coding)[0]);
      const term = str(coding?.display) || str(event?.text);
      if (!term) { reject("No event term (event.coding.display or event.text)"); continue; }
      const severity = mapSeverity(ae);
      if (!severity) { reject("Severity missing or not recognised (mild, moderate, severe, life-threatening)"); continue; }
      const reportedAt = toDate(ae.recordedDate);
      if (!reportedAt) { reject("recordedDate is missing or invalid (it starts the SAE clock)"); continue; }

      let whodrugId = "";
      let whodrugName = "";
      let whodrugGeneric = "";
      let whodrugClass = "";
      const medRef = refId(asObj(asArr(ae.suspectEntity)[0])?.instance, "Medication");
      const med = medRef ? meds.get(medRef) : undefined;
      if (med) {
        const medCode = asObj(med.code);
        const codings = asArr(medCode?.coding)
          .map((c) => asObj(c))
          .filter((c): c is Json => c !== null);
        const main = codings.find((c) => (str(c.system) || "").includes("whodrug")) ?? codings[0];
        const atc = codings.find((c) => (str(c.system) || "").includes("whocc.no/atc"));
        whodrugId = str(main?.code) || medRef || "";
        whodrugName = str(main?.display) || "";
        whodrugGeneric = str(medCode?.text) || "";
        whodrugClass = str(atc?.code) || "";
      }

      writes.push({
        collection: "adverse_events",
        id: `fhir-${safeId(aid)}`,
        data: {
          participantId: participantDocId,
          description: `Received via FHIR R4 feed: ${term}`,
          severity,
          meddraCode: str(coding?.code) || "",
          meddraTerm: term,
          meddraSoc: extString(ae, "/meddra-soc") || "",
          whodrugId,
          whodrugName,
          whodrugGeneric,
          whodrugClass,
          reportedBy: uid, // the logged-in user who ingested it; source-system users are not CTMS users
          reportedAt: Timestamp.fromDate(reportedAt),
          ingestSource: "fhir-ingest",
          ingestedAt: Timestamp.now(),
        },
      });
    }

    const acceptedAdverseEvents = writes.filter((w) => w.collection === "adverse_events").length;

    // ---- Save (skipped on dry run) ----
    if (!dryRun) {
      for (let i = 0; i < writes.length; i += 400) {
        const batch = adminDb.batch();
        for (const w of writes.slice(i, i + 400)) {
          batch.set(adminDb.collection(w.collection).doc(w.id), w.data, { merge: true });
        }
        await batch.commit();
      }
    }

    // ---- Audit trail entry (real ingests only) ----
    let auditLogged: boolean | null = null;
    if (!dryRun) {
      try {
        const res = await fetch(new URL("/api/audit-log", request.url), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: request.headers.get("authorization") ?? "",
          },
          body: JSON.stringify({
            action: "FHIR_INGEST",
            participantId: "FHIR-BUNDLE",
            details: `FHIR R4 ingest: ${acceptedParticipants.size} participant(s) and ${acceptedAdverseEvents} adverse event(s) saved, ${rejected.length} rejected`,
          }),
        });
        auditLogged = res.ok;
      } catch {
        auditLogged = false;
      }
    }

    return NextResponse.json({
      dryRun,
      accepted: { participants: acceptedParticipants.size, adverseEvents: acceptedAdverseEvents },
      rejected,
      piiFieldsDiscarded,
      auditLogged,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("FHIR ingest failed:", err);
    return NextResponse.json({ error: "FHIR ingest failed. Check server logs." }, { status: 500 });
  }
}
