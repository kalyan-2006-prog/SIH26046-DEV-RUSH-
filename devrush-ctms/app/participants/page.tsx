"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface Participant {
  id: string;
  name: string;
  trialId: string;
  siteId: string;
  enrollmentDate: string;
  consentStatus: string;
  dpdpConsentGiven: boolean;
}

export default function ParticipantsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

      try {
        const snapshot = await getDocs(collection(db, "participants"));
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Participant, "id">),
        }));
        setParticipants(data);
      } catch (err) {
        console.error("Failed to fetch participants:", err);
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
        <a href="/adverse-events">Adverse Events</a>
      </nav>
      <h1>Participants</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
            <th style={{ padding: "0.5rem" }}>Name</th>
            <th style={{ padding: "0.5rem" }}>Enrollment Date</th>
            <th style={{ padding: "0.5rem" }}>Consent Status</th>
            <th style={{ padding: "0.5rem" }}>DPDP Consent</th>
            <th style={{ padding: "0.5rem" }}>Action</th>
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
              <td style={{ padding: "0.5rem" }}>
                {p.dpdpConsentGiven ? "Given" : "Not Given"}
              </td>
              <td style={{ padding: "0.5rem" }}>
                <button onClick={() => router.push(`/participants/${p.id}`)}>
                  View / Manage Consent
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}