// The capability pack's contract (specs/capability-pack/contract-design.md §2.1, §2.3, §4.2, §4.4–§4.7, §4.11; batch 09, b09/contract):
// the shapes alone. The gatherer that stamps, packs and checks reporters is `horizontal/kit` (b09/kit); the Host's binding of the named
// list is b09/freeze and b09/delegation. Every refusal here is the schema's own, asserted as a refusal: `actions.input_invalid` before the
// stand-in provider is reached, `actions.output_invalid` for an answer of the wrong shape, `actions.forbidden` for a caller it is not offered to.
import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import {
  ActionError, defineWorkExecutorActions, WORK_EXECUTOR_ROLES, type ActionCallContext, type ActionDefinition, type WorkExecutorActionOptions, type WorkExecutorRole,
} from "@molis-ai/molis-work-contracts/platform/actions";
import {
  defineKitReportAction, KIT_KINDS, KIT_LIMITS, KIT_REPORT_INPUT_TYPE, KIT_REPORT_OUTPUT_TYPE, KIT_TOOL_ORIGINS, type KitEntry, type KitReportedEntry,
} from "@molis-ai/molis-work-contracts/platform/kit-report";
import { defineInstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { agentDefinitionErrors, type SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { KIT_PROVIDER_ID, KIT_READ_PERMISSION, kitCatalogActions, kitErrors, type KitCatalog, type KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { SKILL_BODY_READ_MAX_REFS, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";

type Json = Record<string, unknown>;
const context = (audience: ActionCallContext["audience"], permissions: string[] = [KIT_READ_PERMISSION, "notes:read"]): ActionCallContext =>
  ({ actor_id: `${audience}:someone`, project_id: "p", audience, permissions });
const person = context("user");
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const reference = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version });

/** One provider answering every definition with `answer`, and the calls that reached it. */
function serving(definitions: ActionDefinition[], answer: () => unknown) {
  const service = new ActionService();
  const calls: unknown[] = [];
  service.registerProvider({ provider: { provider_id: "io.molis.work.notes", title: "笔记", kind: "system" }, definitions,
    handlers: definitions.map(definition => ({ capability_id: definition.capability_id, version: definition.version,
      handle: (_caller: ActionCallContext, input: unknown) => { calls.push(input); return answer(); } })) });
  return { service, calls };
}

const ref: SkillRef = {
  source: { kind: "plugin", plugin_id: "io.molis.work.meeting-skills", plugin_version: "1.0.0", publisher_signature: "ed25519:sha256:abc" },
  skill_id: "meeting-notes", version: 2, install_id: "inst-1", installation_generation: "gen-1",
};
const catalogEntry: SkillCatalogEntry = {
  ref, name: "会议纪要", description: "用户要整理会议时使用。", applies_to: "both", user_invocable: true, tools: ["find-capabilities"], resources: [],
  connector_categories: [], runs_scripts: false, excerpt: "# 会议纪要",
  pack: { plugin_id: ref.source.plugin_id, title: "会议技能", version: "1.0.0", publisher_label: "示例", trust: "pinned", scope: "project" },
  state: "manual", settings_revision: 1, enabled: { at: "2026-11-09T00:00:00.000Z", by: "user:someone", scope: "project" }, availability: { available: true },
};
const PACK_SOURCE = { kind: "plugin", plugin_id: "io.molis.work.meeting-skills", title: "会议技能", version: "1.0.0", install_id: "inst-1", publisher_label: "示例", trust: "pinned" } as const;
const common = { name: "会议纪要", description: "把一次会议整理成纪要", version: { label: "第 1 版" }, declares: { tools: [], permissions: [], connector_categories: [] },
  scope: "project", where: ["会议"], availability: { available: true }, usage: { kind: "none" }, export: "reference" } as const;
const entries: KitReportedEntry[] = [
  { ...common, entry_id: "skill", kind: "skill", skill: catalogEntry, export: "package",
    usage: { kind: "recent", count: 3, last_at: "2026-11-09T00:00:00.000Z", kept: { rows_per_key: 200 } } },
  { ...common, entry_id: "prompt", kind: "prompt", ref: { owner_id: "io.molis.work.notes", prompt_id: "summarize" },
    prompt: { use: "instruction", edited: true, roles: [{ kind: "plugin", owner_id: "io.molis.work.notes", role_id: "writer" }, { kind: "assistant" }] },
    version: { label: "第 2 版", change: { kind: "default_updated", base_version: 1, default_version: 2 } } },
  { ...common, entry_id: "writer", kind: "role", ref: { kind: "plugin", owner_id: "io.molis.work.notes", role_id: "writer" },
    role: { subagent: false, execution: "read-only", host_tools: ["ask-user"] }, manage: { href: "/settings/roles", label: "角色" } },
  { ...common, entry_id: "mine", kind: "role", ref: { kind: "personal", character_id: "c1" }, role: { subagent: false, host_tools: [] } },
  { ...common, entry_id: "member", kind: "role", ref: { kind: "project", member_id: "m1" }, role: { subagent: true, host_tools: [] } },
  { ...common, entry_id: "run-command", kind: "tool", ref: { tool: "run-command" }, tool: { origin: "runtime", writes: true }, usage: { kind: "not_counted" } },
  { ...common, entry_id: "search", kind: "mcp", ref: { part: "action_tool", action: { capability_id: "mcp.search", version: 1 } },
    mcp: { server_enabled: true, health: "connected", action_available: false }, usage: { kind: "last_only", last_at: "2026-11-08T00:00:00.000Z" } },
  { ...common, entry_id: "outbound", kind: "mcp", ref: { part: "outbound", client_id: "codex-1" },
    mcp: { granted_to: [{ client_id: "codex-1", title: "Codex", external_tool: "codex" }] }, source: { kind: "outbound", title: "Molis Work" }, pack: "system:builtin" },
];

test("CPK-12: a reporter is one query found by its two types: the person's at least, read-only, waiting for no model", () => {
  const reporter = defineKitReportAction("notes.kit.report", 1, "笔记的能力包条目", ["notes:read"]);
  assert.deepEqual(inspectActionDeclarations([reporter], undefined), []);
  assert.equal(reporter.operation, "query");
  assert.deepEqual({ kind: reporter.action.kind, scope: reporter.action.scope, effect: reporter.action.effect, audiences: reporter.action.audiences,
    scheduling: reporter.action.scheduling, input_type: reporter.action.input_type, output_type: reporter.action.output_type },
  { kind: "query", scope: "home", effect: "read", audiences: ["user"], scheduling: undefined, input_type: KIT_REPORT_INPUT_TYPE, output_type: KIT_REPORT_OUTPUT_TYPE });
  assert.deepEqual([KIT_REPORT_INPUT_TYPE, KIT_REPORT_OUTPUT_TYPE], ["molis.kit-report.input.v1", "molis.kit-report.output.v1"]);
  // An owner may open it to more audiences; the person stays one of them.
  assert.deepEqual(defineKitReportAction("notes.kit.report", 1, "x", [], { scope: "project", audiences: ["agent", "user"] }).action.audiences, ["user", "agent"]);
  assert.deepEqual([...KIT_KINDS], ["skill", "prompt", "role", "tool", "mcp"]);
  assert.deepEqual([...KIT_TOOL_ORIGINS], ["runtime", "gateway", "business", "subagent", "plan-step", "builder"]);
});

test("CPK-03 CPK-04 CPK-09: a report is checked against a closed schema, each kind with its own fields", async () => {
  const reporter = defineKitReportAction("notes.kit.report", 1, "笔记的能力包条目", ["notes:read"]);
  let answer: unknown = { entries };
  const { service, calls } = serving([reporter], () => answer);
  assert.deepEqual(await service.invoke(person, reference(reporter), {}), { entries });
  answer = { entries: [], packs: [{ source: PACK_SOURCE, description: "", status: "uninstalled", upgraded: { from: "1.0.0", to: "1.1.0", at: "2026-11-09" } }] };
  await service.invoke(person, reference(reporter), {});
  // The input is closed and empty: a reporter reports all it owns in the call's scope, so no kind, no project and no actor come in.
  for (const input of [{ kind: "skill" }, { project_id: "other" }, { actor_id: "x" }]) {
    await assert.rejects(service.invoke(person, reference(reporter), input), code("actions.input_invalid"), JSON.stringify(input));
  }
  assert.equal(calls.length, 2);
  const prompt = entries[1] as Json, skill = entries[0] as Json, mcp = entries[6] as Json;
  const refused: ReadonlyArray<readonly [string, Json]> = [
    ["a prompt's body", { ...prompt, body: "你是……" }],
    ["a prompt's override text", { ...prompt, prompt: { ...(prompt.prompt as Json), override: "改写" } }],
    ["a Skill's body in its catalog entry", { ...skill, skill: { ...catalogEntry, body: "# 正文" } }],
    ["an MCP server's endpoint", { ...mcp, ref: { part: "server", owner: "project", server_id: "s1", configuration_version: 1, endpoint: "https://x.example/mcp" } }],
    ["an MCP server's directory and command", { ...mcp, mcp: { server_enabled: true, directory: "/Users/someone/project", argv: ["node", "server.js"] } }],
    ["a credential in a source", { ...mcp, source: { kind: "mcp_server", owner: "connection", server_id: "s1", label: "GitHub", token: "ghp_x" } }],
    ["a switch for the entry", { ...prompt, enabled: true }],
    ["a total from records that keep only recent rows", { ...prompt, usage: { kind: "recent", count: 3, last_at: null, kept: { total: 900 } } }],
    ["a usage kind nobody defined", { ...prompt, usage: { kind: "total", count: 900 } }],
    ["a pack the contract has no form for", { ...prompt, pack: "user:my-research" }],
    ["a manage link to another origin", { ...prompt, manage: { href: "https://evil.example/settings", label: "去改" } }],
    ["a protocol-relative manage link", { ...prompt, manage: { href: "//evil.example/settings", label: "去改" } }],
    ["a role ref with a Character's version", { ...(entries[3] as Json), ref: { kind: "personal", character_id: "c1", version: 2 } }],
    ["a tool origin outside the set", { ...(entries[5] as Json), tool: { origin: "shell", writes: true } }],
    ["more places than the limit", { ...prompt, where: Array.from({ length: KIT_LIMITS.where + 1 }, (_, n) => `第 ${n} 处`) }],
    ["a kind outside the five", { ...prompt, kind: "workflow" }],
  ];
  for (const [what, entry] of refused) {
    answer = { entries: [entry] };
    await assert.rejects(service.invoke(person, reference(reporter), {}), code("actions.output_invalid"), `accepted ${what}`);
  }
  answer = { entries: Array.from({ length: KIT_LIMITS.entriesPerReporter + 1 }, (_, n) => ({ ...prompt, entry_id: `p-${n}` })) };
  await assert.rejects(service.invoke(person, reference(reporter), {}), code("actions.output_invalid"), "accepted more entries than one reporter may give");
  answer = { entries: [], packs: [{ source: PACK_SOURCE, description: "", status: "paused" }] };
  await assert.rejects(service.invoke(person, reference(reporter), {}), code("actions.output_invalid"), "accepted a pack status nobody defined");
});

test("CPK-09: kit.catalog.list is the person's alone, reads only, and gathers concurrently", async () => {
  const list = kitCatalogActions.list as ActionDefinition;
  assert.deepEqual(inspectActionDeclarations([list], undefined), []);
  assert.equal(KIT_PROVIDER_ID, "system.kit");
  assert.deepEqual({ id: `${list.capability_id}@${list.version}`, operation: list.operation, scope: list.action.scope, effect: list.action.effect,
    scheduling: list.action.scheduling, audiences: list.action.audiences, permissions: list.action.permissions },
  { id: "kit.catalog.list@1", operation: "query", scope: "home", effect: "read", scheduling: "concurrent", audiences: ["user"], permissions: ["kit:read"] });
  const catalog: KitCatalog = { packs: [], entries: [], issues: [] };
  const { service, calls } = serving([list], () => catalog);
  for (const audience of ["agent", "plugin", "mcp", "workflow"] as const) {
    assert.deepEqual(service.discover(context(audience)), [], audience);
    await assert.rejects(service.invoke(context(audience), reference(list), {}), code("actions.forbidden"), audience);
  }
  await assert.rejects(service.invoke(person, reference(list), { kinds: ["skill"] }), code("actions.input_invalid"));
  assert.deepEqual(calls, []);
  assert.deepEqual(await service.invoke(person, reference(list), {}), catalog);
});

test("CPK-03 CPK-14: a pack has no switch; its state is one of five, read from what it holds", async () => {
  const list = kitCatalogActions.list as ActionDefinition;
  const gathered: KitEntry = { ...(entries[1] as Extract<KitReportedEntry, { kind: "prompt" }>), key: "io.molis.work.notes/prompt",
    source: { kind: "plugin", plugin_id: "io.molis.work.notes", title: "笔记", version: "0.1.0", install_id: "inst-1", publisher_label: "Molis", trust: "host" },
    reporter: { provider_id: "io.molis.work.notes", title: "笔记" }, pack: "plugin:inst-1" };
  const pack: KitPack = { pack_id: "plugin:inst-1", kind: "plugin", name: "笔记", description: "", source: gathered.source as KitPack["source"], state: { kind: "active" },
    roles: [{ role: "io.molis.work.notes/writer", prompts: [gathered.key] }], skills: [], mcp: [], tools: [], export: { package: false, prompt_overrides: true, references: true } };
  let answer: unknown;
  const { service } = serving([list], () => answer);
  const states = [{ kind: "uninstalled" }, { kind: "disabled" }, { kind: "unknown", issues: [0] }, { kind: "attention", items: [{ entry: gathered.key, reason: "connection_missing" }] }, { kind: "active" }];
  for (const state of states) {
    answer = { packs: [{ ...pack, state }], entries: [gathered], issues: [{ provider_id: "io.molis.work.mail", title: "邮件", message: "超时" }] };
    await service.invoke(person, reference(list), {});
  }
  const refused: ReadonlyArray<readonly [string, Json]> = [
    ["a switch on the pack", { ...pack, enabled: true }],
    ["a stored state nobody defined", { ...pack, state: { kind: "paused" } }],
    ["an unknown state that names no issue", { ...pack, state: { kind: "unknown", issues: [] } }],
    ["an attention state that names no entry", { ...pack, state: { kind: "attention", items: [] } }],
    ["a user's own pack", { ...pack, pack_id: "user:my-research" }],
    ["more roles than a pack may list", { ...pack, roles: Array.from({ length: KIT_LIMITS.rolesPerPack + 1 }, (_, n) => ({ role: `r/${n}`, prompts: [] })) }],
  ];
  for (const [what, bad] of refused) {
    answer = { packs: [bad], entries: [gathered], issues: [] };
    await assert.rejects(service.invoke(person, reference(list), {}), code("actions.output_invalid"), `accepted ${what}`);
  }
  // A gathered entry carries its stamp: no key, source, reporter or pack, and it is out of contract.
  for (const key of ["key", "source", "reporter", "pack"]) {
    const { [key]: _dropped, ...unstamped } = gathered as Json;
    answer = { packs: [], entries: [unstamped], issues: [] };
    await assert.rejects(service.invoke(person, reference(list), {}), code("actions.output_invalid"), `accepted an entry without ${key}`);
  }
});

test("SKC-06 CPK-09: a work executor's run.start takes Skills as exact references, never who named them", async () => {
  // An executor publishes every role at once; only run.start is called here.
  const executor = defineWorkExecutorActions(Object.fromEntries(WORK_EXECUTOR_ROLES.map(role => [role,
    { capability_id: `notes.${role}`, version: 1, title: role, description: role, permissions: [] }])) as Record<WorkExecutorRole, WorkExecutorActionOptions>);
  const start = executor["run.start"];
  const { service, calls } = serving(Object.values(executor) as ActionDefinition[], () => ({ run_id: "r1" }));
  await service.invoke(person, reference(start as ActionDefinition), { session_id: "s1", task: "整理纪要" });
  await service.invoke(person, reference(start as ActionDefinition), { session_id: "s1", task: "整理纪要", skills: [ref] });
  assert.equal(calls.length, 2);
  // The named list is the Host's, bound in the call context (`ActionCallContext.named_skills`); input that carries one is refused whole.
  const refused: ReadonlyArray<readonly [string, Json]> = [
    ["a named list in input", { named_skills: { install_id: "inst-1", action: { capability_id: "notes.run.start", version: 1, provider_id: "p" }, from: "host", refs: [ref] } }],
    ["a round's Skill reads in input", { skill_round: { consumer: "coding", named: [ref] } }],
    ["more Skills than one read takes", { skills: Array.from({ length: SKILL_BODY_READ_MAX_REFS + 1 }, (_, n) => ({ ...ref, skill_id: `skill-${n}` })) }],
    ["a reference with a project of its own", { skills: [{ ...ref, project_id: "other" }] }],
    ["a reference without its installation", { skills: [{ ...ref, install_id: undefined }] }],
    ["a Skill named by id alone", { skills: [{ skill_id: "meeting-notes", version: 2 }] }],
  ];
  for (const [what, extra] of refused) {
    await assert.rejects(service.invoke(person, reference(start as ActionDefinition), { session_id: "s1", task: "整理纪要", ...extra }), code("actions.input_invalid"), `accepted ${what}`);
  }
  assert.equal(calls.length, 2);
});

test("CPK-13: an instruction prompt may name the role it works for; only the id's form is checked where it is defined", () => {
  const base = { owner_id: "io.molis.work.notes", prompt_id: "summarize", version: 1, title: "总结", purpose: "总结笔记", used_by: ["笔记"], body: "请总结。" };
  assert.equal(defineInstructionPrompt(base).role_id, undefined);
  assert.equal(defineInstructionPrompt({ ...base, role_id: "writer" }).role_id, "writer");
  for (const role_id of ["", "Writer", "writer role", "-writer", "writer.v2"]) assert.throws(() => defineInstructionPrompt({ ...base, role_id }), JSON.stringify(role_id));
});

test("the new refusals are declared once, by their owners, with their kinds", () => {
  const raised = [kitErrors.report_invalid("x"), agentDefinitionErrors.instruction_role_unknown("x", { owner_id: "o", prompt_id: "p", role_id: "r" }),
    agentDefinitionErrors.overrides_preview_unknown("x"), agentDefinitionErrors.overrides_row_not_applicable("x")];
  assert.deepEqual(raised.map(error => [error.code, error.kind]), [
    ["kit.report_invalid", "invalid"], ["agent_definitions.instruction_role_unknown", "invalid"],
    ["agent_definitions.overrides_preview_unknown", "not_found"], ["agent_definitions.overrides_row_not_applicable", "conflict"],
  ]);
});
