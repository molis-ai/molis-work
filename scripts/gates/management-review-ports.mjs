import ts from "typescript";
import { unwrapExpression } from "./upgrade-steps.mjs";

const FILE = "apps/local-host/src/management-action-client.ts";
const parse = source => ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, false);
const declaration = (file, name) => file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
const isAsync = node => node?.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword);

const entryNames = new Set(["ActionError", "undefined", "reviewOperation", "requireReview", "bindManagementActions",
  "invokeProjectReviewManagement", "currentCallId", "newCallId"]);
// References matched by name must still resolve to the captured bindings and entry points.
const distinctLocals = (...names) => names.every(name => name && !entryNames.has(name)) && new Set(names).size === names.length;

const identifier = (node, name) => Boolean(name && node && ts.isIdentifier(node) && node.text === name);
const property = (node, name) => node && (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) && node.text === name;
const member = (owner, name) => node => node && ts.isPropertyAccessExpression(node) && !node.questionDotToken
  && identifier(node.expression, owner) && property(node.name, name);

function call(node, callee, ...expected) {
  return node && ts.isCallExpression(node) && !node.questionDotToken && node.arguments.length === expected.length
    && (typeof callee === "function" ? callee(node.expression) : identifier(node.expression, callee))
    && expected.every((match, index) => typeof match === "function" ? match(node.arguments[index]) : identifier(node.arguments[index], match));
}

function parameterNames(node, count) {
  const parameters = node?.parameters;
  if (parameters?.length !== count || !parameters.every(item => ts.isIdentifier(item.name) && !item.initializer && !item.dotDotDotToken)) return [];
  return parameters.map(item => item.name.text);
}

function localConst(statement, matches) {
  if (!statement || !ts.isVariableStatement(statement)) return undefined;
  const list = statement.declarationList;
  const [local] = list.declarations;
  if ((list.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const || list.declarations.length !== 1 || !ts.isIdentifier(local.name) || !matches(unwrapExpression(local.initializer))) return undefined;
  return local.name.text;
}

function returned(statement) {
  if (!statement || !ts.isReturnStatement(statement)) return undefined;
  const value = unwrapExpression(statement.expression);
  return value && ts.isAwaitExpression(value) ? unwrapExpression(value.expression) : value;
}

function guarded(statement, condition) {
  if (!statement || !ts.isIfStatement(statement) || statement.elseStatement || !condition(unwrapExpression(statement.expression))) return undefined;
  const body = statement.thenStatement;
  return ts.isBlock(body) ? (body.statements.length === 1 ? body.statements[0] : undefined) : body;
}

const missing = name => node => node && ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken && identifier(node.operand, name);
const hasEvidence = name => node => node && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
  && identifier(node.left, name) && identifier(node.right, "undefined");

function rejects(statement, condition, code) {
  const guard = guarded(statement, condition);
  const error = guard && ts.isThrowStatement(guard) ? unwrapExpression(guard.expression) : undefined;
  return error && ts.isNewExpression(error) && identifier(error.expression, "ActionError") && error.arguments?.length === 2
    && ts.isStringLiteralLike(error.arguments[0]) && error.arguments[0].text === code && ts.isStringLiteralLike(error.arguments[1]);
}

const callId = node => node && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  && call(node.left, "currentCallId") && call(node.right, "newCallId");
const invokeReview = (statement, host, project, operation, input, signal) =>
  call(returned(statement), "invokeProjectReviewManagement", host, project, operation, input, callId, signal);

function invocation(fn, preludeLength) {
  const body = fn?.body?.statements;
  if (body?.length !== preludeLength + 1 || isAsync(fn) || fn.asteriskToken) return undefined;
  const object = returned(body[preludeLength]);
  if (!object || !ts.isObjectLiteralExpression(object) || object.properties.length !== 2) return undefined;
  const method = object.properties.find(node => ts.isMethodDeclaration(node) && property(node.name, "invoke"));
  if (!method?.body || !isAsync(method) || method.asteriskToken) return undefined;
  return { member: object.properties.find(node => node !== method), memberFirst: object.properties[0] !== method,
    parameters: parameterNames(method, 3), body: method.body.statements };
}

const reportsProject = (node, owner) => node && ts.isPropertyAssignment(node) && property(node.name, "project_id")
  && member(owner, "project_id")(node.initializer);

function verifiesReview(declare) {
  const [reference, evidence] = parameterNames(declare, 2);
  const [lookup, refuseUnknown, refuseEvidence, result] = declare?.body?.statements ?? [];
  const operation = localConst(lookup, node => call(node, "reviewOperation", reference));
  return distinctLocals(reference, evidence, operation) && !isAsync(declare) && !declare.asteriskToken
    && declare?.body?.statements.length === 4 && rejects(refuseUnknown, missing(operation), "actions.forbidden")
    && rejects(refuseEvidence, hasEvidence(evidence), "actions.input_invalid") && identifier(returned(result), operation);
}

/** The CLI narrows both doors before dispatch, preserving the project and cancellation captured by each door. */
export function checkStandaloneReviewPort(source) {
  const file = parse(source);
  const standalone = declaration(file, "bindStandaloneReviewActions");
  const [host, project, signal] = parameterNames(standalone, 3);
  const invoke = invocation(standalone, 0);
  const [ref, input, evidence] = invoke?.parameters ?? [];
  const [lookup, run] = invoke?.body ?? [];
  const operation = localConst(lookup, node => call(node, "requireReview", ref, evidence));

  const narrowed = declaration(file, "reviewOnly");
  const [port] = parameterNames(narrowed, 1);
  const resident = invocation(narrowed, 0);
  const [residentRef, residentInput, residentEvidence] = resident?.parameters ?? [];
  const [check, send] = resident?.body ?? [];
  const valid = verifiesReview(declaration(file, "requireReview"))
    && distinctLocals(host, project, signal, ref, input, evidence, operation)
    && invoke?.body.length === 2 && reportsProject(invoke.member, project) && invokeReview(run, host, project, operation, input, signal)
    && distinctLocals(port, residentRef, residentInput, residentEvidence)
    && resident?.body.length === 2 && reportsProject(resident.member, port) && ts.isExpressionStatement(check)
    && call(check.expression, "requireReview", residentRef, residentEvidence)
    && call(returned(send), member(port, "invoke"), residentRef, residentInput);
  return valid ? [] : [`${FILE}: the command line's port must refuse everything but the platform's review operations before it runs, and bind no Goals port`];
}
