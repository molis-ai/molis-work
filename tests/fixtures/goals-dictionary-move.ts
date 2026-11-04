import assert from "node:assert/strict";
import ts from "typescript";

const GOALS = "io.molis.work.goals";

/** Compact JSON property tokens, kept verbatim: only the approved moved properties may change. */
function entries(json: string) {
  JSON.parse(json);
  const file = ts.parseJsonText("words.json", json), expression = file.statements[0]?.expression;
  assert.ok(expression && ts.isObjectLiteralExpression(expression), "dictionary payload must be an object");
  const names = new Set<string>();
  const result = expression.properties.map(property => {
    assert.ok(ts.isPropertyAssignment(property) && ts.isStringLiteral(property.name), "dictionary property must have a JSON string key");
    const key = property.name.text, valueToken = property.initializer.getText(file);
    assert.ok(!names.has(key), `duplicate dictionary property: ${key}`); names.add(key);
    const value: unknown = JSON.parse(valueToken);
    return { key, value, valueToken, keyToken: property.name.getText(file), raw: property.getText(file) };
  });
  assert.equal(json, `{${result.map(property => property.raw).join(",")}}`, "dictionary JSON must retain its compact property boundaries");
  return result;
}

/** Locate only complete assignments in their existing inline script; no executable script is discarded. */
function dictionaries(html: string) {
  const messages: { start: number; end: number; json: string; script: number }[] = [], words: typeof messages = [];
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    const code = script[1]!;
    if (!code.includes("MOLIS_WORK_MESSAGES") && !code.includes("MOLIS_WORK_PLUGIN_WORDS")) continue;
    const file = ts.createSourceFile("inline.js", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const offset = script.index! + script[0].indexOf(">") + 1;
    const visit = (node: ts.Node) => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        && ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression) && node.left.expression.text === "globalThis"
        && ["MOLIS_WORK_MESSAGES", "MOLIS_WORK_PLUGIN_WORDS"].includes(node.left.name.text)) {
        assert.ok(ts.isExpressionStatement(node.parent) && node.parent.expression === node && ts.isObjectLiteralExpression(node.right), "dictionary must be a complete object assignment");
        assert.equal(code.slice(node.right.end, node.parent.end).trim(), ";", "dictionary assignment must end at its JSON boundary");
        const json = node.right.getText(file); entries(json);
        (node.left.name.text === "MOLIS_WORK_MESSAGES" ? messages : words).push({ start: offset + node.right.getStart(file), end: offset + node.right.end, json, script: script.index! });
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  if (!messages.length && !words.length) return null;
  assert.equal(messages.length, 1, "exactly one messages assignment");
  assert.equal(words.length, 1, "exactly one plugin words assignment");
  assert.equal(messages[0]!.script, words[0]!.script, "the two assignments stay in the same i18n script");
  return { messages: messages[0]!, words: words[0]! };
}

/** Root's RAC-2680/2686 exception: move the fixed B words, retaining all other HTML and JSON tokens. */
export function expectedGoalsDictionaryMove(reference: string, moved: Readonly<Record<string, string>>, locale: "zh" | "en"): string {
  const found = dictionaries(reference);
  if (!found || locale === "zh") return reference;
  const global = entries(found.messages.json), plugins = entries(found.words.json);
  const goal = plugins.find(property => property.key === GOALS);
  assert.ok(goal, "the independent reference has the Goals dictionary");
  const own = entries(goal.valueToken), transfers = Object.entries(moved).map(([key, value]) => {
    const source = global.find(property => property.key === key);
    assert.ok(source && source.value === value, `independent B original value differs: ${key}`);
    const existing = own.find(property => property.key === key);
    assert.ok(!existing || existing.value === value, `independent B already has a different Goals value: ${key}`);
    return source;
  });
  const keep = global.filter(property => !Object.hasOwn(moved, property.key));
  const added = transfers.filter(property => !own.some(existing => existing.key === property.key));
  const goalJson = `{${[...own, ...added].map(property => property.raw).join(",")}}`;
  const edits = [
    { ...found.messages, json: `{${keep.map(property => property.raw).join(",")}}` },
    { ...found.words, json: `{${plugins.map(property => property === goal ? `${property.keyToken}:${goalJson}` : property.raw).join(",")}}` },
  ];
  let expected = reference;
  for (const edit of edits.sort((left, right) => right.start - left.start)) expected = expected.slice(0, edit.start) + edit.json + expected.slice(edit.end);
  return expected;
}

export function assertGoalsDictionaryMove(reference: string, candidate: string, moved: Readonly<Record<string, string>>, locale: "zh" | "en"): void {
  dictionaries(candidate);
  const expected = expectedGoalsDictionaryMove(reference, moved, locale);
  if (candidate !== expected) {
    let at = 0; while (at < candidate.length && candidate[at] === expected[at]) at++;
    throw new Error(`Full HTML differs outside the fixed dictionary owner move at character ${at}; expected ${JSON.stringify(expected.slice(at, at + 100))}, got ${JSON.stringify(candidate.slice(at, at + 100))}`);
  }
}
