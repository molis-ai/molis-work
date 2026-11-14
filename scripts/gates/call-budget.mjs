// N56 (06-3). Count actual calls to the two Host context entry points, in tracked Host source only.
// Literal member access and named import aliases are visible. Runtime indirection is covered by the HTTP budgets.
import ts from "typescript";
import { countMetric, sumOf } from "./count-metric.mjs";

const names = new Set(["localWebActionContext", "localPersonContext"]);
const mentioned = /\b(?:localWebActionContext|localPersonContext)\b/u;

function callTarget(expression) {
  while (ts.isParenthesizedExpression(expression) || ts.isNonNullExpression(expression)) expression = expression.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return names.has(expression.name.text) ? expression.name.text : undefined;
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) {
    return names.has(expression.argumentExpression.text) ? expression.argumentExpression.text : undefined;
  }
}

export function contextCallCounts(snapshot, isSource) {
  const counts = {};
  for (const file of snapshot.files) {
    if (!file.startsWith("apps/local-host/src/") || !isSource(file)) continue;
    const source = snapshot.read(file);
    if (!source || !mentioned.test(source)) continue;
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
    const bindings = new Set(names);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly) continue;
      const imports = node.importClause?.namedBindings;
      if (!imports || !ts.isNamedImports(imports)) continue;
      for (const item of imports.elements) {
        if (!item.isTypeOnly && item.propertyName?.text === "localWebActionContext") bindings.add(item.name.text);
      }
    }
    let count = 0;
    const visit = node => {
      if (ts.isCallExpression(node) && bindings.has(callTarget(node.expression))) count++;
      ts.forEachChild(node, visit);
    };
    visit(ast);
    if (count) counts[file] = count;
  }
  return counts;
}

export const contextCallMetric = ({ perFile, isSource }) => countMetric({ perFile }, {
  id: "localWebContextCalls", baselineKey: "localWebContextCalls", totalKey: "localWebContextCallsTotal",
  measure: snapshot => contextCallCounts(snapshot, isSource),
  grewWhat: "local Web context calls",
  grewHint: "build the context only when the request needs it and reuse it within that request",
  title: "Local Web context calls",
  summary: counts => `${sumOf(counts)} local Web context calls`,
});

export const CALL_BUDGET_FILE = "tooling/gates/call-budget.json";
const nonemptyRecord = value => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
const validCount = count => Number.isSafeInteger(count) && count >= 0;

function readBudget(snapshot, label, errors, required = false) {
  if (!snapshot?.files.includes(CALL_BUDGET_FILE)) {
    if (required) errors.push(`${label} is missing`);
    return {};
  }
  const text = snapshot.read(CALL_BUDGET_FILE);
  if (text === null) {
    errors.push(`${label} could not be read`);
    return {};
  }
  try {
    const data = JSON.parse(text);
    if (nonemptyRecord(data) && Object.values(data).every(counters => nonemptyRecord(counters) && Object.values(counters).every(validCount))) return data;
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return {};
  }
  errors.push(`${label} must map scenarios to nonnegative integer call counts`);
  return {};
}

// A budget may grow only through a new allowance of the change that needs it (like the page-asset allowances): a file under
// CALL_BUDGET_ALLOWANCES with a reason, a review and the user's approval, naming the counters it raises and the value each may reach.
// Allowances the merge-base already has are spent: they cannot be changed or removed, and they raise nothing again.
export const CALL_BUDGET_ALLOWANCES = "tooling/gates/call-budget-allowances/";

function allowanceTexts(snapshot) {
  const texts = {};
  for (const file of snapshot?.files ?? []) if (file.startsWith(CALL_BUDGET_ALLOWANCES)) texts[file] = snapshot.read(file);
  return texts;
}

function newAllowances(head, base, errors) {
  const current = allowanceTexts(head), previous = allowanceTexts(base), allowed = {};
  for (const [file, text] of Object.entries(previous)) if (current[file] !== text) errors.push(`${file}: an adopted allowance cannot be changed or removed`);
  for (const [file, text] of Object.entries(current)) {
    if (Object.hasOwn(previous, file)) continue;
    try {
      if (!/^tooling\/gates\/call-budget-allowances\/[a-z0-9][a-z0-9-]*\.json$/u.test(file)) throw new Error("invalid allowance filename");
      const record = JSON.parse(text ?? "");
      if (!nonemptyRecord(record) || Object.keys(record).some(key => !["reason", "review", "userApproval", "counters"].includes(key))) throw new Error("unknown fields");
      for (const field of ["reason", "review", "userApproval"]) if (typeof record[field] !== "string" || !record[field].trim()) throw new Error(`missing ${field}`);
      if (!nonemptyRecord(record.counters) || !Object.values(record.counters).every(counters => nonemptyRecord(counters) && Object.values(counters).every(validCount))) {
        throw new Error("counters must map scenarios to nonnegative integer call counts");
      }
      for (const [scenario, counters] of Object.entries(record.counters)) {
        for (const [counter, limit] of Object.entries(counters)) allowed[`${scenario}.${counter}`] = Math.max(allowed[`${scenario}.${counter}`] ?? 0, limit);
      }
    } catch (error) { errors.push(`${file}: invalid allowance: ${error.message}`); }
  }
  return allowed;
}

export function callBudgetProblems(head, base, required) {
  const errors = [];
  const before = readBudget(base, `merge-base ${CALL_BUDGET_FILE}`, errors);
  const after = readBudget(head, CALL_BUDGET_FILE, errors, required || Object.keys(before).length > 0);
  const allowed = newAllowances(head, base, errors);
  if (errors.length) return errors;
  for (const key of Object.keys(allowed)) {
    const [scenario, counter] = key.split(".");
    if (!Object.hasOwn(after[scenario] ?? {}, counter)) errors.push(`${CALL_BUDGET_FILE}: an allowance names ${key}, which the budget does not have`);
  }
  for (const [scenario, counters] of Object.entries(before)) {
    if (!Object.hasOwn(after, scenario)) {
      errors.push(`${CALL_BUDGET_FILE}: removed scenario ${scenario}`);
      continue;
    }
    for (const [counter, limit] of Object.entries(counters)) {
      const next = after[scenario];
      if (!Object.hasOwn(next, counter)) errors.push(`${CALL_BUDGET_FILE}: removed counter ${scenario}.${counter}`);
      else if (next[counter] > limit && next[counter] > (allowed[`${scenario}.${counter}`] ?? 0)) {
        errors.push(`${CALL_BUDGET_FILE}: ${scenario}.${counter} grew ${limit} → ${next[counter]}${allowed[`${scenario}.${counter}`] ? `; new allowances cover ${allowed[`${scenario}.${counter}`]}` : ""}`);
      }
    }
  }
  return errors;
}
