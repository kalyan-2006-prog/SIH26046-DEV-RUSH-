"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
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

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;
  if (!trial) return <div style={{ padding: "2rem" }}>Trial not found.</div>;

  const alert = computeTrialAlert(trial);

  const badgeStyle = (level: "red" | "yellow" | "none") => {
    if (level === "red") {
      return { backgroundColor: "#c0392b", color: "#fff", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: "bold" as const };
    }
    if (level === "yellow") {
      return { backgroundColor: "#f1c40f", color: "#1a1a1a", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: "bold" as const };
    }
    return { backgroundColor: "#27ae60", color: "#fff", padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", fontWeight: "bold" as const };
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

      <a href="/dashboard" style={{ fontSize: "0.85rem", color: "#888" }}>&larr; Back to Dashboard</a>

      <h1 style={{ marginTop: "0.5rem" }}>{trial.name}</h1>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <span style={badgeStyle(alert.level)}>
          {alert.level === "none" ? "OK" : alert.level.toUpperCase()}
        </span>
        <span style={{ color: "#888" }}>{alert.reasons.join("; ")}</span>
      </div>

      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <div style={{ padding: "1rem", border: "1px solid #444", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>Phase</p>
          <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: "bold" }}>{trial.phase}</p>
        </div>
        <div style={{ padding: "1rem", border: "1px solid #444", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>Status</p>
          <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: "bold" }}>{trial.status}</p>
        </div>
        <div style={{ padding: "1rem", border: "1px solid #444", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>CTRI Status</p>
          <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: "bold" }}>{trial.ctriRegistrationStatus}</p>
        </div>
        <div style={{ padding: "1rem", border: "1px solid #444", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>Enrollment</p>
          <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: "bold" }}>
            {trial.enrollmentCurrent} / {trial.enrollmentTarget}
          </p>
        </div>
        <div style={{ padding: "1rem", border: "1px solid #444", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>Ethics Approved</p>
          <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: "bold" }}>
            {trial.ethicsApprovalDate || "—"}
          </p>
        </div>
        <div style={{ padding: "1rem", border: "1px solid #444", borderRadius: "8px", minWidth: "160px" }}>
          <p style={{ margin: 0, color: "#888" }}>Ethics Renewal Due</p>
          <p style={{ margin: 0, fontSize: "1.25rem", fontWeight: "bold" }}>
            {trial.ethicsRenewalDueDate || "—"}
          </p>
        </div>
      </div>

      <h2>Participants ({participants.length})</h2>
      {participants.length === 0 ? (
        <p>No participants enrolled in this trial yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>Name</th>
              <th style={{ padding: "0.5rem" }}>Enrollment Date</th>
              <th style={{ padding: "0.5rem" }}>Consent Status</th>
              <th style={{ padding: "0.5rem" }}>DPDP Consent</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>{p.name}</td>
                <td style={{ padding: "0.5rem" }}>
                  {new Date(p.enrollmentDate).toLocaleDateString()}
                </td>
                <td style={{ padding: "0.5rem" }}>{p.consentStatus}</td>
                <td style={{ padding: "0.5rem" }}>{p.dpdpConsentGiven ? "Given" : "Not Given"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Adverse Events ({adverseEvents.length})</h2>
      {adverseEvents.length === 0 ? (
        <p>No adverse events reported for this trial.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>Reported At</th>
              <th style={{ padding: "0.5rem" }}>Participant</th>
              <th style={{ padding: "0.5rem" }}>Description</th>
              <th style={{ padding: "0.5rem" }}>Severity</th>
            </tr>
          </thead>
          <tbody>
            {adverseEvents.map((ev) => (
              <tr key={ev.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  {ev.reportedAt
                    ? new Date(ev.reportedAt.seconds * 1000).toLocaleString()
                    : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>{ev.participantName}</td>
                <td style={{ padding: "0.5rem" }}>{ev.description}</td>
                <td style={{ padding: "0.5rem" }}>{ev.severity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}