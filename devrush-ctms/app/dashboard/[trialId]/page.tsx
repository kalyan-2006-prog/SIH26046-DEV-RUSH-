"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
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

interface Participant {
  id: string;
  name: string;
  trialId: string;
  siteId: string;
  enrollmentDate: string;
  consentStatus: string;
  dpdpConsentGiven: boolean;
}

interface AdverseEvent {
  id: string;
  participantId: string;
  description: string;
  severity: string;
  reportedBy: string;
  reportedAt: { seconds: number; nanoseconds: number } | null;
}

function alertBadgeClass(level: "red" | "yellow" | "none") {
  if (level === "red") return "badge badge-red";
  if (level === "yellow") return "badge badge-yellow";
  return "badge badge-green";
}

function severityBadgeClass(severity: string) {
  if (severity === "Severe" || severity === "Life-threatening") return "badge badge-red";
  if (severity === "Moderate") return "badge badge-yellow";
  return "badge badge-grey";
}

function consentBadgeClass(status: string) {
  return status === "Active" ? "badge badge-green" : "badge badge-grey";
}

export default function TrialDrilldownPage() {
  const router = useRouter();
  const params = useParams();
  const trialId = params.trialId as string;

  const [loading, setLoading] = useState(true);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [adverseEvents, setAdverseEvents] = useState<Array<AdverseEvent & { participantName: string }>>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

      try {
        // Fetch the trial itself
        const trialSnap = await getDoc(doc(db, "trials", trialId));
        if (trialSnap.exists()) {
          setTrial({ id: trialSnap.id, ...(trialSnap.data() as Omit<Trial, "id">) });
        }

        // Fetch participants belonging to this trial
        const participantsQuery = query(
          collection(db, "participants"),
          where("trialId", "==", trialId)
        );
        const participantsSnap = await getDocs(participantsQuery);
        const participantsData = participantsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Participant, "id">),
        }));
        setParticipants(participantsData);

        // Build a lookup of participantId -> name for this trial only
        const participantIds = new Set(participantsData.map((p) => p.id));
        const nameById = new Map(participantsData.map((p) => [p.id, p.name]));

        // Fetch ALL adverse events, then filter down to ones belonging
        // to this trial's participants (adverse_events has no trialId field)
        const aeSnap = await getDocs(collection(db, "adverse_events"));
        const aeData = aeSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AdverseEvent, "id">) }))
          .filter((ev) => participantIds.has(ev.participantId))
          .map((ev) => ({
            ...ev,
            participantName: nameById.get(ev.participantId) || "Unknown",
          }));
        setAdverseEvents(aeData);
      } catch (err) {
        console.error("Failed to fetch trial drilldown data:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router, trialId]);

  if (loading) {
    return (
      <AppShell title="Loading...">
        <p className="muted">Loading trial data...</p>
      </AppShell>
    );
  }
  if (!trial) {
    return (
      <AppShell title="Trial not found">
        <div className="card" style={{ marginTop: 18 }}>
          <p style={{ margin: 0 }}>Trial not found.</p>
          <p style={{ margin: "8px 0 0" }}>
            <a href="/dashboard" style={{ color: "var(--ui-brand)", fontWeight: 600 }}>
              &larr; Back to Dashboard
            </a>
          </p>
        </div>
      </AppShell>
    );
  }

  const alert = computeTrialAlert(trial);

  const facts: Array<{ label: string; value: string }> = [
    { label: "Phase", value: String(trial.phase) },
    { label: "Status", value: String(trial.status) },
    { label: "CTRI Status", value: String(trial.ctriRegistrationStatus) },
    { label: "Enrollment", value: `${trial.enrollmentCurrent} / ${trial.enrollmentTarget}` },
    { label: "Ethics Approved", value: trial.ethicsApprovalDate || "—" },
    { label: "Ethics Renewal Due", value: trial.ethicsRenewalDueDate || "—" },
  ];

  return (
    <AppShell title={trial.name} subtitle="Trial detail">
      <p style={{ margin: "10px 0 0" }}>
        <a href="/dashboard" style={{ fontSize: 14, color: "var(--ui-muted)" }}>
          &larr; Back to Dashboard
        </a>
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 14 }}>
        <span className={alertBadgeClass(alert.level)}>
          {alert.level === "none" ? "OK" : alert.level.toUpperCase()}
        </span>
        <span className="muted">{alert.reasons.join("; ")}</span>
      </div>

      <div className="grid-kpi">
        {facts.map((f) => (
          <div className="card" key={f.label}>
            <div className="kpi-label">{f.label}</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>{f.value}</div>
          </div>
        ))}
      </div>

      <h2 className="ui-section-title">Participants ({participants.length})</h2>
      {participants.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No participants enrolled in this trial yet.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Enrollment Date</th>
                <th>Consent Status</th>
                <th>DPDP Consent</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{new Date(p.enrollmentDate).toLocaleDateString()}</td>
                  <td>
                    <span className={consentBadgeClass(p.consentStatus)}>{p.consentStatus}</span>
                  </td>
                  <td>
                    <span className={p.dpdpConsentGiven ? "badge badge-green" : "badge badge-yellow"}>
                      {p.dpdpConsentGiven ? "Given" : "Not Given"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="ui-section-title">Adverse Events ({adverseEvents.length})</h2>
      {adverseEvents.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>No adverse events reported for this trial.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Reported At</th>
                <th>Participant</th>
                <th>Description</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {adverseEvents.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    {ev.reportedAt
                      ? new Date(ev.reportedAt.seconds * 1000).toLocaleString()
                      : "—"}
                  </td>
                  <td>{ev.participantName}</td>
                  <td>{ev.description}</td>
                  <td>
                    <span className={severityBadgeClass(ev.severity)}>{ev.severity}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
