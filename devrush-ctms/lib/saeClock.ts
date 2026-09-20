// SAE reporting clock. The window is a configurable constant; confirm the exact
// figure and recipient against NDCT Rules 2019 before presenting.
export const SAE_WINDOW_HOURS = 24;
export const AT_RISK_HOURS = 6;

export type SaeLevel = "red" | "yellow" | "ok";

export interface SaeClock {
  level: SaeLevel;
  hoursRemaining: number;
  label: string;
}

export function isSeriousCandidate(severity?: string): boolean {
  return severity === "Severe" || severity === "Life-threatening";
}

function formatHours(h: number): string {
  const totalMin = Math.round(h * 60);
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}

export function computeSaeClock(reportedAt: Date, now: Date = new Date()): SaeClock {
  const deadline = reportedAt.getTime() + SAE_WINDOW_HOURS * 3600 * 1000;
  const hoursRemaining = (deadline - now.getTime()) / (3600 * 1000);

  if (hoursRemaining < 0) {
    return { level: "red", hoursRemaining, label: `OVERDUE by ${formatHours(Math.abs(hoursRemaining))}` };
  }
  return {
    level: hoursRemaining <= AT_RISK_HOURS ? "yellow" : "ok",
    hoursRemaining,
    label: `${formatHours(hoursRemaining)} left`,
  };
}