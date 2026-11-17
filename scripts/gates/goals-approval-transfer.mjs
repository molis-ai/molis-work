import ts from "typescript";
import { constantsIn, unwrapExpression } from "./upgrade-steps.mjs";

// APR-19: the platform and Goals move together in the same project database transaction.
export const GOALS_APPROVAL_TRANSFER = Object.freeze({
  projectDefinition: "apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE",
  goalsDefinition: "plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE",
  pluginId: "io.molis.work.goals",
  projectStore: "projects/*/molis-work.db",
  goalsStore: "projects/<project_id>/molis-work.db#goals",
  // The platform migration runs once, independent of the version on the Goals owner ledger.
  from: 3, to: 4,
  goalsFrom: 4, goalsTo: 5,
  syncEntry: "sync.collection.goals.project_goals",
  syncManifest: "plugins/native/goals/src/manifest.ts",
});

function value(object, key) {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  const properties = object.properties.filter(property => property.name && ts.isIdentifier(property.name) && property.name.text === key);
  const property = properties[0];
  return properties.length === 1 && ts.isPropertyAssignment(property) ? unwrapExpression(property.initializer) : undefined;
}

const literal = (node, number) => node && ts.isNumericLiteral(node) && Number(node.text) === number;
const reference = (node, name) => node && ts.isIdentifier(node) && node.text === name;

export function hasGoalsApprovalTransfer(read) {
  const transfer = GOALS_APPROVAL_TRANSFER;
  const [file, name] = transfer.projectDefinition.split("#");
  const source = read(file);
  if (!source || !read("apps/local-host/src/project-approval-upgrade.ts")) return false;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const constants = constantsIn(tree), baseline = constants.get(name);
  const upgrades = value(baseline, "upgrades");
  const steps = upgrades && ts.isIdentifier(upgrades) ? constants.get(upgrades.text) : upgrades;
  if (!literal(value(baseline, "version"), transfer.to) || !steps || !ts.isArrayLiteralExpression(steps)) return false;
  const matching = steps.elements.map(unwrapExpression).filter(step => literal(value(step, "from"), transfer.from));
  if (matching.length !== 1 || !reference(value(matching[0], "sql"), "PROJECT_APPROVALS_SCHEMA_SQL")
    || !reference(value(matching[0], "run"), "transferProjectApprovals")) return false;
  return tree.statements.some(statement => ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === "./project-approval-upgrade.js" && !statement.importClause?.isTypeOnly
    && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some(item => !item.isTypeOnly && !item.propertyName && item.name.text === "transferProjectApprovals"));
}
