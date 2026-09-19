"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface Participant {
  id: string;
  name: string;
}

interface MedDRATerm {
  code: string;
  ptTerm: string;
  socTerm: string;
}

export default function AdverseEventsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [meddraTerms, setMeddraTerms] = useState<MedDRATerm[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [selectedParticipant, setSelectedParticipant] = useState("");
  const [selectedMeddraCode, setSelectedMeddraCode] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("Mild");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }
      setCurrentUserId(firebaseUser.uid);

      try {
        const snapshot = await getDocs(collection(db, "participants"));
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          name: (d.data() as { name: string }).name,
        }));
        setParticipants(data);
        if (data.length > 0) setSelectedParticipant(data[0].id);

        const meddraSnapshot = await getDocs(collection(db, "meddra_terms"));
        const meddraData = meddraSnapshot.docs
          .map((d) => d.data() as MedDRATerm)
          .sort((a, b) => a.ptTerm.localeCompare(b.ptTerm));
        setMeddraTerms(meddraData);
        if (meddraData.length > 0) setSelectedMeddraCode(meddraData[0].code);
      } catch (err) {
        console.error("Failed to fetch form data:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedParticipant || !selectedMeddraCode || !currentUserId) return;

    setSubmitting(true);
    setSuccessMessage("");

    const chosenTerm = meddraTerms.find((t) => t.code === selectedMeddraCode);

    try {
      await addDoc(collection(db, "adverse_events"), {
        participantId: selectedParticipant,
        description: description,
        severity: severity,
        meddraCode: chosenTerm?.code || "",
        meddraTerm: chosenTerm?.ptTerm || "",
        meddraSoc: chosenTerm?.socTerm || "",
        reportedBy: currentUserId,
        reportedAt: serverTimestamp(),
      });

      setSuccessMessage("Adverse event reported successfully.");
      setDescription("");
      setSeverity("Mild");
    } catch (err) {
      console.error("Failed to report adverse event:", err);
      alert("Failed to submit. Check console for details.");
    } finally {
      setSubmitting(false);
    }
  }

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
      <h1>Report Adverse Event</h1>

      <form onSubmit={handleSubmit} style={{ maxWidth: "500px", marginTop: "1.5rem" }}>
        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Participant</label>
          <select
            value={selectedParticipant}
            onChange={(e) => setSelectedParticipant(e.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>
            MedDRA-Coded Term
          </label>
          <select
            value={selectedMeddraCode}
            onChange={(e) => setSelectedMeddraCode(e.target.value)}
            required
            style={{ width: "100%", padding: "0.5rem" }}
          >
            {meddraTerms.map((t) => (
              <option key={t.code} value={t.code}>
                {t.ptTerm} — {t.socTerm}
              </option>
            ))}
          </select>
          <p style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.25rem" }}>
            Select the closest matching Preferred Term. This coding step is what distinguishes structured pharmacovigilance from free-text reporting.
          </p>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>
            Narrative / Additional Details (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            style={{ width: "100%", padding: "0.5rem" }}
          >
            <option value="Mild">Mild</option>
            <option value="Moderate">Moderate</option>
            <option value="Severe">Severe</option>
            <option value="Life-threatening">Life-threatening</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#2980b9",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit Report"}
        </button>

        {successMessage && (
          <p style={{ color: "#27ae60", marginTop: "1rem" }}>{successMessage}</p>
        )}
      </form>
    </div>
  );
}