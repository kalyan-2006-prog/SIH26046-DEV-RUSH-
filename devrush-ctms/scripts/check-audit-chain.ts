import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

// READ-ONLY: this script never writes or deletes anything.

const keyPath = path.join(process.cwd(), "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
if (getApps().length === 0) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

type Row = { id: string; data: Record<string, unknown>; createdMs: number | null };

function kind(v: unknown): string {
  if (v === undefined) return "MISSING";
  if (v === null) return "null";
  if (typeof v === "object" && typeof (v as { toDate?: unknown }).toDate === "function") {
    return "Timestamp";
  }
  return typeof v;
}

function toDate(v: unknown): Date | null {
  return kind(v) === "Timestamp" ? (v as { toDate: () => Date }).toDate() : null;
}

function short(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 8) : "-";
}

async function main() {
  const snap = await db.collection("audit_logs").get();
  const rows: Row[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const c = toDate(data.createdAt);
    return { id: d.id, data, createdMs: c ? c.getTime() : null };
  });

  // Oldest first. Entries without a usable createdAt go last.
  rows.sort((a, b) => {
    if (a.createdMs === b.createdMs) return 0;
    if (a.createdMs === null) return 1;
    if (b.createdMs === null) return -1;
    return a.createdMs - b.createdMs;
  });

  console.log(`Total audit entries: ${rows.length} (oldest first)`);
  console.log(" #  createdAt (UTC)           action                     timestamp   hash      prevHash  ver");

  const problems: string[] = [];
  const prevCount = new Map<string, number>();
  let lastHashInChain: string | null = null;
  let chainCount = 0;
  let v2Count = 0;
  let recomputedOk = 0;
  let recomputedBad = 0;
  let badTimestamp = 0;
  let noHash = 0;
  let linkMismatch = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const d = r.data;
    const n = i + 1;
    const label = `#${n} (${String(d.action)}) doc ${r.id}`;
    const created = r.createdMs === null ? "MISSING" : new Date(r.createdMs).toISOString();
    const tsKind = kind(d.timestamp);

    console.log(
      `${String(n).padStart(2)}  ${created.padEnd(24)}  ${String(d.action ?? "?").padEnd(25)}  ${tsKind.padEnd(10)}  ${short(d.hash).padEnd(8)}  ${short(d.previousHash).padEnd(8)}  v${d.chainVersion ?? 1}`
    );

    if (r.createdMs === null) {
      problems.push(`${label}: createdAt is ${kind(d.createdAt)}, so the chain lookup skips this entry`);
    }
    if (tsKind !== "Timestamp") {
      badTimestamp++;
      const raw = d.timestamp === undefined ? "" : ` (value starts: ${String(d.timestamp).slice(0, 40)})`;
      problems.push(`${label}: timestamp is ${tsKind}${raw}; the Audit Logs page shows "Invalid Date"`);
    }

    const hash = d.hash;
    const prev = d.previousHash;
    if (typeof hash !== "string" || typeof prev !== "string") {
      noHash++;
      problems.push(`${label}: no hash / previousHash, so it is not part of the chain`);
      continue;
    }
    if (r.createdMs === null) continue;

    // Link check: each entry should point at the hash of the entry before it.
    if (chainCount === 0) {
      if (prev !== "GENESIS") {
        problems.push(`NOTE ${label}: first hashed entry does not start at GENESIS (older entries may be missing)`);
      }
    } else if (prev !== lastHashInChain) {
      linkMismatch++;
      problems.push(`${label}: previousHash does not match the hash of the entry before it`);
    }
    prevCount.set(prev, (prevCount.get(prev) ?? 0) + 1);
    lastHashInChain = hash;
    chainCount++;

    // Re-compute the hash (only possible for new-style entries, chainVersion 2).
    if (d.chainVersion === 2) {
      v2Count++;
      const ts = toDate(d.timestamp);
      if (!ts) {
        recomputedBad++;
        problems.push(`${label}: cannot re-compute the hash because timestamp is not a Timestamp`);
      } else {
        const content = JSON.stringify({
          action: d.action,
          participantId: d.participantId,
          performedBy: d.performedBy,
          details: d.details,
          timestamp: ts.toISOString(),
          previousHash: prev,
        });
        const again = createHash("sha256").update(content).digest("hex");
        if (again === hash) {
          recomputedOk++;
        } else {
          recomputedBad++;
          problems.push(`${label}: re-computed hash does NOT match the stored hash`);
        }
      }
    }
  }

  prevCount.forEach((count, prev) => {
    if (count > 1) {
      problems.push(`FORK or restart: ${count} entries share previousHash ${prev.slice(0, 8)}`);
    }
  });

  const head = await db.collection("audit_meta").doc("chainHead").get();
  let headLine: string;
  if (!head.exists) {
    headLine = "not created yet (no audit write has gone through the new route)";
  } else {
    const lastHash = head.data()?.lastHash;
    headLine = lastHash === lastHashInChain ? "YES, matches the newest chained entry" : "NO, does not match the newest chained entry";
  }

  console.log("");
  console.log("=== SUMMARY ===");
  console.log(`Entries: ${rows.length}, in the hash chain: ${chainCount}, without a hash: ${noHash}`);
  console.log(`New-style entries (chainVersion 2): ${v2Count}, hash re-computed OK: ${recomputedOk}, failed: ${recomputedBad}`);
  console.log(`Entries whose timestamp is not a real Timestamp: ${badTimestamp}`);
  console.log(`Broken links: ${linkMismatch}`);
  console.log(`chainHead matches newest entry: ${headLine}`);
  console.log("");
  console.log(problems.length === 0 ? "Problems: none" : "Problems:");
  for (const p of problems) console.log(" - " + p);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
