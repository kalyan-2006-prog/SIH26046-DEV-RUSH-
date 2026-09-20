"use client";
import { postAudit } from "@/lib/postAudit";

import { authHeaders } from "@/lib/authHeaders";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy, doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { CTMSUser } from "@/lib/schema";
import AppShell from "@/components/AppShell";

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

function severityBadgeClass(severity: string) {
  if (severity === "Severe" || severity === "Life-threatening") return "badge badge-red";
  if (severity === "Moderate") return "badge badge-yellow";
  return "badge badge-grey";
}

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

  if (loading) {
    return (
      <AppShell title="Adverse Events">
        <p className="muted" style={{ marginTop: 18 }}>Loading...</p>
      </AppShell>
    );
  }

  const canSignOff = SIGNOFF_ROLES.includes(role);

  return (
    <AppShell
      title="Adverse Events"
      subtitle="All reported adverse events, newest first, with MedDRA coding (demo dictionary) and electronic sign-off."
      role={role}
    >
      {events.length === 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="muted" style={{ margin: 0 }}>No adverse events reported yet.</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Reported At</th>
                <th>Participant</th>
                <th>MedDRA Term</th>
                <th>Narrative</th>
                <th>Severity</th>
                <th>Sign-off</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id}>
                  <td>
                    {ev.reportedAt
                      ? new Date(ev.reportedAt.seconds * 1000).toLocaleString()
                      : "—"}
                  </td>
                  <td style={{ fontWeight: 600 }}>{ev.participantName}</td>
                  <td>
                    {ev.meddraTerm ? (
                      <>
                        <div style={{ fontWeight: 700 }}>{ev.meddraTerm}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {ev.meddraSoc} ({ev.meddraCode})
                        </div>
                      </>
                    ) : (
                      <span className="badge badge-grey">Not coded</span>
                    )}
                  </td>
                  <td>{ev.description || "—"}</td>
                  <td>
                    <span className={severityBadgeClass(ev.severity)}>{ev.severity}</span>
                  </td>
                  <td>
                    {ev.signedOffBy ? (
                      <div>
                        <span className="badge badge-green">✓ Signed off</span>
                        {ev.signedOffAt && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                            {new Date(ev.signedOffAt.seconds * 1000).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ) : canSignOff ? (
                      <button
                        className="btn btn-success"
                        onClick={() => handleSignOff(ev)}
                        disabled={signingId === ev.id}
                      >
                        {signingId === ev.id ? "Signing..." : "Sign off"}
                      </button>
                    ) : (
                      <span className="badge badge-grey">Pending review</span>
                    )}
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
