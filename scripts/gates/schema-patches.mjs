// The in-place schema patch count (`schemaPatches`, tooling/gates/README.md「就地补表」, specs/upgrade-continuity/upgrade-chain-design.md §11.4):
// table patching outside a baseline schema, which may only go down. Before the upgrade chain this was a regex over every source
// file. A step of the chain has to say ALTER TABLE, so one place is now left out, and only that place: the `sql` text of a step,
// or a string inside its `run` function, in the `upgrades` array literal of a baseline constant. Those run only in the upgrade
// process, under the owner lock (packages/storage/src/sqlite-upgrade.ts). Everything the regex counted elsewhere still counts:
// comments, `schema` texts, other strings, even inside the same array (a `verify`, a call evaluated when the module loads).
// `ensureSqliteColumn(` is unchanged, with no exception.
//
// Two spellings the regex could not see count now, so moving the words is not a way past this: an expression that folds to the
// words (`"ALTER " + "TABLE"`, a template, an array join, or a string that ends on the verb, for the noun to come from elsewhere),
// and a tracked `.sql` file in the source areas. Not server/migrations/: those are D1 migrations, not Home libraries, and D1 has no
// `upgrades` literal to move them to.
//
// KNOWN GAP. It reads where the text is, not what runs it: `db.exec(PAGES_DATABASE.upgrades[0].sql)` on a read path is not seen. Other
// spellings it does not see, all of which take intent to write, are listed in tooling/gates/README.md「就地补表」.
import ts from "typescript";
import { isSource } from "./giant-units.mjs";

const ALTER_TABLE = /ALTER\s+TABLE/gi;
const ENSURE_COLUMN = /ensureSqliteColumn\(/g;
const ENDS_ON_VERB = /(?:^|\s)ALTER\s*$/;
// A file with neither word can only spell them by cutting both apart, which is not counted anyway, so it can skip the parse.
const WORTH_PARSING = /ALTER|TABLE/i;
const BASELINE_TYPES = new Set(["SqliteBaseline", "PluginDatabaseDeclaration", "HomePluginDatabaseDeclaration"]);

const isPatchSql = (file) => file.endsWith(".sql") && !file.startsWith("server/migrations/") && isSource(`${file.slice(0, -".sql".length)}.ts`);
export const schemaPatchesWantText = (file) => isSource(file) || isPatchSql(file);

const isWrapper = (node) => ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node);
const unwrap = (node) => { while (node && isWrapper(node)) node = node.expression; return node; };
const namesBaseline = (type) => !!type && ts.isTypeReferenceNode(type) && BASELINE_TYPES.has(type.typeName.getText());
const propertyNamed = (object, name) => object.properties.find((property) => ts.isPropertyAssignment(property)
  && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) && property.name.text === name);

/** The object literal of a `const` declared as a baseline in one of the three spellings scripts/verify-release-versions.mjs lists, or null. */
function baselineLiteral(declaration) {
  if (!(declaration.parent.flags & ts.NodeFlags.Const)) return null;
  let typed = namesBaseline(declaration.type), value = declaration.initializer;
  while (value && isWrapper(value)) {
    if (!ts.isParenthesizedExpression(value) && namesBaseline(value.type)) typed = true;
    value = value.expression;
  }
  return typed && value && ts.isObjectLiteralExpression(value) ? value : null;
}

/** Where the words may stand: the [start, end) of each string token in the `sql` or the `run` of a step in a baseline's `upgrades` literal. */
function stepTextRegions(tree) {
  const regions = [];
  const add = (node) => regions.push([node.getStart(tree), node.end]);
  const stringsInside = (node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) add(node);
    ts.forEachChild(node, stringsInside);
  };
  const stepText = (step) => {
    const sql = unwrap(propertyNamed(step, "sql")?.initializer);
    if (sql && ts.isStringLiteralLike(sql)) add(sql);
    else if (sql && ts.isTemplateExpression(sql)) { add(sql.head); for (const span of sql.templateSpans) add(span.literal); }
    const run = unwrap(propertyNamed(step, "run")?.initializer);
    if (run && (ts.isArrowFunction(run) || ts.isFunctionExpression(run))) stringsInside(run.body);
  };
  const visit = (node) => {
    const baseline = ts.isVariableDeclaration(node) ? baselineLiteral(node) : null;
    const upgrades = baseline && unwrap(propertyNamed(baseline, "upgrades")?.initializer);
    if (upgrades && ts.isArrayLiteralExpression(upgrades)) {
      for (const element of upgrades.elements) {
        const step = unwrap(element);
        if (ts.isObjectLiteralExpression(step)) stepText(step);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return regions;
}

/** Text that only exists when an expression is put together: counted once per expression, unless the words are also there to be read. */
function foldedPatches(tree, alterAt) {
  let count = 0;
  const isJoin = (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "join" && ts.isArrayLiteralExpression(unwrap(node.expression.expression));
  const isPlus = (node) => ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
  const isFolding = (node) => ts.isStringLiteralLike(node) || ts.isTemplateExpression(node) || isPlus(node) || isJoin(node);
  // A part that cannot be read folds to nothing, so "ALTER " + name + " TABLE" still reads as the words; its inside is visited on its own.
  const fold = (part) => {
    const node = unwrap(part);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.flatMap((span) => [fold(span.expression), span.literal.text])].join("");
    if (isPlus(node)) return `${fold(node.left)}${fold(node.right)}`;
    if (isJoin(node)) return unwrap(node.expression.expression).elements.map(fold).join(" ");
    visit(node);
    return "";
  };
  const visit = (node) => {
    if (!isFolding(node)) { ts.forEachChild(node, visit); return; }
    const folded = fold(node);
    if (!/ALTER\s+TABLE/i.test(folded) && !ENDS_ON_VERB.test(folded)) return;
    const start = node.getStart(tree);
    if (!alterAt.some((at) => at >= start && at < node.end)) count += 1;
  };
  visit(tree);
  return count;
}

/** How many in-place schema patches one source or `.sql` file holds. */
export function countSchemaPatches(file, text) {
  const ensure = text.match(ENSURE_COLUMN)?.length ?? 0;
  const alterAt = [...text.matchAll(ALTER_TABLE)].map((match) => match.index);
  if (file.endsWith(".sql")) return ensure + alterAt.length;
  if (!WORTH_PARSING.test(text)) return ensure;
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const regions = stepTextRegions(tree);
  return ensure + alterAt.filter((at) => !regions.some(([start, end]) => at >= start && at < end)).length + foldedPatches(tree, alterAt);
}

export function measureSchemaPatches(snapshot) {
  let count = 0;
  for (const file of snapshot.files.filter(schemaPatchesWantText)) count += countSchemaPatches(file, snapshot.read(file) ?? "");
  return count;
}
