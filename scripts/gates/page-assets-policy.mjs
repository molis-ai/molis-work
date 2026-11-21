// Batch 100-2 (Decision 58): route / surface total payload budgets + first-screen route ceilings
// (replacing per-byte tooling/gates/page-asset-allowances/*.json files).
import { GATED_PAGES } from "../first-screen/manifest.mjs";
import { LOCALES } from "../first-screen/host.mjs";

export const VISITS = ["cold", "warm"];
export const BUDGETS_FILE = "tooling/gates/page-asset-budgets.json";
export const RETIRED_ALLOWANCES_DIR = "tooling/gates/page-asset-allowances/";

const ASSET_PATH = /^\/(?:assets|desktop)\/[^\s?#]+$/;

export function sizeMap(value, where) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) {
    throw new Error(`${where}: expected nonempty asset sizes`);
  }
  for (const [asset, size] of Object.entries(value)) {
    if (!ASSET_PATH.test(asset) || !Number.isSafeInteger(size) || size <= 0) {
      throw new Error(`${where}: invalid asset or byte count: ${asset}`);
    }
  }
  return value;
}

const isPositiveInt = (value) => Number.isSafeInteger(value) && value > 0;
const isStringList = (value) => Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0);

export function parsePageAssetBudgets(text, where = BUDGETS_FILE) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${where}: invalid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${where}: expected a JSON object`);
  const allowedTop = ["routes", "maxSingleAssetBytes", "maxPluginAssetBytes", "firstScreen"];
  for (const key of Object.keys(parsed)) {
    if (!allowedTop.includes(key)) throw new Error(`${where}: unknown top-level key "${key}"`);
  }
  if (!parsed.routes || typeof parsed.routes !== "object" || Array.isArray(parsed.routes) || !Object.keys(parsed.routes).length) {
    throw new Error(`${where}: expected a non-empty "routes" object`);
  }
  for (const [name, rule] of Object.entries(parsed.routes)) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new Error(`${where}: route "${name}" must be an object`);
    for (const key of Object.keys(rule)) {
      if (!["maxBytes", "assets", "prefixes", "suffixes"].includes(key)) throw new Error(`${where}: route "${name}" has unknown key "${key}"`);
    }
    if (!isPositiveInt(rule.maxBytes)) throw new Error(`${where}: route "${name}" needs positive integer maxBytes`);
    if (rule.assets !== undefined && !isStringList(rule.assets)) throw new Error(`${where}: route "${name}" has invalid assets list`);
    if (rule.prefixes !== undefined && !isStringList(rule.prefixes)) throw new Error(`${where}: route "${name}" has invalid prefixes list`);
    if (rule.suffixes !== undefined && !isStringList(rule.suffixes)) throw new Error(`${where}: route "${name}" has invalid suffixes list`);
    if (!rule.assets && !rule.prefixes && !rule.suffixes) throw new Error(`${where}: route "${name}" must declare assets, prefixes, or suffixes`);
  }
  if (!isPositiveInt(parsed.maxSingleAssetBytes)) throw new Error(`${where}: needs positive integer maxSingleAssetBytes`);
  if (!isPositiveInt(parsed.maxPluginAssetBytes)) throw new Error(`${where}: needs positive integer maxPluginAssetBytes`);
  if (!parsed.firstScreen || typeof parsed.firstScreen !== "object" || Array.isArray(parsed.firstScreen)) {
    throw new Error(`${where}: expected a "firstScreen" object`);
  }
  for (const page of GATED_PAGES) {
    const row = parsed.firstScreen[page];
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some((key) => !VISITS.includes(key))
      || VISITS.some((visit) => !isPositiveInt(row[visit]))) {
      throw new Error(`${where}: firstScreen.${page} needs positive integer cold and warm budgets`);
    }
  }
  for (const page of Object.keys(parsed.firstScreen)) {
    if (!GATED_PAGES.includes(page)) throw new Error(`${where}: unknown firstScreen page "${page}"`);
  }
  return parsed;
}

const matchesRoute = (asset, rule) => Boolean(
  rule.assets?.includes(asset)
  || rule.prefixes?.some((prefix) => asset.startsWith(prefix))
  || rule.suffixes?.some((suffix) => asset.endsWith(suffix)),
);

export function routeTotals(measured, budgets) {
  const totals = {};
  const covered = new Set();
  for (const [name, rule] of Object.entries(budgets.routes)) {
    let bytes = 0;
    for (const [asset, size] of Object.entries(measured)) {
      if (!matchesRoute(asset, rule)) continue;
      bytes += size;
      covered.add(asset);
    }
    totals[name] = bytes;
  }
  return { totals, covered };
}

export function budgetLooseningProblems(headBudgets, baseBudgets) {
  if (!baseBudgets) return [];
  const errors = [];
  for (const [name, before] of Object.entries(baseBudgets.routes)) {
    const after = headBudgets.routes[name];
    if (!after) {
      errors.push(`${BUDGETS_FILE}: route "${name}" removed (was maxBytes ${before.maxBytes}); budgets may only get tighter`);
    } else if (after.maxBytes > before.maxBytes) {
      errors.push(`${BUDGETS_FILE}: route "${name}" budget loosened ${before.maxBytes} → ${after.maxBytes}; budgets may only get tighter`);
    }
  }
  if (headBudgets.maxSingleAssetBytes > baseBudgets.maxSingleAssetBytes) {
    errors.push(`${BUDGETS_FILE}: maxSingleAssetBytes loosened ${baseBudgets.maxSingleAssetBytes} → ${headBudgets.maxSingleAssetBytes}; budgets may only get tighter`);
  }
  if (headBudgets.maxPluginAssetBytes > baseBudgets.maxPluginAssetBytes) {
    errors.push(`${BUDGETS_FILE}: maxPluginAssetBytes loosened ${baseBudgets.maxPluginAssetBytes} → ${headBudgets.maxPluginAssetBytes}; budgets may only get tighter`);
  }
  for (const page of GATED_PAGES) {
    for (const visit of VISITS) {
      const before = baseBudgets.firstScreen[page][visit];
      const after = headBudgets.firstScreen[page][visit];
      if (after > before) {
        errors.push(`${BUDGETS_FILE}: firstScreen.${page}.${visit} loosened ${before} → ${after}; budgets may only get tighter`);
      }
    }
  }
  return errors;
}

export function assetBudgetProblems(measured, budgets, baseBudgets = null) {
  sizeMap(measured, "measurement");
  const errors = [...budgetLooseningProblems(budgets, baseBudgets)];
  const { totals, covered } = routeTotals(measured, budgets);
  for (const asset of Object.keys(measured).sort()) {
    if (!covered.has(asset)) {
      errors.push(`${asset}: unbudgeted asset route; classify it in ${BUDGETS_FILE}`);
    }
  }
  for (const [name, rule] of Object.entries(budgets.routes)) {
    const bytes = totals[name] ?? 0;
    if (bytes > rule.maxBytes) {
      errors.push(`route "${name}" total ${bytes} B exceeds budget ${rule.maxBytes} B (+${bytes - rule.maxBytes} B)`);
    }
  }
  const pluginPackAssets = new Set(budgets.routes.pluginPacks?.assets ?? []);
  for (const [asset, bytes] of Object.entries(measured).sort(([a], [b]) => a.localeCompare(b))) {
    if (asset.endsWith(".woff2")) continue;
    if (bytes > budgets.maxSingleAssetBytes) {
      errors.push(`${asset} (${bytes} B) exceeds maxSingleAssetBytes (${budgets.maxSingleAssetBytes} B)`);
    }
    if ((asset.startsWith("/assets/molis-work-plugins/") || pluginPackAssets.has(asset)) && bytes > budgets.maxPluginAssetBytes) {
      errors.push(`${asset} (${bytes} B) exceeds maxPluginAssetBytes (${budgets.maxPluginAssetBytes} B)`);
    }
  }
  return errors;
}

export function firstScreenBudgetProblems(candidate, budgets, baseBudgets = null) {
  const errors = [...budgetLooseningProblems(budgets, baseBudgets)];
  for (const page of GATED_PAGES) {
    for (const locale of LOCALES) {
      const key = `${page}/${locale}`;
      const next = candidate?.[key];
      if (!next?.totals) {
        errors.push(`${key}: incomplete page measurement`);
        continue;
      }
      for (const visit of VISITS) {
        const bytes = next.totals[visit];
        const limit = budgets.firstScreen[page][visit];
        if (!Number.isSafeInteger(bytes) || bytes < 0) {
          errors.push(`${key} ${visit}: invalid measured byte total`);
        } else if (bytes > limit) {
          errors.push(`${key} ${visit} total ${bytes} B exceeds first-screen budget ${limit} B (+${bytes - limit} B)`);
        }
      }
    }
  }
  return errors;
}
