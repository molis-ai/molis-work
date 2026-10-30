import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import * as functions from "@molis-ai/molis-work-contracts/modules/functions";
import * as plugin from "@molis-ai/molis-work-contracts/platform/plugin";
import * as pluginAgent from "@molis-ai/molis-work-contracts/platform/plugin-agent";

// W5-14 R-A5 and the first five of R-A6 (T-111): the contract's last Behavior and Method names become Option and Skill.
// Only identifiers change: the values, the action ids, the Manifest's `methods` key and the stored fields stay.

const REPOSITORY = fileURLToPath(new URL("..", import.meta.url));
const OPTION_IDS = {
  HOME_CONTINUE_OPTION_ID: "home.continue", HOME_ASK_OPTION_ID: "home.ask",
  INBOX_DONE_OPTION_ID: "inbox.done", INBOX_DISMISS_OPTION_ID: "inbox.dismiss", INBOX_COMPOSE_OPTION_ID: "inbox.compose",
  INBOX_VERIFY_OPTION_ID: "inbox.verify", INBOX_ADMIT_OPTION_ID: "inbox.admit",
  FEED_REAUTH_OPTION_ID: "feed.reauth", FEED_OPEN_OPTION_ID: "feed.open", FEED_SAVE_OPTION_ID: "feed.save",
  FEED_PROMOTE_OPTION_ID: "feed.promote", FEED_ARCHIVE_OPTION_ID: "feed.archive",
} as const;
const SKILL_TOOLS = ["find-capabilities", "read-capability", "change-capability", "suggest-action", "ask-user", "update-todo",
  "find-tools", "context-remaining", "board-wait", "acknowledge-inputs"];
const OLD_NAMES = [...Object.keys(OPTION_IDS).map(name => name.replace(/_OPTION_ID$/u, "_BEHAVIOR_ID")), "JudgmentRuleAuthoringBehavior",
  "AgentMethodView", "AgentMethodRegistration", "METHOD_TOOLS", "inspectMethodDeclarations", "method_owner"];

/** Type errors a small caller gets from the built declarations; the test runner strips types, so they are checked here. */
function typeErrors(source: string): string[] {
  const file = fileURLToPath(new URL("./option-skill-names.virtual.ts", import.meta.url));
  const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["node"],
    typeRoots: [fileURLToPath(new URL("../node_modules/@types", import.meta.url))] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => name === file ? ts.createSourceFile(file, source, rest[0], true) : read(name, ...rest);
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .filter(diagnostic => !diagnostic.file || diagnostic.file.fileName === file)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
}
const EXACT = "type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;";

test("RAC-1755: the judgment-rule editor's options are Options: twelve *_OPTION_ID constants with the old values, and no *_BEHAVIOR_ID", () => {
  const exported = functions as Record<string, unknown>;
  for (const [name, value] of Object.entries(OPTION_IDS)) assert.equal(exported[name], value, name);
  assert.deepEqual(Object.keys(functions).filter(name => name.endsWith("_BEHAVIOR_ID")), []);
  assert.deepEqual(typeErrors(`
    import type { JudgmentRuleAuthoringCatalog, JudgmentRuleAuthoringOption } from "@molis-ai/molis-work-contracts/modules/functions";
    ${EXACT}
    export const option: Exact<JudgmentRuleAuthoringCatalog["behaviors"][number], JudgmentRuleAuthoringOption> = true;
  `), []);
  assert.equal(typeErrors(`import type { JudgmentRuleAuthoringBehavior } from "@molis-ai/molis-work-contracts/modules/functions"; export type T = JudgmentRuleAuthoringBehavior;`).length, 1);
});

test("RAC-1756: what a plugin offers other Agents is a Skill: SKILL_TOOLS keeps its list, the registration and view types are AgentSkill*", () => {
  assert.deepEqual([...pluginAgent.SKILL_TOOLS], SKILL_TOOLS);
  assert.equal(plugin.SKILL_TOOLS, pluginAgent.SKILL_TOOLS);
  assert.equal("METHOD_TOOLS" in pluginAgent, false);
  assert.equal("METHOD_TOOLS" in plugin, false);
  assert.deepEqual(typeErrors(`
    import type { AgentDefinitionRegistration, AgentSkillRegistration, AgentSkillView } from "@molis-ai/molis-work-contracts/services/agent-definitions";
    ${EXACT}
    export const registration: Exact<NonNullable<AgentDefinitionRegistration["methods"]>[number], AgentSkillRegistration> = true;
    export const view: Exact<keyof AgentSkillView, "key" | "owner_id" | "source" | "skill_id" | "version" | "name" | "summary" | "tools"> = true;
  `), []);
  assert.equal(typeErrors(`import type { AgentMethodRegistration, AgentMethodView } from "@molis-ai/molis-work-contracts/services/agent-definitions"; export type T = [AgentMethodRegistration, AgentMethodView];`).length, 2);
});

test("RAC-1758: no source outside the tests names a Behavior or Method identifier that T-111 renamed", () => {
  const files = execFileSync("git", ["ls-files", "-z", "apps", "packages", "plugins", "horizontal", "modules"], { cwd: REPOSITORY, encoding: "utf8" })
    .split("\0").filter(file => /\.(?:m?ts|mjs)$/u.test(file) && !/(?:^|\/)tests?\/|\.test\./u.test(file));
  assert.ok(files.length > 500, "the scan reads the workspace sources");
  const old = new RegExp(`\\b(?:${OLD_NAMES.join("|")})\\b`, "u");
  const naming = files.filter(file => old.test(readFileSync(join(REPOSITORY, file), "utf8")));
  assert.deepEqual(naming, []);
});
