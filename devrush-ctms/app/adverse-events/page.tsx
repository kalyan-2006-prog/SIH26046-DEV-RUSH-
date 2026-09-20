"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import AppShell from "@/components/AppShell";

interface Participant {
  id: string;
  name: string;
}

interface MedDRATerm {
  code: string;
  ptTerm: string;
  socTerm: string;
}

// Field names match scripts/seed-whodrug-terms.ts. "id" is the Firestore document ID.
interface WHODrugTerm {
  id: string;
  drugName: string;
  genericName: string;
  atcClass: string;
}

export default function AdverseEventsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [meddraTerms, setMeddraTerms] = useState<MedDRATerm[]>([]);
  const [whodrugTerms, setWhodrugTerms] = useState<WHODrugTerm[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [selectedParticipant, setSelectedParticipant] = useState("");
  const [selectedMeddraCode, setSelectedMeddraCode] = useState("");
  const [selectedWhodrugCode, setSelectedWhodrugCode] = useState("");
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

        const whodrugSnapshot = await getDocs(collection(db, "whodrug_terms"));
        const whodrugData = whodrugSnapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<WHODrugTerm, "id">) }))
          .sort((a, b) => a.drugName.localeCompare(b.drugName));
        setWhodrugTerms(whodrugData);
        // Medication is optional, so the default stays "" (none selected)
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
    const chosenDrug = whodrugTerms.find((t) => t.id === selectedWhodrugCode);

    try {
      await addDoc(collection(db, "adverse_events"), {
        participantId: selectedParticipant,
        description: description,
        severity: severity,
        meddraCode: chosenTerm?.code || "",
        meddraTerm: chosenTerm?.ptTerm || "",
        meddraSoc: chosenTerm?.socTerm || "",
        whodrugId: chosenDrug?.id || "",
        whodrugName: chosenDrug?.drugName || "",
        whodrugGeneric: chosenDrug?.genericName || "",
        whodrugClass: chosenDrug?.atcClass || "",
        reportedBy: currentUserId,
        reportedAt: serverTimestamp(),
      });

      setSuccessMessage("Adverse event reported successfully.");
      setDescription("");
      setSeverity("Mild");
      setSelectedWhodrugCode("");
    } catch (err) {
      console.error("Failed to report adverse event:", err);
      alert("Failed to submit. Check console for details.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <AppShell title="Report Adverse Event">
        <p className="muted" style={{ marginTop: 18 }}>Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Report Adverse Event"
      subtitle="Structured, MedDRA-coded reporting. Serious events (Severe / Life-threatening) start the 24-hour SAE clock on the dashboard."
    >
      <form onSubmit={handleSubmit} className="card" style={{ maxWidth: 640, marginTop: 18 }}>
        <div className="field">
          <label className="field-label">Participant</label>
          <select
            className="input"
            value={selectedParticipant}
            onChange={(e) => setSelectedParticipant(e.target.value)}
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">MedDRA-Coded Term</label>
          <select
            className="input"
            value={selectedMeddraCode}
            onChange={(e) => setSelectedMeddraCode(e.target.value)}
            required
          >
            {meddraTerms.map((t) => (
              <option key={t.code} value={t.code}>
                {t.ptTerm} — {t.socTerm}
              </option>
            ))}
          </select>
          <p className="field-help">
            Select the closest matching Preferred Term. This coding step is what distinguishes structured pharmacovigilance from free-text reporting.
          </p>
        </div>

        <div className="field">
          <label className="field-label">Suspected Medication (WHODrug-Coded, optional)</label>
          <select
            className="input"
            value={selectedWhodrugCode}
            onChange={(e) => setSelectedWhodrugCode(e.target.value)}
          >
            <option value="">None / not applicable</option>
            {whodrugTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.drugName} — {t.atcClass}
              </option>
            ))}
          </select>
          <p className="field-help">
            Demo WHODrug-style dictionary (not the licensed WHODrug Global). Links the event to a coded drug for causality review.
          </p>
        </div>

        <div className="field">
          <label className="field-label">Narrative / Additional Details (optional)</label>
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
        </div>

        <div className="field">
          <label className="field-label">Severity</label>
          <select
            className="input"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="Mild">Mild</option>
            <option value="Moderate">Moderate</option>
            <option value="Severe">Severe</option>
            <option value="Life-threatening">Life-threatening</option>
          </select>
        </div>

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Report"}
        </button>

        {successMessage && (
          <p style={{ marginTop: 16, marginBottom: 0 }}>
            <span className="badge badge-green">{successMessage}</span>
          </p>
        )}
      </form>
    </AppShell>
  );
}
