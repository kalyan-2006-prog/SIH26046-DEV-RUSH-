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

const DOMAINS = ["adsl", "adae"] as const;
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

// Study day per CDISC convention: no day 0 (day 1 = treatment start)
function studyDay(eventDate: string, startDate: string): number | "" {
  if (!eventDate || !startDate) return "";
  const diff = Math.round((Date.parse(eventDate) - Date.parse(startDate)) / 86400000);
  return diff >= 0 ? diff + 1 : diff;
}

// NOTE: no authentication on this route yet. Fine for localhost demos.
export async function GET(request: Request) {
  try {
    await requireRole(request, ["PI", "ADMIN", "DATA_MANAGER", "REGULATORY"]);
    const url = new URL(request.url);
    const domain = (url.searchParams.get("domain") || "").toLowerCase() as Domain;
    const download = url.searchParams.get("download") === "1";

    if (!DOMAINS.includes(domain)) {
      return new Response(
        "Use ?domain=adsl or ?domain=adae  (add &download=1 to save as a CSV file)\n",
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

    if (domain === "adsl") {
      headers = ["STUDYID", "USUBJID", "SUBJID", "SITEID", "AGE", "SEX", "TRTSDT", "SAFFL", "DPDPFL"];
      rows = participants.map((p) => ({
        STUDYID: p.trialId as string,
        USUBJID: usubjid(p),
        SUBJID: p.id,
        SITEID: p.siteId || "",
        AGE: "", // not collected in prototype
        SEX: "", // not collected in prototype
        TRTSDT: toDate(p.enrollmentDate), // enrollment date used as start-of-study proxy
        SAFFL: "Y",
        DPDPFL: "Y", // DPDP consent given and not withdrawn
      }));
    } else {
      const trtsdtBySubject = new Map(participants.map((p) => [p.id, toDate(p.enrollmentDate)]));
      const events = allEvents
        .filter((e) => e.participantId && pMap.has(e.participantId))
        .sort((a, b) => toDate(a.reportedAt).localeCompare(toDate(b.reportedAt)) || a.id.localeCompare(b.id));

      const seqBySubject = new Map<string, number>();
      headers = ["STUDYID", "USUBJID", "AESEQ", "AETERM", "AEDECOD", "AEBODSYS", "AESEV", "AESER", "ASTDT", "ASTDY", "TRTEMFL", "SUSPDRG"];
      rows = events.map((e) => {
        const p = pMap.get(e.participantId as string)!;
        const seq = (seqBySubject.get(p.id) || 0) + 1;
        seqBySubject.set(p.id, seq);
        const lifeThreatening = e.severity === "Life-threatening";
        const astdt = toDate(e.reportedAt);
        const trtsdt = trtsdtBySubject.get(p.id) || "";
        return {
          STUDYID: p.trialId as string,
          USUBJID: usubjid(p),
          AESEQ: seq, // same numbering as the SDTM AE dataset
          AETERM: e.meddraTerm || "",
          AEDECOD: e.meddraTerm || "",
          AEBODSYS: e.meddraSoc || "",
          AESEV: lifeThreatening ? "SEVERE" : (e.severity || "").toUpperCase(),
          AESER: lifeThreatening ? "Y" : "N",
          ASTDT: astdt,
          ASTDY: studyDay(astdt, trtsdt),
          TRTEMFL: astdt && trtsdt && astdt >= trtsdt ? "Y" : "N",
          SUSPDRG: e.whodrugName || "",
        };
      });
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
    console.error("ADaM export failed:", err);
    return new Response("ADaM export failed. Check server logs.\n", { status: 500 });
  }
}