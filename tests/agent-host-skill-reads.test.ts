import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, emptyCapabilityMatrix, type AgentRoundSkillCatalog } from "@molis-ai/molis-work-service-agent-host";
import { roundSkillCatalog } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentManifest } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { AgentRunHandle, AgentRuntimeAdapter, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { SKILLS_READ_PERMISSION, type SkillBodyReadResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// specs/capability-pack/contract-design.md §3.2–§3.4 (batch 09, 9-5): a round reads the shared Skill catalog once, whatever it selects;
// a catalog Skill's `tools` only describe it and never widen the role, at the Agent Host and at the Prologue registration alike; and the
// round's record names the language it replies in.

const PLUGIN = "io.molis.work.coding";
const DIRECTORY = "/Users/tester/code/project";
const manifest: AgentManifest = { directory_input_port: "project", roles: [{ role_id: "reader", version: 1, name: "Reader", host_tools: ["read-file"] }], prompts: [] };

const ref = (n: number): SkillRef => ({ source: { kind: "plugin", plugin_id: "io.example.writing", plugin_version: "2.0.0", publisher_signature: "sig" },
  skill_id: `skill-${n}`, version: 1, install_id: "writing-install", installation_generation: "g1" });
const entry = (skill: SkillRef, tools: string[] = ["read-file"]): SkillCatalogEntry => ({ ref: skill, name: skill.skill_id, description: "", applies_to: "both",
  user_invocable: true, tools, resources: [], connector_categories: [], runs_scripts: false, excerpt: "", state: "manual", settings_revision: 1,
  pack: { plugin_id: skill.source.plugin_id, title: "Writing", version: "2.0.0", publisher_label: "Example", trust: "pinned", scope: "project" }, availability: { available: true } });
const body = (skill: SkillRef): SkillBodyReadResult => ({ ok: true, ref: skill, name: skill.skill_id, body: `Body of ${skill.skill_id}` });

/** A catalog that counts what a round asks of it: one `list` and one `readBodies` per round, never one per reference (§3.4). */
function countingCatalog(tools: (skill: SkillRef) => string[] = () => ["read-file"], read: (skill: SkillRef) => SkillBodyReadResult = body) {
  const calls = { list: 0, readBodies: 0, refs: [] as number[] };
  const catalog: AgentRoundSkillCatalog = {
    named: [],
    list: async (_consumer, refs) => { calls.list++; return refs.map(skill => entry(skill, tools(skill))); },
    readBodies: async (_consumer, refs) => { calls.readBodies++; calls.refs.push(refs.length); return refs.map(read); },
  };
  return { catalog, calls };
}

function recordingAdapter() {
  const seen: AgentStartRequest[] = [];
  const capabilities = emptyCapabilityMatrix(); capabilities.skills = "supported";
  const adapter = {
    descriptor: { runtime_id: "probe", display_name: "probe", provider_version: "1.0.0", capabilities },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async readSession(session: AgentStartRequest["session"]) {
      return { session, owner: { project_id: "project", plugin_id: PLUGIN, install_id: "install-1", actor_id: "tester" }, title: "读", runs: [], latest_run: null };
    },
    async start(request: AgentStartRequest): Promise<AgentRunHandle> {
      seen.push(request);
      return { ref: { run_id: "run-1", session_id: request.session.session_id }, frozen: { role_id: "reader", role_version: 1, execution: "read-only", model_id: "m",
        prompts: [], skills: (request.role?.skills ?? []).map(({ body: _body, ...skill }) => skill), mcp_tools: [], host_tools: [...(request.role?.host_tools ?? [])],
        text_materials: [], budget: null, directory: request.directory, ...(request.role?.reply_locale ? { reply_locale: request.role.reply_locale } : {}) } } as AgentRunHandle;
    },
  } as unknown as AgentRuntimeAdapter;
  return { adapter, seen };
}

const startRequest = (skills: SkillRef[]): AgentStartRequest => ({ session: { session_id: "session-1", runtime_id: "probe" }, project_id: "project", plugin_id: PLUGIN,
  install_id: "install-1", actor_id: "tester", task: "读一下", role_id: "reader", directory: { canonical_path: DIRECTORY, realpath_verified: true }, skills });

test("SKC-07: a round of twenty catalog Skills reads the catalog once and the bodies once; a round of none reads nothing", async () => {
  const { adapter, seen } = recordingAdapter();
  const host = new AgentHost(); host.register(adapter);
  const { catalog, calls } = countingCatalog();
  const twenty = Array.from({ length: 20 }, (_, n) => ref(n));
  const run = await host.start("probe", startRequest(twenty), { manifest, authorizedDirectories: [DIRECTORY], skillCatalog: catalog });
  assert.deepEqual(calls, { list: 1, readBodies: 1, refs: [20] }, "before: 20 catalog reads and 20 body reads; now one of each");
  assert.equal(run.frozen.skills.length, 20);
  assert.deepEqual(seen[0]!.role!.skills!.map(skill => skill.ref.skill_id), twenty.map(skill => skill.skill_id), "the order chosen is the order frozen");

  const none = countingCatalog();
  await host.start("probe", startRequest([]), { manifest, authorizedDirectories: [DIRECTORY], skillCatalog: none.catalog });
  assert.deepEqual(none.calls, { list: 0, readBodies: 0, refs: [] });
});

test("SKC-07: five Skills the Host's delegation named and five the page chose are read in two groups, each once", async () => {
  const seen: Array<{ actor: string; action: string; refs?: number; named: number }> = [];
  const client: ActionClient = {
    discover: () => [],
    async invoke(caller, action, input) {
      const refs = (input as { refs?: SkillRef[] }).refs;
      seen.push({ actor: caller.actor_id, action: action.capability_id, ...(refs ? { refs: refs.length } : {}), named: caller.skill_round!.named.length });
      return refs ? { results: refs.map(body) } : { skills: Array.from({ length: 10 }, (_, n) => entry(ref(n))) };
    },
  };
  const plugin: ActionCallContext = { actor_id: "plugin:coding", project_id: "project", audience: "plugin", permissions: [SKILLS_READ_PERMISSION] };
  const person: ActionCallContext = { actor_id: "person", project_id: "project", audience: "agent", permissions: [] };
  const delegated = Array.from({ length: 5 }, (_, n) => ref(n)), chosen = Array.from({ length: 5 }, (_, n) => ref(n + 5));
  const catalog = roundSkillCatalog({ client, plugin, delegated: { person, refs: delegated }, named: delegated });
  const { adapter } = recordingAdapter();
  const host = new AgentHost(); host.register(adapter);
  const run = await host.start("probe", startRequest([...delegated, ...chosen]), { manifest, authorizedDirectories: [DIRECTORY], skillCatalog: catalog });
  const count = (action: string, actor: string) => seen.filter(call => call.action === action && call.actor === actor);
  assert.equal(count("skills.catalog.list", "plugin:coding").length, 1);
  assert.equal(count("skills.catalog.list", "person").length, 1);
  assert.deepEqual(count("skills.body.read", "plugin:coding").map(call => call.refs), [5], "the page's choices are read as the plugin");
  assert.deepEqual(count("skills.body.read", "person").map(call => call.refs), [5], "the delegated ones as the person who named them");
  assert.equal(seen.length, 4);
  assert.ok(seen.every(call => call.named === 5), "every read carries the round's named list");
  assert.deepEqual(run.frozen.skills.map(skill => skill.named), [...delegated.map(() => true), ...chosen.map(() => false)]);
});

test("SKP-07, SKC-08: a Skill the catalog no longer serves refuses the round before the Runtime is asked, and no other version is read", async () => {
  for (const refused of ["not_current", "off", "plugin_disabled"] as const) {
    const { adapter, seen } = recordingAdapter();
    const host = new AgentHost(); host.register(adapter);
    const { catalog, calls } = countingCatalog(undefined, skill => skill.skill_id === "skill-2" ? { ok: false, ref: skill, reason: refused } : body(skill));
    await assert.rejects(host.start("probe", startRequest([ref(1), ref(2)]), { manifest, authorizedDirectories: [DIRECTORY], skillCatalog: catalog }),
      (error: Error & { code?: string }) => error.code === "agent.capability_unavailable" && error.message.includes(refused));
    assert.equal(seen.length, 0, `${refused}: the Runtime never starts`);
    assert.deepEqual(calls, { list: 1, readBodies: 1, refs: [2] }, `${refused}: nothing is read again`);
  }
});

test("SKC-13: a catalog Skill that names a tool the role lacks starts the round, and the round still has no such tool", async () => {
  const { adapter, seen } = recordingAdapter();
  const host = new AgentHost(); host.register(adapter);
  const { catalog } = countingCatalog(() => ["read-file", "change-capability"]);
  const run = await host.start("probe", startRequest([ref(1)]), { manifest, authorizedDirectories: [DIRECTORY], skillCatalog: catalog,
    reply_language: { locale: "en", prompt: { prompt_id: "reply-language", version: 1, body: "Reply in English." } } });
  assert.deepEqual(seen[0]!.role!.skills![0]!.tools, ["read-file", "change-capability"], "the Skill is described as declared");
  assert.deepEqual(seen[0]!.role!.host_tools, ["read-file"], "the role is not widened");
  assert.deepEqual(run.frozen.host_tools, ["read-file"]);
  assert.equal(run.frozen.reply_locale, "en", "the record names the language the round replies in");
});

test("SKC-13: the Prologue registration of a catalog Skill names only the role's tools, so the model is never offered the other one", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "agent-skill-tools-"));
  const offered: string[][] = [];
  const systems: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(await new Request(input, init).text()) as { tools?: Array<{ name: string }>; system?: unknown };
    offered.push((body.tools ?? []).map(tool => tool.name));
    systems.push(JSON.stringify(body.system ?? ""));
    return cogniaModelResponse("Done.");
  });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.skill-tools-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"),
    reviewQueue: new AgentReviewQueue(),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  t.after(async () => { await adapter.close(); await rm(home, { recursive: true, force: true }); });
  const owner = { project_id: "skills", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Skills" });
  const skill = { ref: ref(1), origin: "catalog" as const, name: "Write a weekly review", tools: ["ask-user", "change-capability"], named: false, body: "Use the review template." };
  const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"], skills: [skill] };
  // Before 9-5 the registration carried the Skill's own tools and the SDK refused it (SKILL_PERMISSION_ESCALATION): the round never started.
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, skills: [skill.ref], task: "写周报" });
  for (const deadline = Date.now() + 20_000; !offered.length;) { assert.ok(Date.now() < deadline, "the model was never called"); await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.ok(offered[0]!.some(name => name.includes("ask-user")), "the role's own tool is offered");
  assert.ok(!offered[0]!.some(name => name.includes("change-capability")), "the Skill's other tool is not");
  assert.match(systems.join(""), /Use the review template\./, "the Skill's body reaches the round");
  assert.deepEqual(handle.frozen.host_tools, ["ask-user"]);
});
