"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { computeSaeClock, isSeriousCandidate } from "@/lib/saeClock";

interface SaeRow {
  id: string;
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
const COLORS = { red: "#c0392b", yellow: "#f1c40f", ok: "#27ae60" };

export default function SaeClockPanel({ role }: { role: string }) {
  const allowed = ALLOWED_ROLES.includes(role);
  const [rows, setRows] = useState<SaeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!allowed) return;

    async function load() {
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
          const trialId = participantTrial.get(data.participantId || "") || "";
          list.push({
            id: d.id,
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

    load();
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, [allowed]);

  if (!allowed) {
    return (
      <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "1rem" }}>
        SAE reporting-clock alerts are routed to the PI and Pharmacovigilance Officer.
      </p>
    );
  }

  const withClock = rows
    .map((r) => ({ ...r, clock: computeSaeClock(r.reportedAt, now) }))
    .sort((a, b) => a.clock.hoursRemaining - b.clock.hoursRemaining);

  return (
    <div style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #c0392b", borderRadius: "8px" }}>
      <h2 style={{ marginTop: 0 }}>SAE Reporting Clock</h2>
      <p style={{ fontSize: "0.85rem", color: "#888" }}>
        Serious adverse events (Severe / Life-threatening) awaiting regulatory submission.
      </p>
      {loading ? (
        <p>Loading...</p>
      ) : withClock.length === 0 ? (
        <p style={{ color: "#27ae60" }}>No serious events awaiting submission.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #444" }}>
              <th style={{ padding: "0.4rem" }}>Event</th>
              <th style={{ padding: "0.4rem" }}>Trial</th>
              <th style={{ padding: "0.4rem" }}>Severity</th>
              <th style={{ padding: "0.4rem" }}>Clock</th>
            </tr>
          </thead>
          <tbody>
            {withClock.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid #333" }}>
                <td style={{ padding: "0.4rem" }}>{r.term}</td>
                <td style={{ padding: "0.4rem" }}>{r.trialName}</td>
                <td style={{ padding: "0.4rem" }}>{r.severity}</td>
                <td style={{ padding: "0.4rem" }}>
                  <span
                    style={{
                      backgroundColor: COLORS[r.clock.level],
                      color: r.clock.level === "yellow" ? "#1a1a1a" : "#fff",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                    }}
                  >
                    {r.clock.label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}