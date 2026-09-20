"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { computeTrialAlert } from "@/lib/alertRules";
import AppShell from "@/components/AppShell";

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

const TONE_CLASS: Record<Tone, string> = {
  red: "badge badge-red",
  yellow: "badge badge-yellow",
  green: "badge badge-green",
  grey: "badge badge-grey",
};

function Chip({ tone, text }: { tone: Tone; text: string }) {
  return <span className={TONE_CLASS[tone]}>{text}</span>;
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

  const card = (label: string, value: number, borderVar: string, valueVar: string) => (
    <div className="card" style={{ borderColor: `var(${borderVar})` }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color: `var(${valueVar})` }}>{value}</div>
    </div>
  );

  return (
    <AppShell
      title="CTRI & Ethics Tracker"
      subtitle="Registration and ethics-approval status for every trial. Flags use the same rules as the dashboard alert engine. Click a trial to open its details."
    >
      {loading ? (
        <p className="muted" style={{ marginTop: 18 }}>Loading trials...</p>
      ) : error ? (
        <div className="card" style={{ marginTop: 18, borderColor: "var(--ui-red-border)" }}>
          <p style={{ margin: 0, color: "var(--ui-red-text)", fontWeight: 600 }}>{error}</p>
        </div>
      ) : trials.length === 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="muted" style={{ margin: 0 }}>No trials found.</p>
        </div>
      ) : (
        <>
          <div className="grid-kpi">
            {card("CTRI issues", ctriIssues, "--ui-red-border", "--ui-red-text")}
            {card("Ethics overdue", ethicsOverdue, "--ui-red-border", "--ui-red-text")}
            {card("Ethics due soon", ethicsSoon, "--ui-yellow-border", "--ui-yellow-text")}
            {card("All clear", allClear, "--ui-green-border", "--ui-green-text")}
          </div>

          <h2 className="ui-section-title">Trials, worst first</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Trial</th>
                  <th>Status</th>
                  <th>CTRI registration</th>
                  <th>Ethics approved</th>
                  <th>Renewal due</th>
                  <th>Days left</th>
                  <th>Ethics status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ trial, ctriReason, days, ethicsTone, ethicsText }) => (
                  <tr
                    key={trial.id}
                    onClick={() => router.push(`/dashboard/${trial.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ fontWeight: 600 }}>{trial.name}</td>
                    <td>{trial.status}</td>
                    <td>
                      <Chip
                        tone={ctriReason ? "red" : "green"}
                        text={trial.ctriRegistrationStatus || "Not recorded"}
                      />
                      {ctriReason && (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {ctriReason.message}
                        </div>
                      )}
                    </td>
                    <td>{trial.ethicsApprovalDate || "Not recorded"}</td>
                    <td>{trial.ethicsRenewalDueDate || "Not recorded"}</td>
                    <td>
                      {days === null ? "-" : days < 0 ? `${Math.abs(days)} overdue` : days}
                    </td>
                    <td>
                      <Chip tone={ethicsTone} text={ethicsText} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}
