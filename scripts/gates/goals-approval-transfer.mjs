import ts from "typescript";
import { constantsIn, unwrapExpression } from "./upgrade-steps.mjs";

const literal = (node, number) => node && ts.isNumericLiteral(node) && Number(node.text) === number;
const reference = (node, name) => node && ts.isIdentifier(node) && node.text === name;

function value(object, key) {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined;
  const properties = object.properties.filter(property => property.name && ts.isIdentifier(property.name) && property.name.text === key);
  const property = properties[0];
  return properties.length === 1 && ts.isPropertyAssignment(property) ? unwrapExpression(property.initializer) : undefined;
}

/** The step spreads exactly this name (`{ from: 5, ...projectLibraryV6Upgrade }`). */
const spreads = (object, name) => Boolean(object && ts.isObjectLiteralExpression(object)
  && object.properties.filter(property => ts.isSpreadAssignment(property)).length === 1
  && object.properties.some(property => ts.isSpreadAssignment(property) && reference(unwrapExpression(property.expression), name)));

/**
 * Project-library steps that move Goals' library in the same transaction; Goals declares no step of its own for them.
 * - APR-19 (batch 39): project 3→4 hands the approvals to the platform; Goals 4→5.
 * - Batch 44 D1 (`docs/system/CONTRACT-CHANGES.md`「第 44 批存量搬迁」, user 2026-11-17): project 5→6 rewrites the relations naming
 *   Goals and Feed and moves Goals' sync collection to `project_goals@3`; Goals 5→6. It is the project's 5→6 step: main's 4→5 (the built-in
 *   plugins' private values, #2118) touches no Goals table, so the project's versions 4 and 5 both hold Goals' v5.
 * `binding` is what the project library imports from `module` and the step uses; `hostStep` the step the Host exports, read by the
 * store snapshot to check the installed writer is the one in the chain. `sync` is the step Goals' sync collection takes with it, and
 * `sync.goals` the Goals tables a golden at the project's `from` must hold for the replay to start that collection there.
 */
export const GOALS_APPROVAL_TRANSFER = Object.freeze({
  projectDefinition: "apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE",
  goalsDefinition: "plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE",
  pluginId: "io.molis.work.goals",
  projectStore: "projects/*/molis-work.db",
  goalsStore: "projects/<project_id>/molis-work.db#goals",
  syncEntry: "sync.collection.goals.project_goals",
  syncManifest: "plugins/native/goals/src/manifest.ts",
  steps: Object.freeze([
    Object.freeze({ from: 3, to: 4, goalsFrom: 4, goalsTo: 5, module: "./project-approval-upgrade.js", binding: "transferProjectApprovals", hostStep: "projectApprovalUpgrade",
      sync: Object.freeze({ from: 1, to: 2, goals: 3 }),
      matches: step => reference(value(step, "sql"), "PROJECT_APPROVALS_SCHEMA_SQL") && reference(value(step, "run"), "transferProjectApprovals") }),
    Object.freeze({ from: 5, to: 6, goalsFrom: 5, goalsTo: 6, module: "./project-library-v6-upgrade.js", binding: "projectLibraryV6Upgrade", hostStep: "projectLibraryV6Step",
      sync: Object.freeze({ from: 2, to: 3, goals: 5 }),
      matches: step => spreads(step, "projectLibraryV6Upgrade") }),
  ]),
});

/** The joint step a Goals row's `old → new` is, if it is one. */
export const goalsJointStep = (from, to) => GOALS_APPROVAL_TRANSFER.steps.find(step => step.goalsFrom === from && step.goalsTo === to);

/** Whether the project library's chain has this joint step, written the way the step reads, with its writer imported. */
export function hasGoalsApprovalTransfer(read, step = GOALS_APPROVAL_TRANSFER.steps[0]) {
  const transfer = GOALS_APPROVAL_TRANSFER;
  const [file, name] = transfer.projectDefinition.split("#");
  const source = read(file);
  if (!source || !read("apps/local-host/src/" + step.module.slice(2).replace(/\.js$/u, ".ts"))) return false;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const constants = constantsIn(tree), baseline = constants.get(name);
  const upgrades = value(baseline, "upgrades");
  const steps = upgrades && ts.isIdentifier(upgrades) ? constants.get(upgrades.text) : upgrades;
  const version = value(baseline, "version");
  if (!version || !ts.isNumericLiteral(version) || Number(version.text) < step.to || !steps || !ts.isArrayLiteralExpression(steps)) return false;
  const matching = steps.elements.map(unwrapExpression).filter(element => literal(value(element, "from"), step.from));
  if (matching.length !== 1 || !step.matches(matching[0])) return false;
  return tree.statements.some(statement => ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === step.module && !statement.importClause?.isTypeOnly
    && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some(item => !item.isTypeOnly && !item.propertyName && item.name.text === step.binding));
}
