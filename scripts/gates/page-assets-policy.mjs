// CCR-02/03/04 and FSS-BG-02: allowances belong to a change, never to an absolute historical size.
import { GATED_PAGES, isFirstScreenPath, SSE_FIRST_EVENT, workbenchLanguageEntry } from "../first-screen/manifest.mjs";
import { LOCALES } from "../first-screen/host.mjs";

const PAGE_KEYS = new Set(GATED_PAGES.flatMap(page => LOCALES.map(locale => `${page}/${locale}`)));
export const VISITS = ["cold", "warm"];
export const ALLOWANCES = "tooling/gates/page-asset-allowances/";
export function sizeMap(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) throw new Error(`${where}: expected nonempty asset sizes`);
  for (const [asset, size] of Object.entries(value)) {
    if (!/^\/assets\/[^\s?#]+$/.test(asset) || !Number.isSafeInteger(size) || size <= 0) throw new Error(`${where}: invalid asset or byte count: ${asset}`);
  }
  return value;
}
function checkPageBudgets(pages, where, userApproval) {
  if (!pages || typeof pages !== "object" || Array.isArray(pages) || !Object.keys(pages).length) throw new Error(`${where}: expected nonempty page budgets`);
  for (const [key, budget] of Object.entries(pages)) {
    if (!PAGE_KEYS.has(key) || !budget || typeof budget !== "object" || Array.isArray(budget)
      || Object.keys(budget).length !== VISITS.length || VISITS.some(visit => !Number.isSafeInteger(budget[visit]) || budget[visit] < 0)
      || !userApproval && VISITS.every(visit => budget[visit] === 0)) {
      throw new Error(`${where}: invalid page or byte budget: ${key}`);
    }
  }
}

function checkEntryApprovals(rows, userApproval) {
  if (!userApproval || !Array.isArray(rows) || !rows.length) throw new Error("entryApprovals requires a nonempty list and userApproval");
  const validPath = (value, page) => value === "<page>" || isFirstScreenPath(value, page);
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)
      || Object.keys(row).some(key => !["pages", "locale", "entry", "change", "document", "response"].includes(key))
      || !Array.isArray(row.pages) || !row.pages.length || new Set(row.pages).size !== row.pages.length
      || row.pages.some(page => !GATED_PAGES.includes(page))
      || ![...LOCALES, "both"].includes(row.locale) || !["new", "growth"].includes(row.change)
      || Object.hasOwn(row, "response") && row.response !== SSE_FIRST_EVENT) {
      throw new Error("invalid first-screen entry approval");
    }
    const scoped = Object.hasOwn(row, "document") || Object.hasOwn(row, "response");
    const pack = !scoped && LOCALES.includes(row.locale) && row.entry === workbenchLanguageEntry(row.locale);
    if (row.pages.some(page => !pack && !validPath(row.entry, page)
      || Object.hasOwn(row, "document") && !validPath(row.document, page))) {
      throw new Error("invalid first-screen approval path or source document");
    }
  }
}

export function readNewAllowances(current, previous) {
  const errors = [], records = [];
  for (const [file, text] of Object.entries(previous)) {
    if (current[file] !== text) errors.push(`${file}: an adopted allowance cannot be changed or removed`);
  }
  for (const [file, text] of Object.entries(current)) {
    if (Object.hasOwn(previous, file)) continue;
    try {
      const record = JSON.parse(text);
      if (!record || typeof record !== "object" || Array.isArray(record) || Object.keys(record).some(key => !["reason", "review", "userApproval", "assets", "pages", "entryApprovals"].includes(key))) throw new Error("unknown fields");
      for (const field of ["reason", "review"]) if (typeof record[field] !== "string" || !record[field].trim()) throw new Error(`missing ${field}`);
      if (record.userApproval !== undefined && (typeof record.userApproval !== "string" || !record.userApproval.trim())) throw new Error("empty userApproval");
      if (record.assets === undefined && record.pages === undefined && record.entryApprovals === undefined) throw new Error("expected assets, pages or entryApprovals");
      if (record.assets !== undefined) sizeMap(record.assets, file);
      if (record.pages !== undefined) checkPageBudgets(record.pages, file, record.userApproval);
      if (record.entryApprovals !== undefined) checkEntryApprovals(record.entryApprovals, record.userApproval);
      records.push([file, record]);
    } catch (error) { errors.push(`${file}: invalid allowance: ${error.message}`); }
  }
  return { errors, records };
}

export function assetProblems(measured, base, current, previous) {
  sizeMap(measured, "measurement"); sizeMap(base, "base measurement");
  const { errors, records } = readNewAllowances(current, previous);
  const allowed = {}, approvals = {};
  for (const [file, record] of records) {
    for (const [asset, delta] of Object.entries(record.assets ?? {})) {
      if (!(asset in base) || delta > 10_000) {
        if (!record.userApproval) errors.push(`${file}: ${asset} is new or over 10 KB; userApproval is required`);
      }
      allowed[asset] = (allowed[asset] ?? 0) + delta;
      approvals[asset] = (approvals[asset] ?? true) && Boolean(record.userApproval);
    }
  }
  for (const [asset, bytes] of Object.entries(measured)) {
    const delta = bytes - (base[asset] ?? 0);
    if (delta <= 0) continue;
    if (delta > (allowed[asset] ?? 0)) errors.push(`${asset} grew ${base[asset] ?? 0} → ${bytes} (+${delta}); new allowances cover ${allowed[asset] ?? 0} bytes`);
    if ((!(asset in base) || delta > 10_000) && !approvals[asset]) errors.push(`${asset}: new asset or growth over 10 KB requires userApproval for its allowances`);
  }
  return errors;
}
