import { adminDb } from "@/lib/firebase-admin";
import { requireRole, ApiAuthError } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NS = "https://devrush-ctms.example";
const MEDDRA_DEMO = `${NS}/CodeSystem/meddra-demo`;
const WHODRUG_DEMO = `${NS}/CodeSystem/whodrug-demo`;

interface TrialDoc {
  id: string;
  name?: string;
  phase?: string;
  status?: string;
  startDate?: unknown;
  ctriRegistrationStatus?: string;
}
interface ParticipantDoc {
  id: string;
  trialId?: string;
  enrollmentDate?: unknown;
  consentStatus?: string;
  dpdpConsentGiven?: boolean;
}
interface AdverseEventDoc {
  id: string;
  participantId?: string;
  severity?: string;
  meddraCode?: string;
  meddraTerm?: string;
  meddraSoc?: string;
  whodrugId?: string;
  whodrugName?: string;
  whodrugGeneric?: string;
  whodrugClass?: string;
  reportedBy?: string;
  reportedAt?: unknown;
}
type Resource = { resourceType: string; id: string; [key: string]: unknown };

function toIso(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

function mapStudyStatus(status?: string): string {
  const s = (status || "").toLowerCase();
  if (s === "active") return "active";
  if (s === "completed") return "completed";
  return "in-review";
}

function mapPhase(phase?: string) {
  const key = (phase || "").toLowerCase().replace("phase", "").trim();
  const table: Record<string, string> = {
    i: "phase-1", "1": "phase-1",
    ii: "phase-2", "2": "phase-2",
    iii: "phase-3", "3": "phase-3",
    iv: "phase-4", "4": "phase-4",
    "i/ii": "phase-1-phase-2", "ii/iii": "phase-2-phase-3",
  };
  return {
    coding: [
      {
        system: "http://terminology.hl7.org/CodeSystem/research-study-phase",
        code: table[key] ?? "n-a",
      },
    ],
    text: phase,
  };
}

const SEVERITY: Record<string, string> = {
  Mild: "mild",
  Moderate: "moderate",
  Severe: "severe",
  "Life-threatening": "severe",
};

export async function GET(request: Request) {
  try {
    await requireRole(request, ["PI", "ADMIN", "DATA_MANAGER", "REGULATORY"]);

    const base = `${new URL(request.url).origin}/api/fhir`;

    const [trialSnap, participantSnap, aeSnap] = await Promise.all([
      adminDb.collection("trials").get(),
      adminDb.collection("participants").get(),
      adminDb.collection("adverse_events").get(),
    ]);

    const trials = trialSnap.docs.map((d) => ({ ...(d.data() as Omit<TrialDoc, "id">), id: d.id }));
    const allParticipants = participantSnap.docs.map((d) => ({ ...(d.data() as Omit<ParticipantDoc, "id">), id: d.id }));
    const allEvents = aeSnap.docs.map((d) => ({ ...(d.data() as Omit<AdverseEventDoc, "id">), id: d.id }));

    // DPDP: only export participants with valid consent and a linked trial
    const participants = allParticipants.filter(
      (p) => p.dpdpConsentGiven === true && p.consentStatus !== "Withdrawn" && !!p.trialId
    );
    const excludedCount = allParticipants.length - participants.length;
    const participantMap = new Map(participants.map((p) => [p.id, p]));
    const events = allEvents.filter((e) => e.participantId && participantMap.has(e.participantId));

    const entries: { fullUrl: string; resource: Resource }[] = [];
    const add = (resource: Resource) =>
      entries.push({ fullUrl: `${base}/${resource.resourceType}/${resource.id}`, resource });

    // ResearchStudy
    for (const t of trials) {
      add({
        resourceType: "ResearchStudy",
        id: t.id,
        identifier: [{ system: `${NS}/trial-id`, value: t.id }],
        title: t.name,
        status: mapStudyStatus(t.status),
        phase: mapPhase(t.phase),
        period: toIso(t.startDate) ? { start: toIso(t.startDate) } : undefined,
        note: t.ctriRegistrationStatus
          ? [{ text: `CTRI registration status: ${t.ctriRegistrationStatus}` }]
          : undefined,
      });
    }

    // Patient (pseudonymised: NO names) + ResearchSubject
    for (const p of participants) {
      add({
        resourceType: "Patient",
        id: p.id,
        identifier: [{ system: `${NS}/participant-id`, value: p.id }],
      });
      add({
        resourceType: "ResearchSubject",
        id: `rs-${p.id}`,
        status: "on-study",
        period: toIso(p.enrollmentDate) ? { start: toIso(p.enrollmentDate) } : undefined,
        study: { reference: `ResearchStudy/${p.trialId}` },
        individual: { reference: `Patient/${p.id}` },
      });
    }

    // Medication (from WHODrug demo coding), one per unique drug
    const medsAdded = new Set<string>();
    for (const e of events) {
      if (!e.whodrugId || medsAdded.has(e.whodrugId)) continue;
      medsAdded.add(e.whodrugId);
      const coding: Record<string, string | undefined>[] = [
        { system: WHODRUG_DEMO, code: e.whodrugId, display: e.whodrugName },
      ];
      const atc = (e.whodrugClass || "").match(/^[A-Z]\d{2}[A-Z]{2}\d{2}/);
      if (atc) coding.push({ system: "http://www.whocc.no/atc", code: atc[0] });
      add({
        resourceType: "Medication",
        id: e.whodrugId,
        code: { coding, text: e.whodrugGeneric || e.whodrugName },
      });
    }

    // AdverseEvent (MedDRA demo coding)
    for (const e of events) {
      const p = participantMap.get(e.participantId as string)!;
      add({
        resourceType: "AdverseEvent",
        id: e.id,
        actuality: "actual",
        event: {
          coding: [{ system: MEDDRA_DEMO, code: e.meddraCode, display: e.meddraTerm }],
          text: e.meddraTerm,
        },
        subject: { reference: `Patient/${p.id}` },
        study: [{ reference: `ResearchStudy/${p.trialId}` }],
        recordedDate: toIso(e.reportedAt),
        recorder: e.reportedBy
          ? { identifier: { system: `${NS}/user-id`, value: e.reportedBy } }
          : undefined,
        severity: e.severity
          ? {
              coding: [
                {
                  system: "http://terminology.hl7.org/CodeSystem/adverse-event-severity",
                  code: SEVERITY[e.severity] ?? "moderate",
                },
              ],
              text: e.severity,
            }
          : undefined,
        seriousness:
          e.severity === "Life-threatening"
            ? {
                coding: [
                  {
                    system: "http://terminology.hl7.org/CodeSystem/adverse-event-seriousness",
                    code: "Serious",
                  },
                ],
                text: "Life-threatening",
              }
            : undefined,
        suspectEntity: e.whodrugId
          ? [{ instance: { reference: `Medication/${e.whodrugId}` } }]
          : undefined,
        extension: e.meddraSoc
          ? [{ url: `${NS}/StructureDefinition/meddra-soc`, valueString: e.meddraSoc }]
          : undefined,
      });
    }

    const bundle = {
      resourceType: "Bundle",
      type: "collection",
      timestamp: new Date().toISOString(),
      total: entries.length,
      entry: entries,
    };

    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "X-Excluded-No-Consent": String(excludedCount),
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("FHIR export failed:", err);
    return new Response(JSON.stringify({ error: "FHIR export failed. Check server logs." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
