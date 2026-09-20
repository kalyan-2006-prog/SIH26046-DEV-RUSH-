import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase-admin";
import { requireUser, ApiAuthError } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  try {
    // Who is really calling? Taken from the verified Firebase ID token,
    // never from the request body, so entries cannot be forged.
    const { uid } = await requireUser(req);

    const body = await req.json();
    const { action, participantId, details } = body;
    const performedBy = uid;

    if (!action || !participantId || !details) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const auditRef = adminDb.collection("audit_logs");
    // A tiny "head" document remembers the newest hash. Every write reads and
    // updates it inside ONE transaction, so two simultaneous writes cannot
    // both chain onto the same previous entry (no forked chain).
    const headRef = adminDb.collection("audit_meta").doc("chainHead");

    const result = await adminDb.runTransaction(async (t) => {
      const headSnap = await t.get(headRef);
      const headHash = headSnap.exists ? headSnap.data()?.lastHash : undefined;

      let previousHash = "GENESIS";
      if (typeof headHash === "string") {
        previousHash = headHash;
      } else {
        // First write after this change: continue from the newest existing entry.
        const lastSnap = await t.get(
          auditRef.orderBy("createdAt", "desc").limit(1)
        );
        if (!lastSnap.empty) {
          const lastHash = lastSnap.docs[0].data().hash;
          if (typeof lastHash === "string") {
            previousHash = lastHash;
          } else {
            console.warn("Audit chain: newest entry has no hash, starting a new chain");
          }
        }
      }

      // ONE clock reading, used for the hash AND for both stored dates,
      // so the hash can be recomputed later from what is stored.
      const now = new Date();
      const contentToHash = JSON.stringify({
        action,
        participantId,
        performedBy,
        details,
        timestamp: now.toISOString(),
        previousHash,
      });
      const hash = createHash("sha256").update(contentToHash).digest("hex");

      const docRef = auditRef.doc();
      t.set(docRef, {
        action,
        participantId,
        performedBy,
        details,
        timestamp: now,
        createdAt: now,
        previousHash,
        hash,
        chainVersion: 2,
      });
      t.set(headRef, { lastHash: hash, lastId: docRef.id, updatedAt: now });

      return { id: docRef.id, hash };
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Audit log write failed:", err);
    return NextResponse.json(
      { error: "Failed to write audit log" },
      { status: 500 }
    );
  }
}
