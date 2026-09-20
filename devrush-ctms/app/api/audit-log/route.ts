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

    // Find the most recent entry to chain onto
    const lastEntrySnap = await auditRef
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    const previousHash = lastEntrySnap.empty
      ? "GENESIS"
      : lastEntrySnap.docs[0].data().hash;

    const timestamp = new Date().toISOString();

    const contentToHash = JSON.stringify({
      action,
      participantId,
      performedBy,
      details,
      timestamp,
      previousHash,
    });

    const hash = createHash("sha256").update(contentToHash).digest("hex");

    const docRef = await auditRef.add({
      action,
      participantId,
      performedBy,
      details,
      timestamp: new Date(),
      previousHash,
      hash,
      createdAt: new Date(),
    });

    return NextResponse.json({ id: docRef.id, hash });
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
