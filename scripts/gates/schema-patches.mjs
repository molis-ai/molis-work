// The in-place schema patch count (`schemaPatches`, tooling/gates/README.md「就地补表」):
// table patching in source (`ALTER TABLE` and `ensureSqliteColumn(`), which may only go down.
// During pre-development all stores stay at v1 with zero upgrade steps, so there is no `upgrades` exemption for ALTER TABLE.
//
// Two spellings a plain regex could not see count too, so moving the words is not a way past this: an expression that folds to the
// words (`"ALTER " + "TABLE"`, a template, an array join, or a string that ends on the verb, for the noun to come from elsewhere),
// and a tracked `.sql` file in the source areas. Not server/migrations/: those are D1 migrations, not Home libraries.
//
// A SECOND COUNT (`schemaExecs`), per file: `db.exec(X_SCHEMA_SQL)`, a call to `exec` whose argument names a constant with SCHEMA as a word
// of its name. It makes tables by hand, beside the baselines and with no version, and it needs no ALTER TABLE to patch one (the text can
// say CREATE TABLE IF NOT EXISTS). Every code file under the source roots counts, a package's own tests too. The top-level tests/ does not:
// there it makes the tables of an in-memory fixture from the owner's exported text.
import ts from "typescript";
import { CODE_FILE } from "../script-paths.mjs";
import { isUnderSourceRoots, scriptKind } from "../version-source.mjs";
import { isSource } from "./giant-units.mjs";

const ALTER_TABLE = /ALTER\s+TABLE/gi;
const ENSURE_COLUMN = /ensureSqliteColumn\(/g;
const ENDS_ON_VERB = /(?:^|\s)ALTER\s*$/;
// A file with neither word can only spell them by cutting both apart, which is not counted anyway, so it can skip the parse.
const WORTH_PARSING = /ALTER|TABLE/i;

const isPatchSql = (file) => file.endsWith(".sql") && !file.startsWith("server/migrations/") && isSource(`${file.slice(0, -".sql".length)}.ts`);
export const schemaPatchesWantText = (file) => isSource(file) || isPatchSql(file);

const isWrapper = (node) => ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node);
const unwrap = (node) => { while (node && isWrapper(node)) node = node.expression; return node; };

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
  return ensure + alterAt.length + foldedPatches(tree, alterAt);
}

export function measureSchemaPatches(snapshot) {
  let count = 0;
  for (const file of snapshot.files.filter(schemaPatchesWantText)) count += countSchemaPatches(file, snapshot.read(file) ?? "");
  return count;
}

const SCHEMA_CONSTANT = /(?:^|_)SCHEMA(?:_|$)/;
export const schemaExecsWantText = (file) => isUnderSourceRoots(file) && CODE_FILE.test(file);

/** How many calls to `exec` in one file are handed a schema constant, alone, in a template, or joined to something. */
export function countSchemaExecs(file, text) {
  if (!text.includes(".exec") || !text.includes("SCHEMA")) return 0;
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const namesSchema = (node) => (ts.isIdentifier(node) && SCHEMA_CONSTANT.test(node.text)) || !!ts.forEachChild(node, namesSchema);
  let count = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "exec" && node.arguments.some(namesSchema)) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return count;
}

export function measureSchemaExecs(snapshot) {
  const counts = {};
  for (const file of snapshot.files.filter(schemaExecsWantText)) {
    const count = countSchemaExecs(file, snapshot.read(file) ?? "");
    if (count) counts[file] = count;
  }
  return counts;
}
