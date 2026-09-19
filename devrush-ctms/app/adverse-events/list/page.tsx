"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy, doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

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
}

export default function AdverseEventsListPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<(AdverseEvent & { participantName: string })[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

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
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;

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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}