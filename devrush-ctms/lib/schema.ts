// ============================================================
// DevRush — Firestore Schema (TypeScript Interfaces)
// SIH26046 | AIIA Clinical Trials Dashboard
// ALCOA+ / CDISC CDASH / HL7 FHIR R4 / DPDP aligned
// ============================================================
 
import { Timestamp } from "firebase/firestore";
 
// ─────────────────────────────────────────────
// 1. USER
// ─────────────────────────────────────────────
export type UserRole =
  | "PI"
  | "SUB_INVESTIGATOR"
  | "COORDINATOR"
  | "DATA_MANAGER"
  | "MONITOR"
  | "PV_OFFICER"
  | "EC_MEMBER"
  | "DSMB_MEMBER"
  | "REGULATORY"
  | "SPONSOR"
  | "ADMIN";
 
export interface CTMSUser {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  siteIds: string[];
  trialIds: string[];
  credentials: {
    gcpTrainingExpiry: Timestamp | null;
    registrationNo: string | null;
  };
  active: boolean;
  lastLoginAt: Timestamp;
  createdAt: Timestamp;
}
 
// ─────────────────────────────────────────────
// 2. SITE
// ─────────────────────────────────────────────
export type SiteStatus = "PLANNED" | "ACTIVE" | "SUSPENDED" | "CLOSED";
 
export interface Site {
  siteId: string;
  name: string;
  ctriSiteName: string;
  address: {
    line: string;
    city: string;
    state: string;
    pincode: string;
  };
  principalInvestigatorUid: string;
  ecRegistrationNo: string;       // enforced — not optional (CTRI audit gap fixed)
  ecName: string;
  abdmFacilityId: string | null;
  activatedAt: Timestamp;
  status: SiteStatus;
}
 
// ─────────────────────────────────────────────
// 3. TRIAL
// ─────────────────────────────────────────────
export type TrialStatus =
  | "PLANNING"
  | "APPROVED"
  | "RECRUITING"
  | "ACTIVE_NOT_RECRUITING"
  | "SUSPENDED"
  | "COMPLETED"
  | "TERMINATED";
 
export type AyushSystem =
  | "AYURVEDA" | "YOGA" | "UNANI" | "SIDDHA" | "HOMOEOPATHY";
 
export interface TrialKPIs {
  screened: number;
  enrolled: number;
  screenFailed: number;
  randomized: number;
  completed: number;
  withdrawn: number;
  lostToFollowUp: number;
  aeOpen: number;
  saeOpen: number;
  saeOverdue: number;             // drives the red banner
  deviationsOpen: number;
  queriesOpen: number;
  dataEntryLagDays: number;
  recalculatedAt: Timestamp;
}
 
export interface Trial {
  trialId: string;
  ctriNumber: string | null;
  ctriRegisteredAt: Timestamp | null;
  ctriProspective: boolean;
  publicTitle: string;
  scientificTitle: string;
  therapeuticArea: string;
  ayushSystem: AyushSystem;
  intervention: {
    type: "ASU_DRUG" | "PROCEDURE" | "YOGA" | "DIET" | "COMBINATION";
    name: string;
    ayushClassicalReference: string | null;
    batchIds: string[];
  };
  design: {
    phase: "I" | "II" | "III" | "IV" | "PILOT" | "OBSERVATIONAL";
    allocation: "RANDOMIZED" | "NON_RANDOMIZED";
    masking: "OPEN" | "SINGLE_BLIND" | "DOUBLE_BLIND";
    arms: Array<{ armId: string; label: string; description: string }>;
  };
  regulatory: {
    ndctApplicable: boolean;
    cdscoApprovalNo: string | null;
    gcpAsuCompliant: boolean;
  };
  siteIds: string[];
  targetEnrollment: number;
  plannedStartDate: Timestamp;
  plannedEndDate: Timestamp;
  status: TrialStatus;
  terminationReason: string | null; // required if status === TERMINATED
  kpis: TrialKPIs;                  // maintained by Cloud Functions, never by client
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
}
 
// ─────────────────────────────────────────────
// 4. PARTICIPANT  (subcollection: trials/{trialId}/participants/{subjectCode})
// No names, no phone numbers — pseudonymised. CDASH DM aligned.
// ─────────────────────────────────────────────
export type EnrollmentStatus =
  | "SCREENING"
  | "ENROLLED"
  | "ON_TREATMENT"
  | "FOLLOW_UP"
  | "COMPLETED"
  | "WITHDRAWN"
  | "LOST_TO_FU";
 
export type Prakriti =
  | "VATA" | "PITTA" | "KAPHA"
  | "VATA_PITTA" | "PITTA_KAPHA" | "VATA_KAPHA" | "SAMA";
 
export interface Participant {
  subjectCode: string;            // "AIIA-01-0042" — only identifier stored here
  siteId: string;
  trialId: string;
  usubjid: string;                // SDTM: STUDYID.SITEID.SUBJID
  screening: {
    screenedAt: Timestamp;
    outcome: "ENROLLED" | "SCREEN_FAILED" | "PENDING";
    failureReason: string | null;
  };
  demographics: {                 // CDASH DM — birth year only, not full DOB
    birthYear: number;
    ageAtConsent: number;
    sex: "M" | "F" | "U";
    ethnicity: string | null;
  };
  ayurvedaProfile: {              // domain-specific extension — unique to this system
    prakriti: Prakriti;
    vikriti: string | null;
    agniAssessment: string | null;
    assessedBy: string;
    assessedAt: Timestamp;
  };
  armId: string | null;
  randomizedAt: Timestamp | null;
  enrollmentStatus: EnrollmentStatus;
  disposition: {                  // CDASH DS
    endedAt: Timestamp | null;
    reason: string | null;
  };
  consentRefs: {
    icfConsentId: string;
    dpdpConsentId: string;
  };
  abhaLinked: boolean;            // ABDM linkage flag — never store ABHA itself here
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
 
// Separate collection — readable only by COORDINATOR and PI of owning site
export interface ParticipantPII {
  subjectCode: string;
  name: string;
  contact: string;
  abhaAddress: string | null;
  guardianName: string | null;
}
 
// ─────────────────────────────────────────────
// 5. ADVERSE EVENT  (subcollection: trials/{trialId}/adverseEvents/{aeId})
// CDASH AE + MedDRA coding + NDCT Rules 2019 reporting clock
// ─────────────────────────────────────────────
export type AESeriousnessCriteria =
  | "DEATH"
  | "LIFE_THREATENING"
  | "HOSPITALIZATION"
  | "DISABILITY"
  | "CONGENITAL_ANOMALY"
  | "OTHER_MEDICALLY_IMPORTANT";
 
export type CausalityAssessment =
  | "CERTAIN" | "PROBABLE" | "POSSIBLE"
  | "UNLIKELY" | "CONDITIONAL" | "UNASSESSABLE";
 
export type SaeClockStatus = "ON_TIME" | "DUE_SOON" | "OVERDUE" | "CLOSED";
 
export interface AdverseEvent {
  aeId: string;
  trialId: string;
  siteId: string;
  subjectCode: string;
 
  verbatimTerm: string;           // AETERM — as reported, never edited
  meddra: {
    llt: { code: string; term: string };
    pt:  { code: string; term: string };
    soc: { code: string; term: string };
    version: string;              // e.g. "27.0"
    codedBy: string;
    codedAt: Timestamp;
    autoSuggested: boolean;
  };
  suspectProduct: {
    whodrugCode: string | null;
    name: string;
    batchId: string | null;
    isStudyIntervention: boolean;
  };
 
  onsetAt: Timestamp;             // AESTDTC
  resolvedAt: Timestamp | null;   // AEENDTC
  severity: "MILD" | "MODERATE" | "SEVERE";    // AESEV
  serious: boolean;               // AESER
  seriousnessCriteria: AESeriousnessCriteria[];
  outcome: "RECOVERED" | "RECOVERING" | "NOT_RECOVERED"
         | "RECOVERED_WITH_SEQUELAE" | "FATAL" | "UNKNOWN"; // AEOUT
  causality: {
    assessment: CausalityAssessment;
    scale: "WHO_UMC" | "NARANJO";
    assessedBy: string;
    assessedAt: Timestamp;
  };
  actionTaken: "DRUG_WITHDRAWN" | "DOSE_REDUCED" | "DOSE_NOT_CHANGED"
             | "UNKNOWN" | "NOT_APPLICABLE";
 
  // NDCT Rules 2019 — clock starts at becameAwareAt, NOT onsetAt
  saeClock: {
    becameAwareAt: Timestamp;           // ← clock starts here
    initialReportDueAt: Timestamp;      // becameAwareAt + 24 hours
    initialReportedAt: Timestamp | null;
    detailedReportDueAt: Timestamp;     // becameAwareAt + 14 days
    detailedReportedAt: Timestamp | null;
    recipients: {
      ethicsCommittee: Timestamp | null;
      licensingAuthority: Timestamp | null;
      sponsor: Timestamp | null;
      dsmb: Timestamp | null;
    };
    status: SaeClockStatus;
  };
  pvReferral: {
    ayushSurakshaFormGenerated: boolean;
    referenceNo: string | null;
    submittedAt: Timestamp | null;
  };
 
  narrative: string;
  attachments: Array<{
    storagePath: string;
    filename: string;
    sha256: string;
    uploadedAt: Timestamp;
  }>;
  status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "CLOSED";
  createdAt: Timestamp;
  createdBy: string;
}
 
// ─────────────────────────────────────────────
// 6. CONSENT  (collection group: consents/{consentId})
// TWO types — ICF and DPDP are separate documents with separate lifecycles
// ─────────────────────────────────────────────
export type DpdpPurposeCode =
  | "TRIAL_CONDUCT"
  | "SAFETY_REPORTING"
  | "REGULATORY_SUBMISSION"
  | "SECONDARY_RESEARCH"
  | "PUBLICATION"
  | "ABDM_SHARING";
 
export interface Consent {
  consentId: string;
  trialId: string;
  subjectCode: string;
  siteId: string;
  type: "ICF" | "DPDP_PROCESSING";
 
  // Medical informed consent (ICMR/NDCT)
  icf: {
    documentVersion: string;
    languageCode: string;
    method: "WET_INK" | "THUMB_IMPRESSION" | "E_CONSENT";
    impartialWitnessName: string | null;
    lariAudioVisualRecordingPath: string | null;
    signedAt: Timestamp;
    signedDocumentHash: string;     // sha256 of stored PDF
  } | null;
 
  // DPDP data-processing consent — granular, purpose-mapped, independently withdrawable
  dpdp: {
    noticeVersion: string;
    noticeLanguageCode: string;
    purposes: Array<{
      purposeCode: DpdpPurposeCode;
      label: string;
      granted: boolean;
      grantedAt: Timestamp | null;
      withdrawnAt: Timestamp | null;
    }>;
    dataFiduciary: "AIIA";
    retentionUntil: Timestamp;
    consentManagerId: string | null;
    abdmConsentArtefactId: string | null;
  } | null;
 
  status: "ACTIVE" | "PARTIALLY_WITHDRAWN" | "WITHDRAWN" | "EXPIRED";
  withdrawal: {
    requestedAt: Timestamp;
    effectiveAt: Timestamp;
    scope: "ALL" | DpdpPurposeCode[];
    dataHandling: "RETAIN_ANONYMISED" | "ERASE";
    processedBy: string;
  } | null;
  createdAt: Timestamp;
}
 
// ─────────────────────────────────────────────
// 7. AUDIT LOG  (collection: auditLogs/{logId})
// Append-only. Written ONLY by Cloud Function triggers. Never by client.
// ─────────────────────────────────────────────
export interface AuditLog {
  logId: string;
  timestamp: Timestamp;           // server time only — never client time
  actor: {
    uid: string;
    displayName: string;
    role: UserRole;
  };
  action: "CREATE" | "UPDATE" | "STATUS_CHANGE" | "SIGN" | "EXPORT" | "VIEW_PII";
  resource: {
    collection: string;
    docId: string;
    trialId: string;
    siteId: string;
  };
  changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  reasonForChange: string | null; // REQUIRED for any post-signature edit
  context: {
    ipHash: string;
    userAgent: string;
    sessionId: string;
  };
  signature: {
    method: "PASSWORD_REAUTH" | "OTP";
    signedMeaning: "AUTHORED" | "REVIEWED" | "APPROVED";
  } | null;
  prevLogHash: string;            // hash chain — any retroactive edit breaks it
  logHash: string;
}
 
// ─────────────────────────────────────────────
// 8. TASK  (collection: tasks/{taskId})
// SAE countdowns, overdue reports, query resolution deadlines
// ─────────────────────────────────────────────
export type TaskType =
  | "SAE_INITIAL_REPORT"
  | "SAE_DETAILED_REPORT"
  | "QUERY_RESOLUTION"
  | "EC_CONTINUING_REVIEW"
  | "CTRI_UPDATE"
  | "PROTOCOL_DEVIATION_REVIEW";
 
export interface Task {
  taskId: string;
  type: TaskType;
  trialId: string;
  siteId: string;
  linkedDocId: string;            // aeId, deviationId, etc.
  assignedTo: string[];           // uids
  dueAt: Timestamp;
  completedAt: Timestamp | null;
  status: "OPEN" | "DUE_SOON" | "OVERDUE" | "COMPLETED";
  createdAt: Timestamp;
}
 
// ─────────────────────────────────────────────
// 9. MEDDRA CODE  (collection: codeSets/meddra/terms/{code})
// Seeded with ~200 PT/SOC terms — not the full dictionary
// ─────────────────────────────────────────────
export interface MedDRATerm {
  code: string;
  lltTerm: string;
  ptTerm: string;
  ptCode: string;
  socTerm: string;
  socCode: string;
  version: string;
}