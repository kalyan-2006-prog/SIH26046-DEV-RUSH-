"use client";
import { postAudit } from "@/lib/postAudit";

import { authHeaders } from "@/lib/authHeaders";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy, doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { CTMSUser } from "@/lib/schema";

interface AdverseEvent {
  id: string;
  participantId: string;
  description: string;
  severity: string;
  reportedBy: string;
  reportedAt: { seconds: number; nanoseconds: number } | null;
  meddraCode?: string;
  meddraTerm?: string;
  meddraSoc?: string;
  signedOffBy?: string;
  signedOffAt?: { seconds: number; nanoseconds: number } | null;
}

const SIGNOFF_ROLES = ["PI", "PV_OFFICER", "ADMIN"];

export default function AdverseEventsListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<(AdverseEvent & { participantName: string })[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [signingId, setSigningId] = useState<string | null>(null);

  async function loadEvents() {
    try {
      const q = query(collection(db, "adverse_events"), orderBy("reportedAt", "desc"));
      const snapshot = await getDocs(q);
      const rawEvents = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AdverseEvent, "id">),
      }));

      const withNames = await Promise.all(
        rawEvents.map(async (ev) => {
          const pSnap = await getDoc(doc(db, "participants", ev.participantId));
          const participantName = pSnap.exists()
            ? (pSnap.data() as { name: string }).name
            : "Unknown";
          return { ...ev, participantName };
        })
      );

      setEvents(withNames);
    } catch (err) {
      console.error("Failed to fetch adverse events:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      setCurrentUserId(firebaseUser.uid);

      const userSnap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (userSnap.exists()) {
        setRole((userSnap.data() as CTMSUser).role);
      }

      await loadEvents();
    });
    return () => unsubscribe();
  }, [router]);

  async function handleSignOff(ev: AdverseEvent & { participantName: string }) {
    if (!currentUserId) return;
    setSigningId(ev.id);

    try {
      await updateDoc(doc(db, "adverse_events", ev.id), {
        signedOffBy: currentUserId,
        signedOffAt: new Date(),
      });

      await postAudit(await authHeaders(), {
        action: "AE_SIGNED_OFF",
        participantId: ev.participantId,
        performedBy: currentUserId,
        details: `Electronic sign-off recorded for "${ev.meddraTerm || "adverse event"}" (${ev.severity}) — ${ev.participantName}`,
      });

      setEvents((prev) =>
        prev.map((e) =>
          e.id === ev.id
            ? { ...e, signedOffBy: currentUserId, signedOffAt: { seconds: Date.now() / 1000, nanoseconds: 0 } }
            : e
        )
      );
    } catch (err) {
      console.error("Failed to sign off:", err);
      alert("Failed to sign off. Check console for details.");
    } finally {
      setSigningId(null);
    }
  }

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;

  const canSignOff = SIGNOFF_ROLES.includes(role);

  return (
    <div style={{ padding: "2rem" }}>
      <nav style={{ marginBottom: "1.5rem" }}>
        <a href="/dashboard" style={{ marginRight: "1rem" }}>Dashboard</a>
        <a href="/participants" style={{ marginRight: "1rem" }}>Participants</a>
        <a href="/audit-logs" style={{ marginRight: "1rem" }}>Audit Logs</a>
        <a href="/adverse-events" style={{ marginRight: "1rem" }}>Report Event</a>
        <a href="/adverse-events/list">Adverse Events Log</a>
      </nav>
      <h1>Adverse Events</h1>
      {events.length === 0 ? (
        <p>No adverse events reported yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>Reported At</th>
              <th style={{ padding: "0.5rem" }}>Participant</th>
              <th style={{ padding: "0.5rem" }}>MedDRA Term</th>
              <th style={{ padding: "0.5rem" }}>Narrative</th>
              <th style={{ padding: "0.5rem" }}>Severity</th>
              <th style={{ padding: "0.5rem" }}>Sign-off</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  {ev.reportedAt
                    ? new Date(ev.reportedAt.seconds * 1000).toLocaleString()
                    : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>{ev.participantName}</td>
                <td style={{ padding: "0.5rem" }}>
                  {ev.meddraTerm ? (
                    <>
                      <div style={{ fontWeight: "bold" }}>{ev.meddraTerm}</div>
                      <div style={{ fontSize: "0.75rem", color: "#888" }}>
                        {ev.meddraSoc} ({ev.meddraCode})
                      </div>
                    </>
                  ) : (
                    <span style={{ color: "#888" }}>Not coded</span>
                  )}
                </td>
                <td style={{ padding: "0.5rem" }}>{ev.description || "—"}</td>
                <td style={{ padding: "0.5rem" }}>{ev.severity}</td>
                <td style={{ padding: "0.5rem" }}>
                  {ev.signedOffBy ? (
                    <span style={{ color: "#27ae60", fontSize: "0.8rem" }}>
                      ✓ Signed off
                      {ev.signedOffAt && (
                        <div style={{ fontSize: "0.7rem", color: "#888" }}>
                          {new Date(ev.signedOffAt.seconds * 1000).toLocaleString()}
                        </div>
                      )}
                    </span>
                  ) : canSignOff ? (
                    <button
                      onClick={() => handleSignOff(ev)}
                      disabled={signingId === ev.id}
                      style={{
                        padding: "0.3rem 0.7rem",
                        fontSize: "0.75rem",
                        backgroundColor: "#27ae60",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: signingId === ev.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {signingId === ev.id ? "Signing..." : "Sign off"}
                    </button>
                  ) : (
                    <span style={{ color: "#888", fontSize: "0.75rem" }}>Pending review</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}