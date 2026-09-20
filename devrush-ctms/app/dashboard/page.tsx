"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { CTMSUser } from "@/lib/schema";
import { computeTrialAlert, splitReasonsForRole } from "@/lib/alertRules";
import SaeClockPanel from "./SaeClockPanel";
import DataExchangePanel from "./DataExchangePanel";


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

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<CTMSUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [trialsLoading, setTrialsLoading] = useState(true);
  const [participantCount, setParticipantCount] = useState(0);
  const [adverseEventCount, setAdverseEventCount] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      const snap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (snap.exists()) {
        setUser(snap.data() as CTMSUser);
      }
      setLoading(false);

      try {
        const trialsSnapshot = await getDocs(collection(db, "trials"));
        const data = trialsSnapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Trial, "id">),
        }));
        setTrials(data);

        const participantsSnapshot = await getDocs(collection(db, "participants"));
        setParticipantCount(participantsSnapshot.size);

        const adverseEventsSnapshot = await getDocs(collection(db, "adverse_events"));
        setAdverseEventCount(adverseEventsSnapshot.size);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
      } finally {
        setTrialsLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;
  if (!user) return null;

  const role = user.role;

  // Compute alerts for every trial once loaded
  const trialAlerts = trials.map((trial) => ({
    trial,
    alert: computeTrialAlert(trial),
  }));
  const flaggedCount = trialAlerts.filter((t) => t.alert.level !== "none").length;

  const badgeStyle = (level: "red" | "yellow" | "none") => {
    if (level === "red") {
      return {
        backgroundColor: "#c0392b",
        color: "#fff",
        padding: "0.2rem 0.6rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: "bold" as const,
      };
    }
    if (level === "yellow") {
      return {
        backgroundColor: "#f1c40f",
        color: "#1a1a1a",
        padding: "0.2rem 0.6rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: "bold" as const,
      };
    }
    return {
      backgroundColor: "#27ae60",
      color: "#fff",
      padding: "0.2rem 0.6rem",
      borderRadius: "999px",
      fontSize: "0.75rem",
      fontWeight: "bold" as const,
    };
  };

  return (
    <div style={{ padding: "2rem" }}>
      <nav style={{ marginBottom: "1.5rem" }}>
        <a href="/dashboard" style={{ marginRight: "1rem" }}>Dashboard</a>
        <a href="/participants" style={{ marginRight: "1rem" }}>Participants</a>
        <a href="/audit-logs" style={{ marginRight: "1rem" }}>Audit Logs</a>
        <a href="/adverse-events" style={{ marginRight: "1rem" }}>Report Event</a>
        <a href="/adverse-events/list">Adverse Events Log</a>
      </nav>
      <h1>Welcome, {user.displayName}</h1>
      <p>Role: {role}</p>

      {/* Role-specific summary panel */}
      <div style={{ display: "flex", gap: "1.5rem", marginTop: "1.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ padding: "1rem", border: "1px solid #444", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>Active Trials</p>
          <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold" }}>{trials.length}</p>
        </div>
        <div style={{ padding: "1rem", border: "1px solid #444", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>Total Participants</p>
          <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold" }}>{participantCount}</p>
        </div>
        {(role === "PI" || role === "PV_OFFICER" || role === "ADMIN") && (
          <div style={{ padding: "1rem", border: "1px solid #c0392b", borderRadius: "8px", minWidth: "160px" }}>
            <p style={{ margin: 0, color: "#888" }}>Adverse Events</p>
            <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold", color: "#c0392b" }}>
              {adverseEventCount}
            </p>
          </div>
        )}
        <div style={{ padding: "1rem", border: "1px solid #f1c40f", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>Trials Flagged</p>
          <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold", color: "#f1c40f" }}>
            {flaggedCount}
          </p>
        </div>
      </div>

      {/* Role-specific message */}
      {role === "PI" && (
        <p style={{ color: "#2980b9" }}>
          As Principal Investigator, you have full oversight of trial progress, participant enrollment, and safety signals across all sites.
        </p>
      )}
      {role === "COORDINATOR" && (
        <p style={{ color: "#2980b9" }}>
          As Coordinator, focus on participant enrollment, consent management, and day-to-day trial operations.
        </p>
      )}
      {role === "PV_OFFICER" && (
        <p style={{ color: "#2980b9" }}>
          As Pharmacovigilance Officer, adverse event monitoring is your primary responsibility. Review the Adverse Events Log regularly.
        </p>
      )}
      {role === "ADMIN" && (
        <p style={{ color: "#2980b9" }}>
          As Admin, you have full platform access including user management and audit oversight.
        </p>
      )}
      {role === "EC_MEMBER" && (
        <p style={{ color: "#2980b9" }}>
          As an Ethics Committee Member, your focus is trial approvals, ethics renewals, and protocol compliance. Review flagged ethics issues below.
        </p>
      )}
      {role === "DSMB_MEMBER" && (
        <p style={{ color: "#2980b9" }}>
          As a DSMB Member, you oversee participant safety and trial data integrity. Review adverse event trends and enrollment safety signals below.
        </p>
      )}
      <SaeClockPanel role={role} />
      <DataExchangePanel role={role} />
      <h2 style={{ marginTop: "2rem" }}>Active Trials</h2>
      <p style={{ fontSize: "0.85rem", color: "#888" }}>Click a trial to view its full details, participants, and adverse events.</p>
      {trialsLoading ? (
        <p>Loading trials...</p>
      ) : trials.length === 0 ? (
        <p>No trials found.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>Trial Name</th>
              <th style={{ padding: "0.5rem" }}>Phase</th>
              <th style={{ padding: "0.5rem" }}>Status</th>
              <th style={{ padding: "0.5rem" }}>CTRI Status</th>
              <th style={{ padding: "0.5rem" }}>Enrollment</th>
              <th style={{ padding: "0.5rem" }}>Alert</th>
            </tr>
          </thead>
          <tbody>
            {trialAlerts.map(({ trial, alert }) => {
              const { visible, routedElsewhereCount } = splitReasonsForRole(alert.reasons, role);
              return (
                <tr
                  key={trial.id}
                  onClick={() => router.push(`/dashboard/${trial.id}`)}
                  style={{ borderBottom: "1px solid #eee", cursor: "pointer" }}
                >
                  <td style={{ padding: "0.5rem" }}>{trial.name}</td>
                  <td style={{ padding: "0.5rem" }}>{trial.phase}</td>
                  <td style={{ padding: "0.5rem" }}>{trial.status}</td>
                  <td style={{ padding: "0.5rem" }}>{trial.ctriRegistrationStatus}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {trial.enrollmentCurrent} / {trial.enrollmentTarget}
                  </td>
                  <td style={{ padding: "0.5rem" }}>
                    <span style={badgeStyle(alert.level)}>
                      {alert.level === "none" ? "OK" : alert.level.toUpperCase()}
                    </span>
                    <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.25rem" }}>
                      {visible.map((r) => r.message).join("; ")}
                      {routedElsewhereCount > 0 && (
                        <span style={{ color: "#666", fontStyle: "italic" }}>
                          {visible.length > 0 ? " — " : ""}
                          {routedElsewhereCount} additional issue{routedElsewhereCount > 1 ? "s" : ""} routed to other roles
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}