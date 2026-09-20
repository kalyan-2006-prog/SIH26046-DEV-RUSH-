"use client";
import { postAudit } from "@/lib/postAudit";

import { authHeaders } from "@/lib/authHeaders";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface Participant {
  name: string;
  trialId: string;
  siteId: string;
  enrollmentDate: string;
  consentStatus: string;
  dpdpConsentGiven: boolean;
}

export default function ParticipantDetailPage() {
  const router = useRouter();
  const params = useParams();
  const participantId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      setCurrentUserId(firebaseUser.uid);

      const snap = await getDoc(doc(db, "participants", participantId));
      if (snap.exists()) {
        setParticipant(snap.data() as Participant);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router, participantId]);

  async function handleWithdrawConsent() {
    if (!participant || !currentUserId) return;
    setWithdrawing(true);

    try {
      await updateDoc(doc(db, "participants", participantId), {
        consentStatus: "Withdrawn",
        dpdpConsentGiven: false,
      });

      await postAudit(await authHeaders(), {
        action: "CONSENT_WITHDRAWN",
        participantId: participantId,
        performedBy: currentUserId,
        details: `DPDP consent withdrawn for ${participant.name}`,
      });

      setParticipant({ ...participant, consentStatus: "Withdrawn", dpdpConsentGiven: false });
    } catch (err) {
      console.error("Failed to withdraw consent:", err);
      alert("Failed to withdraw consent. Check console for details.");
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleCaptureConsent() {
    if (!participant || !currentUserId) return;
    setCapturing(true);

    try {
      await updateDoc(doc(db, "participants", participantId), {
        consentStatus: "Active",
        dpdpConsentGiven: true,
      });

      await postAudit(await authHeaders(), {
        action: "CONSENT_CAPTURED",
        participantId: participantId,
        performedBy: currentUserId,
        details: `DPDP consent captured for ${participant.name}`,
      });

      setParticipant({ ...participant, consentStatus: "Active", dpdpConsentGiven: true });
    } catch (err) {
      console.error("Failed to capture consent:", err);
      alert("Failed to capture consent. Check console for details.");
    } finally {
      setCapturing(false);
    }
  }

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;
  if (!participant) return <div style={{ padding: "2rem" }}>Participant not found.</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <button onClick={() => router.push("/participants")} style={{ marginBottom: "1rem" }}>
        ← Back to Participants
      </button>
      <h1>{participant.name}</h1>
      <p>Enrollment Date: {new Date(participant.enrollmentDate).toLocaleDateString()}</p>
      <p>Consent Status: <strong>{participant.consentStatus}</strong></p>
      <p>DPDP Consent: <strong>{participant.dpdpConsentGiven ? "Given" : "Not Given"}</strong></p>

      {participant.consentStatus !== "Active" && (
        <button
          onClick={handleCaptureConsent}
          disabled={capturing}
          style={{
            marginTop: "1rem",
            marginRight: "0.5rem",
            padding: "0.5rem 1rem",
            backgroundColor: "#27ae60",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: capturing ? "not-allowed" : "pointer",
          }}
        >
          {capturing ? "Capturing..." : "Capture DPDP Consent"}
        </button>
      )}

      {participant.consentStatus !== "Withdrawn" && (
        <button
          onClick={handleWithdrawConsent}
          disabled={withdrawing}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            backgroundColor: "#c0392b",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: withdrawing ? "not-allowed" : "pointer",
          }}
        >
          {withdrawing ? "Withdrawing..." : "Withdraw DPDP Consent"}
        </button>
      )}

      {participant.consentStatus === "Withdrawn" && (
        <p style={{ marginTop: "1rem", color: "#c0392b" }}>
          Consent has been withdrawn for this participant. This action was recorded in the audit log.
        </p>
      )}
    </div>
  );
}