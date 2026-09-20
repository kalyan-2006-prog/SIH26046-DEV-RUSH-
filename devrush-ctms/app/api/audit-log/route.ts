import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, participantId, performedBy, details } = body;

    if (!action || !participantId || !performedBy || !details) {
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
    console.error("Audit log write failed:", err);
    return NextResponse.json(
      { error: "Failed to write audit log" },
      { status: 500 }
    );
  }
}