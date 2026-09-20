"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";

// Who sees what. The server checks roles again, so hiding a section here is only for convenience.
const IMPORT_ROLES = ["PI", "SUB_INVESTIGATOR", "COORDINATOR", "ADMIN"];
const EXPORT_ROLES = ["PI", "ADMIN", "DATA_MANAGER", "REGULATORY"];

interface IngestResult {
  dryRun?: boolean;
  accepted?: { participants?: number; adverseEvents?: number };
  rejected?: unknown[];
  piiFieldsDiscarded?: number;
  auditLogged?: boolean;
}

interface ExportItem {
  label: string;
  url: string;
  filename: string;
}

const EXPORT_GROUPS: { title: string; items: ExportItem[] }[] = [
  {
    title: "FHIR R4",
    items: [{ label: "FHIR bundle (.json)", url: "/api/fhir/export", filename: "fhir-export.json" }],
  },
  {
    title: "SDTM",
    items: [
      { label: "DM (.csv)", url: "/api/sdtm/export?domain=dm&download=1", filename: "sdtm-dm.csv" },
      { label: "AE (.csv)", url: "/api/sdtm/export?domain=ae&download=1", filename: "sdtm-ae.csv" },
      { label: "SUPPAE (.csv)", url: "/api/sdtm/export?domain=suppae&download=1", filename: "sdtm-suppae.csv" },
    ],
  },
  {
    title: "ADaM",
    items: [
      { label: "ADSL (.csv)", url: "/api/adam/export?domain=adsl&download=1", filename: "adam-adsl.csv" },
      { label: "ADAE (.csv)", url: "/api/adam/export?domain=adae&download=1", filename: "adam-adae.csv" },
    ],
  },
  {
    title: "Define-XML",
    items: [
      { label: "SDTM (.xml)", url: "/api/define/export?standard=sdtm&download=1", filename: "define-sdtm.xml" },
      { label: "ADaM (.xml)", url: "/api/define/export?standard=adam&download=1", filename: "define-adam.xml" },
    ],
  },
];

async function getToken(): Promise<string> {
  const current = auth.currentUser;
  if (!current) throw new Error("You are not logged in.");
  return current.getIdToken();
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const subHeadingStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 650,
  margin: "0 0 10px",
  color: "var(--ui-text)",
};

export default function DataExchangePanel({ role }: { role: string }) {
  const canImport = IMPORT_ROLES.includes(role);
  const canExport = EXPORT_ROLES.includes(role);

  const [file, setFile] = useState<File | null>(null);
  const [checkOnly, setCheckOnly] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!canImport && !canExport) return null;

  async function runImport() {
    if (!file) return;
    setResult(null);
    setImportError(null);

    let bundle: unknown;
    try {
      bundle = JSON.parse(await file.text());
    } catch {
      setImportError("That file is not valid JSON.");
      return;
    }
    const type = (bundle as { resourceType?: string } | null)?.resourceType;
    if (type !== "Bundle") {
      setImportError('This does not look like a FHIR Bundle (top-level "resourceType" should be "Bundle").');
      return;
    }
    if (!checkOnly && !window.confirm("This will SAVE data to the live database. Continue?")) {
      return;
    }

    setImporting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/fhir/ingest${checkOnly ? "?dryRun=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(bundle),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Server said ${res.status}: ${text.slice(0, 300)}`);
      setResult(JSON.parse(text) as IngestResult);
    } catch (err) {
      setImportError(errText(err));
    } finally {
      setImporting(false);
    }
  }

  async function runExport(item: ExportItem) {
    setBusyFile(item.filename);
    setExportMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(item.url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server said ${res.status}: ${text.slice(0, 300)}`);
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = item.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setExportMsg({ ok: true, text: `Downloaded ${item.filename} (check your Downloads folder).` });
    } catch (err) {
      setExportMsg({ ok: false, text: `Could not download ${item.filename}. ${errText(err)}` });
    } finally {
      setBusyFile(null);
    }
  }

  const rejected = result?.rejected ?? [];

  return (
    <div className="card">
      <h2 style={{ fontSize: 18, fontWeight: 650, margin: 0 }}>Data Exchange</h2>
      <p className="note" style={{ margin: "8px 0 16px" }}>
        Prototype: not a full FHIR server. No FHIR profile validation. MedDRA and WHODrug are demo dictionaries.
      </p>

      {canImport && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={subHeadingStyle}>Import a FHIR bundle</h3>
          <input
            type="file"
            accept=".json,application/json"
            style={{ color: "var(--ui-text)", fontSize: 14 }}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setImportError(null);
            }}
          />
          <div style={{ margin: "12px 0" }}>
            <label style={{ color: "var(--ui-text)", fontSize: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={checkOnly}
                onChange={(e) => setCheckOnly(e.target.checked)}
              />{" "}
              Check only (do not save anything)
            </label>
          </div>
          <button className="btn btn-primary" disabled={!file || importing} onClick={runImport}>
            {importing ? "Working..." : checkOnly ? "Run check" : "Import and save"}
          </button>

          {importError && (
            <p style={{ color: "var(--ui-red-text)", marginTop: 10, fontWeight: 600 }}>{importError}</p>
          )}

          {result && (
            <div
              style={{
                marginTop: 14,
                padding: 14,
                background: "var(--ui-surface-2)",
                color: "var(--ui-text)",
                border: "1px solid var(--ui-border)",
                borderRadius: 10,
              }}
            >
              <span className={result.dryRun ? "badge badge-yellow" : "badge badge-green"}>
                {result.dryRun ? "CHECK ONLY: nothing was saved" : "IMPORTED: data was saved"}
              </span>
              <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>
                <li>Participants accepted: {result.accepted?.participants ?? 0}</li>
                <li>Adverse events accepted: {result.accepted?.adverseEvents ?? 0}</li>
                <li>Rejected: {rejected.length}</li>
                <li>Personal-data fields discarded: {result.piiFieldsDiscarded ?? 0}</li>
                {!result.dryRun && <li>Audit entry written: {result.auditLogged ? "yes" : "no"}</li>}
              </ul>
              {rejected.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <strong>Rejected items:</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                    {rejected.map((r, i) => (
                      <li key={i} style={{ fontSize: 13 }}>
                        {typeof r === "string" ? r : JSON.stringify(r)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!result.dryRun && (
                <div style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => window.location.reload()}>
                    Reload dashboard to refresh counts
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {canExport && (
        <div>
          <h3 style={subHeadingStyle}>Export data</h3>
          {EXPORT_GROUPS.map((group) => (
            <div
              key={group.title}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <strong
                style={{
                  display: "inline-block",
                  minWidth: 96,
                  color: "var(--ui-text)",
                  fontSize: 14,
                }}
              >
                {group.title}
              </strong>
              {group.items.map((item) => (
                <button
                  key={item.filename}
                  className="btn"
                  disabled={busyFile !== null}
                  onClick={() => runExport(item)}
                >
                  {busyFile === item.filename ? "Downloading..." : item.label}
                </button>
              ))}
            </div>
          ))}
          {exportMsg && (
            <p
              style={{
                color: exportMsg.ok ? "var(--ui-green-text)" : "var(--ui-red-text)",
                fontWeight: 600,
                marginTop: 8,
              }}
            >
              {exportMsg.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
