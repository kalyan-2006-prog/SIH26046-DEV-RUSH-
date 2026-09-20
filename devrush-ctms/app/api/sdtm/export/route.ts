import { adminDb } from "@/lib/firebase-admin";
import { requireRole, ApiAuthError } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ParticipantDoc {
  id: string;
  trialId?: string;
  siteId?: string;
  enrollmentDate?: unknown;
  consentStatus?: string;
  dpdpConsentGiven?: boolean;
}
interface AdverseEventDoc {
  id: string;
  participantId?: string;
  severity?: string;
  meddraTerm?: string;
  meddraSoc?: string;
  whodrugName?: string;
  reportedAt?: unknown;
}
type Row = Record<string, string | number>;

const DOMAINS = ["dm", "ae", "suppae"] as const;
type Domain = (typeof DOMAINS)[number];

function toDate(v: unknown): string {
  if (!v) return "";
  let d: Date | null = null;
  if (typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function") {
    d = (v as { toDate: () => Date }).toDate();
  } else if (typeof v === "string") {
    d = new Date(v);
  }
  return d && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

function csvCell(v: unknown): string {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: Row[]): string {
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))];
  return lines.join("\n") + "\n";
}

// NOTE: no authentication on this route yet. Fine for localhost demos.
// Add Firebase ID-token verification before exposing it publicly.
export async function GET(request: Request) {
  try {
    await requireRole(request, ["PI", "ADMIN", "DATA_MANAGER", "REGULATORY"]);
    const url = new URL(request.url);
    const domain = (url.searchParams.get("domain") || "").toLowerCase() as Domain;
    const download = url.searchParams.get("download") === "1";

    if (!DOMAINS.includes(domain)) {
      return new Response(
        "Use ?domain=dm, ?domain=ae or ?domain=suppae  (add &download=1 to save as a CSV file)\n",
        { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    const [participantSnap, aeSnap] = await Promise.all([
      adminDb.collection("participants").get(),
      adminDb.collection("adverse_events").get(),
    ]);

    const allParticipants = participantSnap.docs.map((d) => ({ ...(d.data() as Omit<ParticipantDoc, "id">), id: d.id }));
    const allEvents = aeSnap.docs.map((d) => ({ ...(d.data() as Omit<AdverseEventDoc, "id">), id: d.id }));

    // DPDP: only export participants with valid consent and a linked trial
    const participants = allParticipants
      .filter((p) => p.dpdpConsentGiven === true && p.consentStatus !== "Withdrawn" && !!p.trialId)
      .sort((a, b) => toDate(a.enrollmentDate).localeCompare(toDate(b.enrollmentDate)));
    const excludedCount = allParticipants.length - participants.length;
    const pMap = new Map(participants.map((p) => [p.id, p]));

    const usubjid = (p: ParticipantDoc) => `${p.trialId}-${p.id}`;

    let headers: string[] = [];
    let rows: Row[] = [];

    if (domain === "dm") {
      headers = ["STUDYID", "DOMAIN", "USUBJID", "SUBJID", "RFSTDTC", "SITEID", "AGE", "SEX", "COUNTRY"];
      rows = participants.map((p) => ({
        STUDYID: p.trialId as string,
        DOMAIN: "DM",
        USUBJID: usubjid(p),
        SUBJID: p.id,
        RFSTDTC: toDate(p.enrollmentDate),
        SITEID: p.siteId || "",
        AGE: "", // not collected in prototype
        SEX: "", // not collected in prototype
        COUNTRY: "IND", // assumption: all sites are in India
      }));
    } else {
      const events = allEvents
        .filter((e) => e.participantId && pMap.has(e.participantId))
        .sort((a, b) => toDate(a.reportedAt).localeCompare(toDate(b.reportedAt)) || a.id.localeCompare(b.id));

      const seqBySubject = new Map<string, number>();
      const aeRows = events.map((e) => {
        const p = pMap.get(e.participantId as string)!;
        const seq = (seqBySubject.get(p.id) || 0) + 1;
        seqBySubject.set(p.id, seq);
        const lifeThreatening = e.severity === "Life-threatening";
        const sev = lifeThreatening ? "SEVERE" : (e.severity || "").toUpperCase();
        return { e, p, seq, lifeThreatening, sev };
      });

      if (domain === "ae") {
        headers = ["STUDYID", "DOMAIN", "USUBJID", "AESEQ", "AETERM", "AEDECOD", "AEBODSYS", "AESEV", "AESER", "AESLIFE", "AESTDTC"];
        rows = aeRows.map(({ e, p, seq, lifeThreatening, sev }) => ({
          STUDYID: p.trialId as string,
          DOMAIN: "AE",
          USUBJID: usubjid(p),
          AESEQ: seq,
          AETERM: e.meddraTerm || "",
          AEDECOD: e.meddraTerm || "",
          AEBODSYS: e.meddraSoc || "",
          AESEV: sev,
          AESER: lifeThreatening ? "Y" : "N",
          AESLIFE: lifeThreatening ? "Y" : "N",
          AESTDTC: toDate(e.reportedAt),
        }));
      } else {
        // SUPPAE: supplemental qualifier carrying the suspected drug (WHODrug demo coding)
        headers = ["STUDYID", "RDOMAIN", "USUBJID", "IDVAR", "IDVARVAL", "QNAM", "QLABEL", "QVAL"];
        rows = aeRows
          .filter(({ e }) => !!e.whodrugName)
          .map(({ e, p, seq }) => ({
            STUDYID: p.trialId as string,
            RDOMAIN: "AE",
            USUBJID: usubjid(p),
            IDVAR: "AESEQ",
            IDVARVAL: seq,
            QNAM: "AESDRUG",
            QLABEL: "Suspected Drug (WHODrug demo)",
            QVAL: e.whodrugName as string,
          }));
      }
    }

    const csv = toCsv(headers, rows);
    return new Response(csv, {
      headers: {
        "Content-Type": download ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
        ...(download ? { "Content-Disposition": `attachment; filename="${domain}.csv"` } : {}),
        "X-Excluded-No-Consent": String(excludedCount),
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return new Response(err.message + "\n", {
        status: err.status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    console.error("SDTM export failed:", err);
    return new Response("SDTM export failed. Check server logs.\n", { status: 500 });
  }
}