"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { CTMSUser } from "@/lib/schema";
import { computeTrialAlert, splitReasonsForRole } from "@/lib/alertRules";
import SaeClockPanel from "./SaeClockPanel";
import DataExchangePanel from "./DataExchangePanel";
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

const roleMsgStyle = {
  marginTop: 18,
  padding: "12px 16px",
  borderRadius: 10,
  background: "var(--ui-brand-soft)",
  color: "var(--ui-text)",
  border: "1px solid var(--ui-border)",
  fontSize: 14,
} as const;

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

  // Live updates: dashboard numbers and trial table refresh when data changes
  useEffect(() => {
    if (!user) return;
    const unsubTrials = onSnapshot(
      collection(db, "trials"),
      (snap) => {
        setTrials(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Trial, "id">) })));
      },
      (err) => console.error("Live trials listener failed:", err)
    );
    const unsubParticipants = onSnapshot(
      collection(db, "participants"),
      (snap) => setParticipantCount(snap.size),
      (err) => console.error("Live participants listener failed:", err)
    );
    const unsubEvents = onSnapshot(
      collection(db, "adverse_events"),
      (snap) => setAdverseEventCount(snap.size),
      (err) => console.error("Live adverse events listener failed:", err)
    );
    return () => {
      unsubTrials();
      unsubParticipants();
      unsubEvents();
    };
  }, [user]);

  if (loading) {
    return (
      <AppShell title="Loading...">
        <p className="muted">Loading...</p>
      </AppShell>
    );
  }
  if (!user) return null;

  const role = user.role;

  // Compute alerts for every trial once loaded
  const trialAlerts = trials.map((trial) => ({
    trial,
    alert: computeTrialAlert(trial),
  }));
  const flaggedCount = trialAlerts.filter((t) => t.alert.level !== "none").length;

  const alertBadgeClass = (level: "red" | "yellow" | "none") => {
    if (level === "red") return "badge badge-red";
    if (level === "yellow") return "badge badge-yellow";
    return "badge badge-green";
  };

  return (
    <AppShell
      title={`Welcome, ${user.displayName}`}
      subtitle="Portfolio overview: trials, safety and compliance at a glance"
      userLabel={user.displayName}
      role={role}
    >
      {/* Role-specific summary panel */}
      <div className="grid-kpi">
        <div className="card">
          <div className="kpi-label">Trials</div>
          <div className="kpi-value">{trials.length}</div>
          <div className="kpi-note">All statuses</div>
        </div>
        <div className="card">
          <div className="kpi-label">Total Participants</div>
          <div className="kpi-value">{participantCount}</div>
        </div>
        {(role === "PI" || role === "PV_OFFICER" || role === "ADMIN") && (
          <div className="card" style={{ borderColor: "var(--ui-red-border)" }}>
            <div className="kpi-label">Adverse Events</div>
            <div className="kpi-value" style={{ color: "var(--ui-red-text)" }}>
              {adverseEventCount}
            </div>
          </div>
        )}
        <div className="card" style={{ borderColor: "var(--ui-yellow-border)" }}>
          <div className="kpi-label">Trials Flagged</div>
          <div className="kpi-value" style={{ color: "var(--ui-yellow-text)" }}>
            {flaggedCount}
          </div>
          <div className="kpi-note">Red or yellow alert</div>
        </div>
      </div>

      {/* Role-specific message */}
      {role === "PI" && (
        <p style={roleMsgStyle}>
          As Principal Investigator, you have full oversight of trial progress, participant enrollment, and safety signals across all sites.
        </p>
      )}
      {role === "COORDINATOR" && (
        <p style={roleMsgStyle}>
          As Coordinator, focus on participant enrollment, consent management, and day-to-day trial operations.
        </p>
      )}
      {role === "PV_OFFICER" && (
        <p style={roleMsgStyle}>
          As Pharmacovigilance Officer, adverse event monitoring is your primary responsibility. Review the Adverse Events Log regularly.
        </p>
      )}
      {role === "ADMIN" && (
        <p style={roleMsgStyle}>
          As Admin, you have full platform access including user management and audit oversight.
        </p>
      )}
      {role === "EC_MEMBER" && (
        <p style={roleMsgStyle}>
          As an Ethics Committee Member, your focus is trial approvals, ethics renewals, and protocol compliance. Review flagged ethics issues below.
        </p>
      )}
      {role === "DSMB_MEMBER" && (
        <p style={roleMsgStyle}>
          As a DSMB Member, you oversee participant safety and trial data integrity. Review adverse event trends and enrollment safety signals below.
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <SaeClockPanel role={role} />
      </div>
      <div style={{ marginTop: 24 }}>
        <DataExchangePanel role={role} />
      </div>

      <h2 className="ui-section-title">Trials</h2>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 14 }}>
        Click a trial to view its full details, participants, and adverse events.
      </p>
      {trialsLoading ? (
        <p className="muted">Loading trials...</p>
      ) : trials.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No trials found.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Trial Name</th>
                <th>Phase</th>
                <th>Status</th>
                <th>CTRI Status</th>
                <th>Enrollment</th>
                <th>Alert</th>
              </tr>
            </thead>
            <tbody>
              {trialAlerts.map(({ trial, alert }) => {
                const { visible, routedElsewhereCount } = splitReasonsForRole(alert.reasons, role);
                return (
                  <tr
                    key={trial.id}
                    onClick={() => router.push(`/dashboard/${trial.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ fontWeight: 600 }}>{trial.name}</td>
                    <td>{trial.phase}</td>
                    <td>{trial.status}</td>
                    <td>{trial.ctriRegistrationStatus}</td>
                    <td>
                      {trial.enrollmentCurrent} / {trial.enrollmentTarget}
                    </td>
                    <td>
                      <span className={alertBadgeClass(alert.level)}>
                        {alert.level === "none" ? "OK" : alert.level.toUpperCase()}
                      </span>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {visible.map((r) => r.message).join("; ")}
                        {routedElsewhereCount > 0 && (
                          <span style={{ fontStyle: "italic" }}>
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
        </div>
      )}
    </AppShell>
  );
}
