"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

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

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <nav style={{ marginBottom: "1.5rem" }}>
        <a href="/dashboard" style={{ marginRight: "1rem" }}>Dashboard</a>
        <a href="/participants" style={{ marginRight: "1rem" }}>Participants</a>
        <a href="/audit-logs" style={{ marginRight: "1rem" }}>Audit Logs</a>
        <a href="/adverse-events">Adverse Events</a>
      </nav>
      <h1>Audit Logs</h1>
      <p style={{ color: "#888", marginBottom: "1rem" }}>
        Append-only compliance record of consent and data actions across the platform.
      </p>
      {logs.length === 0 ? (
        <p>No audit log entries found.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
              <th style={{ padding: "0.5rem" }}>Timestamp</th>
              <th style={{ padding: "0.5rem" }}>Action</th>
              <th style={{ padding: "0.5rem" }}>Details</th>
              <th style={{ padding: "0.5rem" }}>Performed By (UID)</th>
              <th style={{ padding: "0.5rem" }}>Participant ID</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  {log.timestamp
                    ? (typeof log.timestamp === "string" ? new Date(log.timestamp) : new Date(log.timestamp.seconds * 1000)).toLocaleString()
                    : "—"}
                </td>
                <td style={{ padding: "0.5rem" }}>{log.action}</td>
                <td style={{ padding: "0.5rem" }}>{log.details}</td>
                <td style={{ padding: "0.5rem", fontSize: "0.85rem" }}>{log.performedBy}</td>
                <td style={{ padding: "0.5rem", fontSize: "0.85rem" }}>{log.participantId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}