import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { checkGoalsManagementWiring } from "../scripts/gates/goals-management-wiring.mjs";

const source = readFileSync(new URL("../apps/local-host/src/mcp-v1-tool.ts", import.meta.url), "utf8");
const productionNode = content => {
  const file = ts.createSourceFile("mcp-v1-tool.ts", content, ts.ScriptTarget.Latest, true);
  const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "callMcpV1Tool");
  const branch = fn.body.statements.find(node => ts.isIfStatement(node) && node.expression.getText(file).replace(/\s+/gu, "") === 'audience==="management"&&caller.resident?.ensureResident');
  assert.ok(branch); return { file, fn, branch };
};

test("RAC-625 RAC-627 RAC-628: production MCP forwards before local preparation; the embedded management route remains checked", () => {
  assert.deepEqual(checkGoalsManagementWiring(source, "mcp"), []);
});

for (const [name, mutate] of [
  ["Runtime starts management", s => s.replace('audience === "management" && caller.resident?.ensureResident', 'audience === "runtime" && caller.resident?.ensureResident')],
  ["tool-supplied Home", s => s.replace('home: caller.resident.home, origin:', 'home: arguments_.home, origin:')],
  ["lost original signal", s => s.replace('signal: caller.resident.signal,\n      ensureResident:', 'signal: undefined,\n      ensureResident:')],
  ["missing ensure", s => s.replace('ensureResident: caller.resident.ensureResident, databasePath:', 'ensureResident: undefined, databasePath:')],
  ["local writable fallback", s => s.replace('fallback: () => { throw new ActionError("actions.service_unavailable", "生产 MCP 不在本地执行管理操作"); }', 'fallback: fallback')],
  ["local client before HTTP", s => s.replace('if (audience === "management" && caller.resident?.ensureResident) {', 'if (audience === "management" && caller.resident?.ensureResident) { await caller.localHost.client({}).withScope(() => undefined);')],
  ["local directory preparation", s => s.replace('if (audience === "management" && caller.resident?.ensureResident) {', 'if (audience === "management" && caller.resident?.ensureResident) { prepareLocalProjectStorage(location, "create");')],
  ["old route grants Runtime management", s => s.replace('audience !== "management" ? null : owned', 'audience === "management" ? null : owned')],
  ["whole production branch removed", s => { const { branch } = productionNode(s); return s.slice(0, branch.pos) + s.slice(branch.end); }],
  ["actual Catalog read before production", s => {
    const { file, fn, branch } = productionNode(s);
    const owned = fn.body.statements.find(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => decl.name.getText(file) === "owned"));
    const ownedText = owned.getText(file);
    const removed = s.replace(ownedText, "").replace("  const { databasePath } = storage;\n", "");
    return removed.slice(0, branch.pos) + `\n  const databasePath = path.resolve(location);\n  ${ownedText}\n` + removed.slice(branch.pos);
  }],
  ["duplicate production branch", s => { const { branch } = productionNode(s); return s.slice(0, branch.pos) + '\n  if (audience === "management" && caller.resident?.ensureResident) {}\n' + s.slice(branch.pos); }],
]) {
  test(`RAC-625 RAC-627 RAC-628: reject ${name}`, () => {
    const changed = mutate(source); assert.notEqual(changed, source, "mutation must reach production code");
    assert.deepEqual(ts.createSourceFile("mcp-v1-tool.ts", changed, ts.ScriptTarget.Latest, true).parseDiagnostics, []);
    assert.ok(checkGoalsManagementWiring(changed, "mcp").length > 0, "gate must reject the actual changed route");
  });
}

const cliSource = readFileSync(new URL("../apps/local-host/src/cli-project.ts", import.meta.url), "utf8");
test("ASR-02 management CLI preserves the native connection token, fixed origin and anonymous fallback refusal", () => {
  assert.deepEqual(checkGoalsManagementWiring(cliSource, "cli"), []);
});
for (const [mode, name, change] of [
  ["cli", "tool-supplied token", s => s.replace("controlToken:connected?.controlToken", "controlToken:input.controlToken")],
  ["cli", "missing captured token", s => s.replace("controlToken:connected?.controlToken,", "")],
  ["cli", "changed constant origin", s => s.replace('const origin=options.actionServiceUrl??readProductEnv("WEB_URL")??DEFAULT_RESIDENT_HOST_URL;', 'const origin=input.origin;')],
  ["cli", "mutable origin", s => s.replace("const origin=", "let origin=")],
  ["cli", "fake account owner", s => s.replace('from "./resident-account-connection.js"', 'from "./forged-account.js"')],
  ["cli", "connection loses original signal", s => s.replace("connectResidentAccount(home,origin,options.signal,required)", "connectResidentAccount(home,origin,undefined,required)")],
  ["cli", "connected Home replaced by input", s => s.replace("home=connected.homeDirectory", "home=input.home")],
  ["cli", "compound fallback reset", s => s.replace("const homeDatabase =", 'allowLocalFallback ||= true; const homeDatabase =')],
  ["cli", "connection replaced after capture", s => s.replace("const homeDatabase =", 'connected={controlToken:input.controlToken}; const homeDatabase =')],
  ["cli", "anonymous fallback refusal removed", s => s.replace(/    if\(!allowLocalFallback&&homeDatabase\)throw new ActionError\([^\n]+\);\n/, "")],
  ["cli", "Home owner acquired before refusal", s => s.replace('    if(!allowLocalFallback&&homeDatabase)', '    ensureHomeStorageOwner(localHost,home); if(!allowLocalFallback&&homeDatabase)')],
  ["cli", "installation regains local fallback", s => s.replace("if(connected.installation)allowLocalFallback=false;", "if(connected.installation)allowLocalFallback=true;")],
  ["mcp", "production token from tool input", s => s.replace("controlToken:caller.resident.controlToken", "controlToken:arguments_.controlToken")],
  ["mcp", "production token reread", s => s.replace("controlToken:caller.resident.controlToken", 'controlToken:readProductEnv("CONTROL_TOKEN")')],
  ["mcp", "production token absent", s => s.replace("controlToken:caller.resident.controlToken,", "")],
  ["mcp", "embedded token from tool input", s => { const at=s.lastIndexOf("controlToken:caller.resident.controlToken"); return s.slice(0,at)+s.slice(at).replace("controlToken:caller.resident.controlToken", "controlToken:arguments_.controlToken"); }],
  ["mcp", "embedded original signal lost", s => { const at=s.lastIndexOf("signal: caller.resident.signal"); return s.slice(0,at)+s.slice(at).replace("signal: caller.resident.signal", "signal: undefined"); }],
]) test(`ASR-02 management wiring rejects ${mode} ${name}`, () => {
  const original = mode === "cli" ? cliSource : source, changed = change(original);
  assert.notEqual(changed, original, "mutation must reach the captured production fixture");
  assert.deepEqual(ts.createSourceFile(`${mode}.ts`, changed, ts.ScriptTarget.Latest, true).parseDiagnostics, []);
  assert.ok(checkGoalsManagementWiring(changed, mode).length > 0);
});
