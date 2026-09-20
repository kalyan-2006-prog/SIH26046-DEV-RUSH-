"use client";
import { postAudit } from "@/lib/postAudit";

import { authHeaders } from "@/lib/authHeaders";
import { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { computeSaeClock, isSeriousCandidate } from "@/lib/saeClock";

interface SaeRow {
  id: string;
  participantId: string;
  trialName: string;
  term: string;
  severity: string;
  reportedAt: Date;
}

interface AeData {
  participantId?: string;
  severity?: string;
  meddraTerm?: string;
  reportedAt?: { toDate?: () => Date } | null;
  regulatorySubmittedAt?: unknown;
}

const ALLOWED_ROLES = ["PI", "PV_OFFICER", "ADMIN"];
const CLOCK_BADGE = {
  red: "badge badge-red",
  yellow: "badge badge-yellow",
  ok: "badge badge-green",
};

export default function SaeClockPanel({ role }: { role: string }) {
  const allowed = ALLOWED_ROLES.includes(role);
  const [rows, setRows] = useState<SaeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setCurrentUserId(firebaseUser ? firebaseUser.uid : null);
    });
    return () => unsubscribe();
  }, []);

  async function loadRows() {
    try {
      const [trialSnap, participantSnap, aeSnap] = await Promise.all([
        getDocs(collection(db, "trials")),
        getDocs(collection(db, "participants")),
        getDocs(collection(db, "adverse_events")),
      ]);

      const trialNames = new Map<string, string>(
        trialSnap.docs.map((d) => [d.id, (d.data() as { name?: string }).name || d.id] as [string, string])
      );
      const participantTrial = new Map<string, string>(
        participantSnap.docs.map((d) => [d.id, (d.data() as { trialId?: string }).trialId || ""] as [string, string])
      );

      const list: SaeRow[] = [];
      for (const d of aeSnap.docs) {
        const data = d.data() as AeData;
        if (!isSeriousCandidate(data.severity)) continue;
        if (data.regulatorySubmittedAt) continue; // already reported
        const reportedAt = data.reportedAt?.toDate?.();
        if (!reportedAt) continue;
        const participantId = data.participantId || "";
        const trialId = participantTrial.get(participantId) || "";
        list.push({
          id: d.id,
          participantId,
          trialName: trialNames.get(trialId) || "Unknown trial",
          term: data.meddraTerm || "Unspecified event",
          severity: data.severity || "",
          reportedAt,
        });
      }
      setRows(list);
    } catch (err) {
      console.error("Failed to load SAE clock data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!allowed) return;
    loadRows();
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, [allowed]);

  async function handleMarkSubmitted(row: SaeRow) {
    if (!currentUserId) return;
    setSubmittingId(row.id);

    try {
      await updateDoc(doc(db, "adverse_events", row.id), {
        regulatorySubmittedAt: new Date(),
      });

      await postAudit(await authHeaders(), {
        action: "SAE_REGULATORY_SUBMITTED",
        participantId: row.participantId,
        performedBy: currentUserId,
        details: `Regulatory submission recorded for "${row.term}" (${row.severity}) — ${row.trialName}`,
      });

      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      console.error("Failed to mark SAE as submitted:", err);
      alert("Failed to mark as submitted. Check console for details.");
    } finally {
      setSubmittingId(null);
    }
  }

  if (!allowed) {
    return (
      <p className="muted" style={{ fontSize: 14, margin: 0 }}>
        SAE reporting-clock alerts are routed to the PI and Pharmacovigilance Officer.
      </p>
    );
  }

  const withClock = rows
    .map((r) => ({ ...r, clock: computeSaeClock(r.reportedAt, now) }))
    .sort((a, b) => a.clock.hoursRemaining - b.clock.hoursRemaining);

  return (
    <div className="card" style={{ borderColor: "var(--ui-red-border)" }}>
      <h2 style={{ fontSize: 18, fontWeight: 650, margin: 0 }}>SAE Reporting Clock</h2>
      <p className="muted" style={{ margin: "2px 0 12px", fontSize: 14 }}>
        Serious adverse events (Severe / Life-threatening) awaiting regulatory submission.
      </p>
      {loading ? (
        <p className="muted" style={{ margin: 0 }}>Loading...</p>
      ) : withClock.length === 0 ? (
        <p style={{ margin: 0 }}>
          <span className="badge badge-green">No serious events awaiting submission</span>
        </p>
      ) : (
        <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Trial</th>
                <th>Severity</th>
                <th>Clock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {withClock.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.term}</td>
                  <td>{r.trialName}</td>
                  <td>
                    <span className="badge badge-red">{r.severity}</span>
                  </td>
                  <td>
                    <span className={CLOCK_BADGE[r.clock.level]}>{r.clock.label}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleMarkSubmitted(r)}
                      disabled={submittingId === r.id}
                    >
                      {submittingId === r.id ? "Submitting..." : "Mark as submitted"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
