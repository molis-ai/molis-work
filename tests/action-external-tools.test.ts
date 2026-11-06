import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import ts from "typescript";
import { renderCharacters, renderMolisWorkCharactersClientScript } from "@molis-ai/molis-work-app-workbench";
import { TERMINAL_RUNTIMES, terminalRuntimeRecipe } from "@molis-ai/molis-work-app-local-host";
import { CHARACTER_IMPORT_RUNTIMES } from "@molis-ai/molis-work-contracts/modules/characters";
import { RUNTIME_DISPLAY_NAMES, SUPPORTED_RUNTIME_IDS } from "@molis-ai/molis-work-contracts/platform/app-host";
import { EXTERNAL_SESSION_NATIVE_ID_PATTERN, EXTERNAL_TOOLS, type ExternalSessionCapability, type ExternalToolAccess, type ExternalToolEntry } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";

const ROOT = join(import.meta.dirname, "..");
const REGISTER_FILE = "packages/contracts/src/platform/external-tools.ts";
const tools: readonly ExternalToolEntry[] = EXTERNAL_TOOLS;
const CAPABILITIES: readonly ExternalSessionCapability[] = ["discover", "list", "read", "search", "resume", "send", "stop", "export"];
const accesses = (tool: ExternalToolEntry): ExternalToolAccess[] => CAPABILITIES.map(capability => tool.sessions[capability]);

/** Written out on purpose: a removed row fails here, and renaming or adding one means changing this list too. */
const REGISTERED_IDS = [
  "codex", "claude-code", "cursor", "opencode", "pi-agent", "grok-build",
  "codex-ide", "codex-desktop", "codex-cloud", "claude-code-desktop", "claude-code-ide", "claude-code-web", "gemini-cli", "antigravity-cli", "antigravity-desktop",
  "copilot-cli", "copilot-ide", "copilot-coding-agent", "cursor-editor", "cursor-cloud", "kiro-cli", "kiro-ide", "devin-cloud", "devin-desktop", "windsurf-cascade",
  "junie-cli", "junie-ide", "droid", "amp", "amp-web",
  "qwen-code", "lingma", "qoder", "qoder-ide", "qoder-cn", "qoder-cn-ide", "codebuddy", "codebuddy-cn", "codebuddy-ide", "trae", "trae-cn", "solo", "solo-cn",
  "kimi-code", "zcode", "minimax-code", "minimax-agent", "comate", "zulu", "codearts-agent",
];

const DERIVED_ID_TYPES = new Set(["CharacterImportRuntimeId", "SupportedRuntimeId", "TerminalRuntime", "ExternalToolId"]);

/** The type an object literal is declared with, past the parentheses and assertions around it. */
function declaredType(literal: ts.Expression): ts.TypeNode | undefined {
  let node: ts.Node = literal;
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  const { parent } = node;
  if (ts.isSatisfiesExpression(parent) || ts.isAsExpression(parent)) return parent.type;
  return ts.isVariableDeclaration(parent) ? parent.type : undefined;
}

const isDerivedRecord = (type: ts.TypeNode | undefined): boolean => type !== undefined && ts.isTypeReferenceNode(type) && type.typeName.getText() === "Record"
  && type.typeArguments !== undefined && DERIVED_ID_TYPES.has(type.typeArguments[0].getText());

/** A hand-written tool list in one source file: an array with two registered ids, or an object keyed by two, unless it is a function table on a derived type. */
function handWrittenLists(file: string, text: string, ids: ReadonlySet<string>): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const functions = new Set<string>();
  const collect = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) functions.add(node.name.text);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const isFunctionValue = (property: ts.ObjectLiteralElementLike): boolean => {
    if (ts.isMethodDeclaration(property)) return true;
    if (ts.isShorthandPropertyAssignment(property)) return functions.has(property.name.text);
    if (!ts.isPropertyAssignment(property)) return false;
    const value = property.initializer;
    return ts.isArrowFunction(value) || ts.isFunctionExpression(value) || (ts.isIdentifier(value) && functions.has(value.text));
  };
  const keyOf = (property: ts.ObjectLiteralElementLike): string | undefined =>
    property.name && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) ? property.name.text : undefined;
  const where = (node: ts.Node): string => `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isArrayLiteralExpression(node)) {
      const named = new Set(node.elements.filter(ts.isStringLiteralLike).map(element => element.text).filter(value => ids.has(value)));
      if (named.size >= 2) found.push(`${where(node)} array of ${[...named].join(", ")}`);
    }
    if (ts.isObjectLiteralExpression(node)) {
      const keyed = node.properties.filter(property => ids.has(keyOf(property) ?? ""));
      if (keyed.length >= 2 && !(isDerivedRecord(declaredType(node)) && node.properties.every(isFunctionValue))) found.push(`${where(node)} object keyed by ${keyed.map(keyOf).join(", ")}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

test("SRB-07 the runtime lists keep today's members and order", () => {
  assert.deepEqual(SUPPORTED_RUNTIME_IDS, ["codex", "claude-code", "opencode", "pi-agent", "grok-build"]);
  assert.deepEqual(TERMINAL_RUNTIMES, ["codex", "claude-code", "opencode", "pi-agent", "grok-build"]);
  assert.deepEqual(CHARACTER_IMPORT_RUNTIMES, ["codex", "claude-code", "cursor", "opencode", "grok-build"]);
  assert.deepEqual(RUNTIME_DISPLAY_NAMES, { codex: "Codex", "claude-code": "Claude Code", opencode: "OpenCode", "pi-agent": "Pi Agent", "grok-build": "Grok Build" });
});

test("SRB-07 the runtime lists are the register filtered by field", () => {
  const withField = (field: keyof ExternalToolEntry) => tools.filter(tool => field in tool).map(tool => tool.id);
  assert.deepEqual(SUPPORTED_RUNTIME_IDS, withField("mcp_integration"));
  assert.deepEqual(TERMINAL_RUNTIMES, withField("terminal"));
  assert.deepEqual(CHARACTER_IMPORT_RUNTIMES, withField("character_import"));
  assert.deepEqual(tools.slice(0, 6).map(tool => tool.id), ["codex", "claude-code", "cursor", "opencode", "pi-agent", "grok-build"]);
});

test("SRB-01 every product entry stays registered", () => {
  assert.deepEqual(tools.map(tool => tool.id), REGISTERED_IDS);
  assert.equal(new Set(REGISTERED_IDS).size, 50);
});

test("SRB-01 a way in rests on a checked source, and a gap says why", () => {
  for (const tool of tools) for (const access of accesses(tool)) {
    if (access.via === "gap") assert.ok(access.note.trim(), `${tool.id}: a gap without a note`);
    else assert.ok(["official", "help", "repository"].includes(access.trust), `${tool.id}: ${access.via} on trust ${access.trust}`);
  }
});

test("SRB-01 a row leaves nothing out", () => {
  const byId = new Map(tools.map(tool => [tool.id, tool]));
  for (const tool of tools) {
    assert.deepEqual(Object.keys(tool.sessions).sort(), [...CAPABILITIES].sort(), `${tool.id}: sessions`);
    if (tool.surface !== "cloud") assert.ok("data_root" in tool, `${tool.id}: a local entry must say where its sessions are`);
    if (tool.shares_sessions_with !== undefined) {
      const main = byId.get(tool.shares_sessions_with);
      assert.ok(main, `${tool.id}: shares with an unknown id`);
      assert.equal(main.shares_sessions_with, undefined, `${tool.id}: a chain of shared entries`);
    }
  }
});

test("SRB-01 commands stay whole arguments of a known program", () => {
  const placeholder = /\{[a-z_]+\}/u;
  for (const tool of tools) {
    if (tool.terminal) {
      assert.equal(tool.sessions.resume.via, "command", `${tool.id}: a terminal runtime without resume arguments`);
      assert.match(tool.terminal.command, /^[A-Za-z0-9._+-]+$/u, `${tool.id}: not a bare command name`);
    }
    for (const access of accesses(tool)) {
      if (access.via !== "command") continue;
      assert.ok(tool.terminal ?? tool.detect, `${tool.id}: a command with no program`);
      for (const part of access.argv) {
        if (placeholder.test(part)) assert.ok(part === "{session_id}" || part === "{query}", `${tool.id}: ${part} is not a whole placeholder`);
      }
    }
  }
});

test("SRB-07 a terminal recipe reads the register, and one native id rule stays", () => {
  assert.deepEqual(terminalRuntimeRecipe("pi-agent").resumeArgs("s-1"), ["--session", "s-1"]);
  assert.equal(terminalRuntimeRecipe("claude-code").command, "claude");
  assert.ok(EXTERNAL_SESSION_NATIVE_ID_PATTERN.test("019a-thread_1:2.3"));
  for (const refused of ["--dangerously-skip-permissions", "a b", "a;b", "", "x".repeat(129)]) assert.ok(!EXTERNAL_SESSION_NATIVE_ID_PATTERN.test(refused), refused);
});

test("SRB-07 the page gets names from the host, and the register stays out of its program", () => {
  const html = renderCharacters({ route_prefix: "/projects/p", primitives: { escape: value => escapeHtml(String(value)) } });
  const attribute = /data-character-runtime-names="([^"]*)"/u.exec(html)?.[1] ?? "";
  assert.deepEqual(JSON.parse(attribute.replaceAll("&quot;", '"')), { codex: "Codex", "claude-code": "Claude Code", cursor: "Cursor", opencode: "OpenCode", "grok-build": "Grok Build" });
  assert.match(html, /<option value="">自动发现<\/option><option value="codex">Codex<\/option><option value="claude-code">Claude Code<\/option><option value="cursor">Cursor<\/option><option value="opencode">OpenCode<\/option><option value="grok-build">Grok Build<\/option><\/select>/u);
  const client = renderMolisWorkCharactersClientScript();
  for (const name of ["Grok Build", "CodeArts", "qodercn"]) assert.ok(!client.includes(name), `the Characters page program carries ${name}`);
});

test("SRB-07 the scan finds hand-written lists and passes a function table on a derived type", () => {
  const ids = new Set(REGISTERED_IDS);
  const scan = (text: string) => handWrittenLists("sample.ts", text, ids);
  assert.equal(scan('const list = ["codex", "amp"];').length, 1);
  assert.equal(scan('const names: Record<string, string> = { codex: "Codex", amp: "Amp" };').length, 1);
  assert.equal(scan('const names: Record<ExternalToolId, string> = { codex: "Codex", amp: "Amp" };').length, 1);
  assert.equal(scan("const run: Record<string, () => void> = { codex: () => {}, amp: () => {} };").length, 1);
  assert.equal(scan("function a() {}\nconst run: Record<TerminalRuntime, () => void> = { codex: a, amp: () => {} };").length, 0);
  assert.equal(scan('const one = ["codex", "other"];').length, 0);
});

test("SRB-07 no tool list is written by hand outside the register", () => {
  const ids = new Set(REGISTERED_IDS);
  const found = ["apps", "horizontal", "modules", "packages", "plugins"].flatMap(root => sourceFiles(join(ROOT, root)))
    .map(path => relative(ROOT, path)).filter(file => file !== REGISTER_FILE)
    .flatMap(file => handWrittenLists(file, readFileSync(join(ROOT, file), "utf8"), ids));
  assert.deepEqual(found, []);
});
