"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { computeTrialAlert } from "@/lib/alertRules";

interface Trial {
  id: string;
  name: string;
  phase: string;
  status: string;
  enrollmentTarget: number;
  enrollmentCurrent: number;
  ctriRegistrationStatus: string;
  ethicsApprovalDate?: string;
  ethicsRenewalDueDate?: string;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Same day-count formula as lib/alertRules.ts so the two never disagree.
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / MS_PER_DAY);
}

type Tone = "red" | "yellow" | "green" | "grey";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  red: { bg: "#c0392b", fg: "#ffffff" },
  yellow: { bg: "#f1c40f", fg: "#1a1a1a" },
  green: { bg: "#27ae60", fg: "#ffffff" },
  grey: { bg: "#7f8c8d", fg: "#ffffff" },
};

function Chip({ tone, text }: { tone: Tone; text: string }) {
  return (
    <span
      style={{
        backgroundColor: TONES[tone].bg,
        color: TONES[tone].fg,
        padding: "0.2rem 0.6rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: "bold",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export default function CtriEthicsPage() {
  const router = useRouter();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      try {
        const snap = await getDocs(collection(db, "trials"));
        setTrials(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Trial, "id">) }))
        );
      } catch (err) {
        console.error("Failed to load trials:", err);
        setError("Could not load trials.");
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const rows = trials
    .map((trial) => {
      const alert = computeTrialAlert(trial);
      const ctriReason = alert.reasons.find((r) => r.category === "CTRI");
      const ethicsReason = alert.reasons.find((r) => r.category === "ETHICS");
      const days = daysUntil(trial.ethicsRenewalDueDate);
      const ethicsTone: Tone = ethicsReason
        ? ethicsReason.level
        : days === null
        ? "grey"
        : "green";
      const ethicsText = ethicsReason
        ? ethicsReason.level === "red"
          ? "Renewal overdue"
          : "Renewal due soon"
        : days === null
        ? "No renewal date"
        : "OK";
      const rank =
        ctriReason || ethicsReason?.level === "red"
          ? 0
          : ethicsReason?.level === "yellow"
          ? 1
          : 2;
      return { trial, ctriReason, ethicsReason, days, ethicsTone, ethicsText, rank };
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const da = a.days === null ? Number.MAX_SAFE_INTEGER : a.days;
      const dbb = b.days === null ? Number.MAX_SAFE_INTEGER : b.days;
      return da - dbb;
    });

  const ctriIssues = rows.filter((r) => r.ctriReason).length;
  const ethicsOverdue = rows.filter((r) => r.ethicsReason?.level === "red").length;
  const ethicsSoon = rows.filter((r) => r.ethicsReason?.level === "yellow").length;
  const allClear = rows.filter((r) => !r.ctriReason && !r.ethicsReason).length;

  const card = (label: string, value: number, border: string) => (
    <div
      style={{
        padding: "1rem",
        border: `1px solid ${border}`,
        borderRadius: "8px",
        minWidth: "160px",
      }}
    >
      <p style={{ margin: 0, color: "#888" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold" }}>{value}</p>
    </div>
  );

  return (
    <div style={{ padding: "2rem" }}>
      <nav style={{ marginBottom: "1.5rem" }}>
        <a href="/dashboard" style={{ marginRight: "1rem" }}>Dashboard</a>
        <a href="/participants" style={{ marginRight: "1rem" }}>Participants</a>
        <a href="/audit-logs" style={{ marginRight: "1rem" }}>Audit Logs</a>
        <a href="/ctri-ethics" style={{ marginRight: "1rem" }}>CTRI / Ethics</a>
        <a href="/adverse-events" style={{ marginRight: "1rem" }}>Report Event</a>
        <a href="/adverse-events/list">Adverse Events Log</a>
      </nav>

      <h1>CTRI &amp; Ethics Tracker</h1>
      <p style={{ fontSize: "0.85rem", color: "#888" }}>
        Registration and ethics-approval status for every trial. Flags use the same rules as the
        dashboard alert engine. Click a trial to open its details.
      </p>

      {loading ? (
        <p>Loading trials...</p>
      ) : error ? (
        <p>{error}</p>
      ) : trials.length === 0 ? (
        <p>No trials found.</p>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              margin: "1.5rem 0",
              flexWrap: "wrap",
            }}
          >
            {card("CTRI issues", ctriIssues, "#c0392b")}
            {card("Ethics overdue", ethicsOverdue, "#c0392b")}
            {card("Ethics due soon", ethicsSoon, "#f1c40f")}
            {card("All clear", allClear, "#27ae60")}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
                  <th style={{ padding: "0.5rem" }}>Trial</th>
                  <th style={{ padding: "0.5rem" }}>Status</th>
                  <th style={{ padding: "0.5rem" }}>CTRI registration</th>
                  <th style={{ padding: "0.5rem" }}>Ethics approved</th>
                  <th style={{ padding: "0.5rem" }}>Renewal due</th>
                  <th style={{ padding: "0.5rem" }}>Days left</th>
                  <th style={{ padding: "0.5rem" }}>Ethics status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ trial, ctriReason, days, ethicsTone, ethicsText }) => (
                  <tr
                    key={trial.id}
                    onClick={() => router.push(`/dashboard/${trial.id}`)}
                    style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}
                  >
                    <td style={{ padding: "0.5rem" }}>{trial.name}</td>
                    <td style={{ padding: "0.5rem" }}>{trial.status}</td>
                    <td style={{ padding: "0.5rem" }}>
                      <Chip
                        tone={ctriReason ? "red" : "green"}
                        text={trial.ctriRegistrationStatus || "Not recorded"}
                      />
                      {ctriReason && (
                        <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.25rem" }}>
                          {ctriReason.message}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.5rem" }}>{trial.ethicsApprovalDate || "Not recorded"}</td>
                    <td style={{ padding: "0.5rem" }}>{trial.ethicsRenewalDueDate || "Not recorded"}</td>
                    <td style={{ padding: "0.5rem" }}>
                      {days === null ? "-" : days < 0 ? `${Math.abs(days)} overdue` : days}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <Chip tone={ethicsTone} text={ethicsText} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
