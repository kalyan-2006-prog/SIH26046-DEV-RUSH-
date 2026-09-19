// ============================================================
// DevRush — MedDRA-style Adverse Event Term Seed Data
// SIH26046 | AIIA Clinical Trials Dashboard
//
// NOTE: These are NOT official MedDRA/WHODrug codes — real MedDRA
// is a licensed dictionary maintained by the MSSO and unavailable
// for a hackathon prototype. This is a small seeded set of common,
// realistic adverse event terms structured the same way MedDRA
// organizes terms (Preferred Term + System Organ Class), so the
// coding workflow is demonstrable. Phase 2 roadmap item: swap this
// for a licensed MedDRA/WHODrug feed via institutional access.
// ============================================================

export interface MedDRASeedTerm {
  code: string;       // internal seed code, e.g. "AE-001"
  ptTerm: string;      // Preferred Term
  socTerm: string;     // System Organ Class
}

export const MEDDRA_SEED_TERMS: MedDRASeedTerm[] = [
  { code: "AE-001", ptTerm: "Nausea", socTerm: "Gastrointestinal disorders" },
  { code: "AE-002", ptTerm: "Vomiting", socTerm: "Gastrointestinal disorders" },
  { code: "AE-003", ptTerm: "Diarrhoea", socTerm: "Gastrointestinal disorders" },
  { code: "AE-004", ptTerm: "Abdominal pain", socTerm: "Gastrointestinal disorders" },
  { code: "AE-005", ptTerm: "Constipation", socTerm: "Gastrointestinal disorders" },
  { code: "AE-006", ptTerm: "Dyspepsia", socTerm: "Gastrointestinal disorders" },
  { code: "AE-007", ptTerm: "Headache", socTerm: "Nervous system disorders" },
  { code: "AE-008", ptTerm: "Dizziness", socTerm: "Nervous system disorders" },
  { code: "AE-009", ptTerm: "Somnolence", socTerm: "Nervous system disorders" },
  { code: "AE-010", ptTerm: "Tremor", socTerm: "Nervous system disorders" },
  { code: "AE-011", ptTerm: "Paraesthesia", socTerm: "Nervous system disorders" },
  { code: "AE-012", ptTerm: "Rash", socTerm: "Skin and subcutaneous tissue disorders" },
  { code: "AE-013", ptTerm: "Pruritus", socTerm: "Skin and subcutaneous tissue disorders" },
  { code: "AE-014", ptTerm: "Urticaria", socTerm: "Skin and subcutaneous tissue disorders" },
  { code: "AE-015", ptTerm: "Dry skin", socTerm: "Skin and subcutaneous tissue disorders" },
  { code: "AE-016", ptTerm: "Fatigue", socTerm: "General disorders and administration site conditions" },
  { code: "AE-017", ptTerm: "Pyrexia", socTerm: "General disorders and administration site conditions" },
  { code: "AE-018", ptTerm: "Asthenia", socTerm: "General disorders and administration site conditions" },
  { code: "AE-019", ptTerm: "Chills", socTerm: "General disorders and administration site conditions" },
  { code: "AE-020", ptTerm: "Oedema peripheral", socTerm: "General disorders and administration site conditions" },
  { code: "AE-021", ptTerm: "Palpitations", socTerm: "Cardiac disorders" },
  { code: "AE-022", ptTerm: "Tachycardia", socTerm: "Cardiac disorders" },
  { code: "AE-023", ptTerm: "Hypertension", socTerm: "Vascular disorders" },
  { code: "AE-024", ptTerm: "Hypotension", socTerm: "Vascular disorders" },
  { code: "AE-025", ptTerm: "Flushing", socTerm: "Vascular disorders" },
  { code: "AE-026", ptTerm: "Cough", socTerm: "Respiratory, thoracic and mediastinal disorders" },
  { code: "AE-027", ptTerm: "Dyspnoea", socTerm: "Respiratory, thoracic and mediastinal disorders" },
  { code: "AE-028", ptTerm: "Nasopharyngitis", socTerm: "Infections and infestations" },
  { code: "AE-029", ptTerm: "Upper respiratory tract infection", socTerm: "Infections and infestations" },
  { code: "AE-030", ptTerm: "Urinary tract infection", socTerm: "Infections and infestations" },
  { code: "AE-031", ptTerm: "Myalgia", socTerm: "Musculoskeletal and connective tissue disorders" },
  { code: "AE-032", ptTerm: "Arthralgia", socTerm: "Musculoskeletal and connective tissue disorders" },
  { code: "AE-033", ptTerm: "Back pain", socTerm: "Musculoskeletal and connective tissue disorders" },
  { code: "AE-034", ptTerm: "Insomnia", socTerm: "Psychiatric disorders" },
  { code: "AE-035", ptTerm: "Anxiety", socTerm: "Psychiatric disorders" },
  { code: "AE-036", ptTerm: "Decreased appetite", socTerm: "Metabolism and nutrition disorders" },
  { code: "AE-037", ptTerm: "Weight decreased", socTerm: "Investigations" },
];