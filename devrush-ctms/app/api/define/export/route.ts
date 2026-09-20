import { requireRole, ApiAuthError } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Var = {
  name: string;
  label: string;
  type?: "text" | "integer";
  length?: number;
  mandatory?: boolean;
  comment?: "demo" | "notcollected" | "custom";
};
type Dataset = { name: string; label: string; structure: string; cls: string; vars: Var[] };

const COMMENTS = {
  demo: {
    oid: "COM.DEMO",
    text: "Coded with a demonstration term set, not the licensed MedDRA or WHODrug dictionary.",
  },
  notcollected: {
    oid: "COM.NOTCOLLECTED",
    text: "Not collected in the prototype; value is intentionally blank.",
  },
  custom: {
    oid: "COM.CUSTOM",
    text: "Sponsor-defined variable carrying the suspected drug from the WHODrug-style demo dictionary.",
  },
};

const DM: Dataset = {
  name: "DM",
  label: "Demographics",
  structure: "One record per subject",
  cls: "SPECIAL PURPOSE",
  vars: [
    { name: "STUDYID", label: "Study Identifier", mandatory: true },
    { name: "DOMAIN", label: "Domain Abbreviation", length: 2, mandatory: true },
    { name: "USUBJID", label: "Unique Subject Identifier", mandatory: true },
    { name: "SUBJID", label: "Subject Identifier for the Study", mandatory: true },
    { name: "RFSTDTC", label: "Subject Reference Start Date/Time", length: 20 },
    { name: "SITEID", label: "Study Site Identifier", mandatory: true },
    { name: "AGE", label: "Age", type: "integer", length: 8, comment: "notcollected" },
    { name: "SEX", label: "Sex", length: 1, comment: "notcollected" },
    { name: "COUNTRY", label: "Country", length: 3 },
  ],
};

const AE: Dataset = {
  name: "AE",
  label: "Adverse Events",
  structure: "One record per adverse event per subject",
  cls: "EVENTS",
  vars: [
    { name: "STUDYID", label: "Study Identifier", mandatory: true },
    { name: "DOMAIN", label: "Domain Abbreviation", length: 2, mandatory: true },
    { name: "USUBJID", label: "Unique Subject Identifier", mandatory: true },
    { name: "AESEQ", label: "Sequence Number", type: "integer", length: 8, mandatory: true },
    { name: "AETERM", label: "Reported Term for the Adverse Event", mandatory: true },
    { name: "AEDECOD", label: "Dictionary-Derived Term", comment: "demo" },
    { name: "AEBODSYS", label: "Body System or Organ Class", comment: "demo" },
    { name: "AESEV", label: "Severity/Intensity", length: 20 },
    { name: "AESER", label: "Serious Event", length: 1 },
    { name: "AESLIFE", label: "Is Life Threatening", length: 1 },
    { name: "AESTDTC", label: "Start Date/Time of Adverse Event", length: 20 },
  ],
};

const SUPPAE: Dataset = {
  name: "SUPPAE",
  label: "Supplemental Qualifiers for AE",
  structure: "One record per IDVAR, IDVARVAL and QNAM value per subject",
  cls: "RELATIONSHIP",
  vars: [
    { name: "STUDYID", label: "Study Identifier", mandatory: true },
    { name: "RDOMAIN", label: "Related Domain Abbreviation", length: 2, mandatory: true },
    { name: "USUBJID", label: "Unique Subject Identifier", mandatory: true },
    { name: "IDVAR", label: "Identifying Variable", length: 8, mandatory: true },
    { name: "IDVARVAL", label: "Identifying Variable Value", mandatory: true },
    { name: "QNAM", label: "Qualifier Variable Name", length: 8, mandatory: true },
    { name: "QLABEL", label: "Qualifier Variable Label", length: 40, mandatory: true },
    { name: "QVAL", label: "Data Value", comment: "demo", mandatory: true },
  ],
};

const ADSL: Dataset = {
  name: "ADSL",
  label: "Subject-Level Analysis Dataset",
  structure: "One record per subject",
  cls: "SUBJECT LEVEL ANALYSIS DATASET",
  vars: [
    { name: "STUDYID", label: "Study Identifier", mandatory: true },
    { name: "USUBJID", label: "Unique Subject Identifier", mandatory: true },
    { name: "SUBJID", label: "Subject Identifier for the Study" },
    { name: "SITEID", label: "Study Site Identifier" },
    { name: "AGE", label: "Age", type: "integer", length: 8, comment: "notcollected" },
    { name: "SEX", label: "Sex", length: 1, comment: "notcollected" },
    { name: "TRTSDT", label: "Date of First Exposure to Treatment", length: 10 },
    { name: "SAFFL", label: "Safety Population Flag", length: 1 },
    { name: "DPDPFL", label: "DPDP Consent Flag", length: 1 },
  ],
};

const ADAE: Dataset = {
  name: "ADAE",
  label: "Adverse Events Analysis Dataset",
  structure: "One record per adverse event per subject",
  cls: "OCCURRENCE DATA STRUCTURE",
  vars: [
    { name: "STUDYID", label: "Study Identifier", mandatory: true },
    { name: "USUBJID", label: "Unique Subject Identifier", mandatory: true },
    { name: "AESEQ", label: "Sequence Number", type: "integer", length: 8, mandatory: true },
    { name: "AETERM", label: "Reported Term for the Adverse Event" },
    { name: "AEDECOD", label: "Dictionary-Derived Term", comment: "demo" },
    { name: "AEBODSYS", label: "Body System or Organ Class", comment: "demo" },
    { name: "AESEV", label: "Severity/Intensity", length: 20 },
    { name: "AESER", label: "Serious Event", length: 1 },
    { name: "ASTDT", label: "Analysis Start Date", length: 10 },
    { name: "ASTDY", label: "Analysis Start Relative Day", type: "integer", length: 8 },
    { name: "TRTEMFL", label: "Treatment Emergent Analysis Flag", length: 1 },
    { name: "SUSPDRG", label: "Suspected Drug", comment: "custom" },
  ],
};

const STANDARDS = {
  sdtm: { name: "SDTM-IG", version: "3.2", title: "SDTM tabulation datasets", datasets: [DM, AE, SUPPAE] },
  adam: { name: "ADaM-IG", version: "1.1", title: "ADaM analysis datasets", datasets: [ADSL, ADAE] },
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function build(std: keyof typeof STANDARDS): string {
  const s = STANDARDS[std];
  const now = new Date().toISOString();
  const used = new Set<string>();
  const out: string[] = [];

  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(
    `<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3" xmlns:def="http://www.cdisc.org/ns/def/v2.0" xmlns:xlink="http://www.w3.org/1999/xlink" ODMVersion="1.3.2" FileType="Snapshot" FileOID="DEFINE.${std.toUpperCase()}.${Date.now()}" CreationDateTime="${now}" Originator="DEV RUSH - AIIA CTMS prototype" SourceSystem="AIIA CTMS" SourceSystemVersion="prototype">`
  );
  out.push(`  <Study OID="ST.AIIA-CTMS">`);
  out.push(`    <GlobalVariables>`);
  out.push(`      <StudyName>AIIA CTMS prototype</StudyName>`);
  out.push(`      <StudyDescription>${esc(s.title)} generated from consented participant data</StudyDescription>`);
  out.push(`      <ProtocolName>AIIA-CTMS</ProtocolName>`);
  out.push(`    </GlobalVariables>`);
  out.push(
    `    <MetaDataVersion OID="MDV.${std.toUpperCase()}.1" Name="${esc(s.title)}" Description="${esc(s.title)} (${s.name} ${s.version}), Define-XML 2.0 style" def:DefineVersion="2.0.0" def:StandardName="${s.name}" def:StandardVersion="${s.version}">`
  );

  for (const ds of s.datasets) {
    out.push(
      `      <ItemGroupDef OID="IG.${ds.name}" Name="${ds.name}" Repeating="Yes" IsReferenceData="No" SASDatasetName="${ds.name}" Purpose="${std === "sdtm" ? "Tabulation" : "Analysis"}" def:Structure="${esc(ds.structure)}" def:ArchiveLocationID="LF.${ds.name}">`
    );
    out.push(`        <Description><TranslatedText xml:lang="en">${esc(ds.label)}</TranslatedText></Description>`);
    ds.vars.forEach((v, i) => {
      out.push(
        `        <ItemRef ItemOID="IT.${ds.name}.${v.name}" OrderNumber="${i + 1}" Mandatory="${v.mandatory ? "Yes" : "No"}"/>`
      );
    });
    out.push(`        <def:Class Name="${ds.cls}"/>`);
    out.push(`        <def:leaf ID="LF.${ds.name}" xlink:href="${ds.name.toLowerCase()}.csv"><def:title>${ds.name.toLowerCase()}.csv</def:title></def:leaf>`);
    out.push(`      </ItemGroupDef>`);
  }

  for (const ds of s.datasets) {
    for (const v of ds.vars) {
      const type = v.type || "text";
      const length = v.length ?? 200;
      const com = v.comment ? ` def:CommentOID="${COMMENTS[v.comment].oid}"` : "";
      if (v.comment) used.add(v.comment);
      out.push(
        `      <ItemDef OID="IT.${ds.name}.${v.name}" Name="${v.name}" SASFieldName="${v.name}" DataType="${type}" Length="${length}"${com}>`
      );
      out.push(`        <Description><TranslatedText xml:lang="en">${esc(v.label)}</TranslatedText></Description>`);
      out.push(`      </ItemDef>`);
    }
  }

  for (const key of Array.from(used) as (keyof typeof COMMENTS)[]) {
    const c = COMMENTS[key];
    out.push(`      <def:CommentDef OID="${c.oid}"><Description><TranslatedText xml:lang="en">${esc(c.text)}</TranslatedText></Description></def:CommentDef>`);
  }

  out.push(`    </MetaDataVersion>`);
  out.push(`  </Study>`);
  out.push(`</ODM>`);
  return out.join("\n") + "\n";
}

export async function GET(request: Request) {
  try {
    await requireRole(request, ["PI", "ADMIN", "DATA_MANAGER", "REGULATORY"]);
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return new Response(err.message + "\n", {
        status: err.status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw err;
  }

  const url = new URL(request.url);
  const std = (url.searchParams.get("standard") || "").toLowerCase();
  const download = url.searchParams.get("download") === "1";

  if (std !== "sdtm" && std !== "adam") {
    return new Response(
      "Use ?standard=sdtm or ?standard=adam  (add &download=1 to save as define.xml)\n",
      { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const xml = build(std);
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      ...(download ? { "Content-Disposition": `attachment; filename="define-${std}.xml"` } : {}),
    },
  });
}