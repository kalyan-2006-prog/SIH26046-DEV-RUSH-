"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import AppShell from "@/components/AppShell";

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

  if (loading) {
    return (
      <AppShell title="Participants">
        <p className="muted" style={{ marginTop: 18 }}>Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Participants"
      subtitle={`${participants.length} enrolled across all trials. Open a participant to view or manage consent.`}
    >
      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Enrollment Date</th>
              <th>Consent Status</th>
              <th>DPDP Consent</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>{new Date(p.enrollmentDate).toLocaleDateString()}</td>
                <td>
                  <span className={p.consentStatus === "Active" ? "badge badge-green" : "badge badge-grey"}>
                    {p.consentStatus}
                  </span>
                </td>
                <td>
                  <span className={p.dpdpConsentGiven ? "badge badge-green" : "badge badge-yellow"}>
                    {p.dpdpConsentGiven ? "Given" : "Not Given"}
                  </span>
                </td>
                <td>
                  <button className="btn" onClick={() => router.push(`/participants/${p.id}`)}>
                    View / Manage Consent
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
