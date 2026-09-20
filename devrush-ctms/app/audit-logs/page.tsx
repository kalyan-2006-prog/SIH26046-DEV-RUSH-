"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import AppShell from "@/components/AppShell";

interface AuditLog {
  id: string;
  action: string;
  participantId: string;
  performedBy: string;
  timestamp: { seconds: number; nanoseconds: number } | string | null;
  details: string;
}

function auditTimeMs(t: AuditLog["timestamp"]): number {
  if (!t) return 0;
  if (typeof t === "string") {
    const ms = new Date(t).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return t.seconds * 1000;
}

function actionBadgeClass(action: string) {
  if (action === "CONSENT_WITHDRAWN") return "badge badge-yellow";
  if (action === "CONSENT_CAPTURED" || action === "AE_SIGNED_OFF" || action === "SAE_REGULATORY_SUBMITTED") {
    return "badge badge-green";
  }
  return "badge badge-grey";
}

const idStyle: React.CSSProperties = {
  fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace",
  fontSize: 12,
  wordBreak: "break-all",
  color: "var(--ui-muted)",
};

export default function AuditLogsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
        return;
      }

      try {
        // Sorted newest-first in code below: Firestore would put text timestamps ahead of real dates.
        const q = collection(db, "audit_logs");
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AuditLog, "id">),
        }));
        setLogs(data.sort((a, b) => auditTimeMs(b.timestamp) - auditTimeMs(a.timestamp)));
      } catch (err) {
        console.error("Failed to fetch audit logs:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <AppShell title="Audit Logs">
        <p className="muted" style={{ marginTop: 18 }}>Loading...</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Audit Logs"
      subtitle="Append-only compliance record of consent and data actions across the platform."
    >
      {logs.length === 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="muted" style={{ margin: 0 }}>No audit log entries found.</p>
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Details</th>
                <th>Performed By (UID)</th>
                <th>Participant ID</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {log.timestamp
                      ? (typeof log.timestamp === "string" ? new Date(log.timestamp) : new Date(log.timestamp.seconds * 1000)).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <span className={actionBadgeClass(log.action)}>{log.action}</span>
                  </td>
                  <td>{log.details}</td>
                  <td style={idStyle}>{log.performedBy}</td>
                  <td style={idStyle}>{log.participantId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
