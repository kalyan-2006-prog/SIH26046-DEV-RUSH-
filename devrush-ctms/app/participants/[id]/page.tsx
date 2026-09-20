"use client";
import { postAudit } from "@/lib/postAudit";

import { authHeaders } from "@/lib/authHeaders";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import AppShell from "@/components/AppShell";

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

  if (loading) {
    return (
      <AppShell title="Participant">
        <p className="muted" style={{ marginTop: 18 }}>Loading...</p>
      </AppShell>
    );
  }
  if (!participant) {
    return (
      <AppShell title="Participant not found">
        <div className="card" style={{ marginTop: 18 }}>
          <p style={{ margin: 0 }}>Participant not found.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={participant.name} subtitle="Participant detail and DPDP consent management">
      <p style={{ margin: "10px 0 0" }}>
        <button className="btn" onClick={() => router.push("/participants")}>
          ← Back to Participants
        </button>
      </p>

      <div className="card" style={{ marginTop: 18, maxWidth: 640 }}>
        <div className="detail-row">
          <span className="detail-label">Enrollment Date</span>
          <strong>{new Date(participant.enrollmentDate).toLocaleDateString()}</strong>
        </div>
        <div className="detail-row">
          <span className="detail-label">Consent Status</span>
          <span className={participant.consentStatus === "Active" ? "badge badge-green" : "badge badge-grey"}>
            {participant.consentStatus}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">DPDP Consent</span>
          <span className={participant.dpdpConsentGiven ? "badge badge-green" : "badge badge-yellow"}>
            {participant.dpdpConsentGiven ? "Given" : "Not Given"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          {participant.consentStatus !== "Active" && (
            <button
              className="btn btn-success"
              onClick={handleCaptureConsent}
              disabled={capturing}
            >
              {capturing ? "Capturing..." : "Capture DPDP Consent"}
            </button>
          )}

          {participant.consentStatus !== "Withdrawn" && (
            <button
              className="btn btn-danger"
              onClick={handleWithdrawConsent}
              disabled={withdrawing}
            >
              {withdrawing ? "Withdrawing..." : "Withdraw DPDP Consent"}
            </button>
          )}
        </div>

        {participant.consentStatus === "Withdrawn" && (
          <p
            style={{
              marginTop: 16,
              marginBottom: 0,
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--ui-red-bg)",
              color: "var(--ui-red-text)",
              border: "1px solid var(--ui-red-border)",
              fontSize: 14,
            }}
          >
            Consent has been withdrawn for this participant. This action was recorded in the audit log.
          </p>
        )}
      </div>
    </AppShell>
  );
}
