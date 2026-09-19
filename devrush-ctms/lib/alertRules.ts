// ============================================================
// DevRush — KPI & Alert Rules Engine
// SIH26046 | AIIA Clinical Trials Dashboard
// Computes alert flags from the REAL fields currently stored
// on each trial document (not the aspirational schema.ts kpis object)
// ============================================================

export interface TrialForAlerts {
  status: string;
  enrollmentTarget: number;
  enrollmentCurrent: number;
  ctriRegistrationStatus: string;
  ethicsApprovalDate?: string;
  ethicsRenewalDueDate?: string;
}

export type AlertLevel = "red" | "yellow" | "none";

export interface TrialAlert {
  level: AlertLevel;
  reasons: string[];
}

const ENROLLMENT_LAG_THRESHOLD = 0.5; // below 50% enrollment is flagged yellow
const RENEWAL_DUE_SOON_DAYS = 30; // flag yellow if renewal due within this many days

const STATUSES_REQUIRING_CTRI = ["Active", "Enrolling"];

export function computeTrialAlert(trial: TrialForAlerts): TrialAlert {
  const reasons: string[] = [];
  let level: AlertLevel = "none";

  // Red rule: trial is active/enrolling but CTRI registration is still pending
  if (
    STATUSES_REQUIRING_CTRI.includes(trial.status) &&
    trial.ctriRegistrationStatus === "Pending"
  ) {
    reasons.push("Active without CTRI registration");
    level = "red";
  }

  // Yellow rule: enrollment ratio below threshold
  if (trial.enrollmentTarget > 0) {
    const ratio = trial.enrollmentCurrent / trial.enrollmentTarget;
    if (ratio < ENROLLMENT_LAG_THRESHOLD) {
      reasons.push(
        `Enrollment lag (${Math.round(ratio * 100)}% of target)`
      );
      if (level !== "red") level = "yellow";
    }
  }

  // Ethics renewal rules: overdue is red, due soon is yellow
  if (trial.ethicsRenewalDueDate) {
    const dueDate = new Date(trial.ethicsRenewalDueDate);
    const today = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysUntilDue = Math.floor(
      (dueDate.getTime() - today.getTime()) / msPerDay
    );

    if (daysUntilDue < 0) {
      reasons.push(
        `Ethics renewal overdue (was due ${trial.ethicsRenewalDueDate})`
      );
      level = "red";
    } else if (daysUntilDue <= RENEWAL_DUE_SOON_DAYS) {
      reasons.push(
        `Ethics renewal due soon (${trial.ethicsRenewalDueDate}, ${daysUntilDue} days left)`
      );
      if (level !== "red") level = "yellow";
    }
  }

  return { level, reasons };
}