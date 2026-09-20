// ============================================================
// DevRush — KPI & Alert Rules Engine
// SIH26046 | AIIA Clinical Trials Dashboard
// Computes categorized alert flags from the REAL fields currently
// stored on each trial document, and routes them by role.
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
export type AlertCategory = "CTRI" | "ENROLLMENT" | "ETHICS";

export interface AlertReason {
  category: AlertCategory;
  level: "red" | "yellow";
  message: string;
}

export interface TrialAlert {
  level: AlertLevel;
  reasons: AlertReason[];
}

const ENROLLMENT_LAG_THRESHOLD = 0.5; // below 50% enrollment is flagged yellow
const RENEWAL_DUE_SOON_DAYS = 30; // flag yellow if renewal due within this many days

const STATUSES_REQUIRING_CTRI = ["Active", "Enrolling"];

// Which alert categories each role is routed to on the dashboard.
// The overall red/yellow badge is still shown to everyone for oversight;
// this only controls which reason text is displayed inline per role.
export const ROLE_ALERT_CATEGORIES: Record<string, AlertCategory[]> = {
  PI: ["CTRI", "ENROLLMENT", "ETHICS"],
  ADMIN: ["CTRI", "ENROLLMENT", "ETHICS"],
  COORDINATOR: ["ENROLLMENT"],
  SUB_INVESTIGATOR: ["ENROLLMENT", "ETHICS"],
  DATA_MANAGER: ["ENROLLMENT"],
  MONITOR: ["CTRI", "ETHICS"],
  REGULATORY: ["CTRI", "ETHICS"],
  EC_MEMBER: ["ETHICS"],
  DSMB_MEMBER: ["ENROLLMENT"],
  PV_OFFICER: [], // routed to the SAE Reporting Clock instead
  SPONSOR: ["CTRI", "ENROLLMENT", "ETHICS"],
};

export function computeTrialAlert(trial: TrialForAlerts): TrialAlert {
  const reasons: AlertReason[] = [];
  let level: AlertLevel = "none";

  // Red rule: trial is active/enrolling but CTRI registration is still pending
  if (
    STATUSES_REQUIRING_CTRI.includes(trial.status) &&
    trial.ctriRegistrationStatus === "Pending"
  ) {
    reasons.push({
      category: "CTRI",
      level: "red",
      message: "Active without CTRI registration",
    });
    level = "red";
  }

  // Yellow rule: enrollment ratio below threshold
  if (trial.enrollmentTarget > 0) {
    const ratio = trial.enrollmentCurrent / trial.enrollmentTarget;
    if (ratio < ENROLLMENT_LAG_THRESHOLD) {
      reasons.push({
        category: "ENROLLMENT",
        level: "yellow",
        message: `Enrollment lag (${Math.round(ratio * 100)}% of target)`,
      });
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
      reasons.push({
        category: "ETHICS",
        level: "red",
        message: `Ethics renewal overdue (was due ${trial.ethicsRenewalDueDate})`,
      });
      level = "red";
    } else if (daysUntilDue <= RENEWAL_DUE_SOON_DAYS) {
      reasons.push({
        category: "ETHICS",
        level: "yellow",
        message: `Ethics renewal due soon (${trial.ethicsRenewalDueDate}, ${daysUntilDue} days left)`,
      });
      if (level !== "red") level = "yellow";
    }
  }

  return { level, reasons };
}

// Splits reasons into what's routed to this role vs. everything else,
// so the dashboard can show relevant detail plus a routing note for the rest.
export function splitReasonsForRole(
  reasons: AlertReason[],
  role: string
): { visible: AlertReason[]; routedElsewhereCount: number } {
  const allowedCategories = ROLE_ALERT_CATEGORIES[role] || [];
  const visible = reasons.filter((r) => allowedCategories.includes(r.category));
  const routedElsewhereCount = reasons.length - visible.length;
  return { visible, routedElsewhereCount };
}