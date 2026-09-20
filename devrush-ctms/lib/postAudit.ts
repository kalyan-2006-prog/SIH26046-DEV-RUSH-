// Sends one audit entry to our own protected route and WARNS the person if it
// could not be saved. The main change has already happened by the time this is
// called, so this cannot undo it. It makes sure a lost audit entry is never silent.
export async function postAudit(
  headers: HeadersInit,
  entry: { action: string; participantId: string; details: string; [key: string]: unknown }
): Promise<boolean> {
  let ok = false;
  let reason = "";
  try {
    const res = await fetch("/api/audit-log", {
      method: "POST",
      headers,
      body: JSON.stringify(entry),
    });
    ok = res.ok;
    if (!ok) reason = "server said " + res.status;
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
  }
  if (!ok) {
    console.error("Audit entry NOT saved:", entry.action, reason);
    window.alert(
      "Your change was saved, but its audit entry could NOT be recorded (" +
        reason +
        "). Please tell an administrator."
    );
  }
  return ok;
}
