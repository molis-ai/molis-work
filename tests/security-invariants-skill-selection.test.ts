import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SkillCatalog, homeAgentDefinitions, type CatalogSkill } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionSkillRound } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILL_ROUND_AUTO_LIMIT, SKILLS_PERMISSIONS, SKILLS_PROVIDER_ID, skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";
import { createHash } from "node:crypto";
import { applyRunEvent, emptyPrologueStreamState, type PrologueEvent } from "@molis-ai/molis-work-service-agent-host";

// Skill selection (specs/prologue-strategies/skill.md): the AI picks by the task, the catalog keeps the limit and the person's choices.

const skillOf = (id: string): CatalogSkill => ({
  ref: { source: { kind: "plugin", plugin_id: "example.skills", plugin_version: "1.0.0", publisher_signature: "signature" }, install_id: "install", installation_generation: "generation-1", skill_id: id, version: 1 },
  declaration: { skill_id: id, version: 1, name: `Skill ${id}`, summary: id, description: `Does ${id}`, applies_to: "both", tools: [] }, body: `Body of ${id}`,
  pack: { plugin_id: "example.skills", title: "Examples", version: "1.0.0", publisher_label: "Example", trust: "pinned", scope: "project" }, availability: { available: true },
  assertCurrent: () => undefined, assertPublisher: () => undefined });

async function withCatalog(run: (catalog: SkillCatalog, skills: CatalogSkill[], definitions: ReturnType<typeof homeAgentDefinitions>) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "skill-selection-"));
  try {
    const definitions = homeAgentDefinitions(home), skills = ["a", "b", "c", "d", "m"].map(skillOf);
    for (const skill of skills) definitions.skills.set("project-a", "install", skill.ref.skill_id, skill.ref.skill_id === "m" ? "manual" : "auto", 0, "person");
    await run(new SkillCatalog({ definitions, withSkills: async (_caller, use) => use(skills), resource: () => new Uint8Array(), publishers: () => new Map() }), skills, definitions);
  } finally { await rm(home, { recursive: true, force: true }); }
}
const agent = (round: ActionSkillRound): ActionCallContext => ({ actor_id: "assistant", project_id: "project-a", audience: "agent", permissions: [...SKILLS_PERMISSIONS], skill_round: round });
const outcome = async (catalog: SkillCatalog, caller: ActionCallContext, ...skills: CatalogSkill[]) =>
  (await catalog.readBodies(caller, skills.map(skill => skill.ref))).results.map(result => result.ok ? "ok" : result.reason);

test("SKL-02: a round reads at most three automatic Skills of its own choice; the next is refused as over_limit", async () => {
  await withCatalog(async (catalog, [a, b, c, d], definitions) => {
    assert.equal(SKILL_ROUND_AUTO_LIMIT, 3);
    const round = agent({ consumer: "assistant", named: [], round: "round-1" });
    assert.deepEqual(await outcome(catalog, round, a!, b!), ["ok", "ok"]);
    assert.deepEqual(await outcome(catalog, round, a!, c!, d!), ["ok", "ok", "over_limit"], "reading one again is free; the fourth different one is refused, in the same request too");
    assert.deepEqual(await outcome(catalog, round, d!), ["over_limit"], "and stays refused for the rest of the round");
    assert.deepEqual(await outcome(catalog, agent({ consumer: "assistant", named: [], round: "round-2" }), d!), ["ok"], "another round counts from zero");
    // Each pick is recorded as used once, however many times the round read it; the refused one is not.
    assert.deepEqual(["a", "b", "c", "d"].map(id => definitions.skills.uses("install", id).length), [1, 1, 1, 1]);
    assert.equal(definitions.skills.uses("install", "a")[0]?.caller, "assistant");
  });
});

test("SKL-01 SKL-02: Skills the person named are outside the count, and a manual Skill opens only by name", async () => {
  await withCatalog(async (catalog, [a, b, c, d, manual]) => {
    assert.deepEqual(await outcome(catalog, agent({ consumer: "assistant", named: [], round: "r" }), manual!), ["not_named"], "an exact reference does not get past 仅手动");
    const round = agent({ consumer: "assistant", named: [manual!.ref, a!.ref], round: "named" });
    assert.deepEqual(await outcome(catalog, round, manual!, a!, b!, c!, d!), ["ok", "ok", "ok", "ok", "ok"], "two named and three of its own choice");
  });
});

test("SKL-11: a round the person asked to run without automatic Skills reads only the ones they named", async () => {
  await withCatalog(async (catalog, [a, b], definitions) => {
    const round = agent({ consumer: "coding", named: [b!.ref], round: "plain", auto: false });
    assert.deepEqual(await outcome(catalog, round, a!, b!), ["not_named", "ok"]);
    await assert.rejects(catalog.readResource(round, a!.ref, "skills/a/references/x.md"), (error: { details?: { reason?: string } }) => error.details?.reason === "not_named");
    assert.equal(definitions.skills.uses("install", "a").length, 0, "a refused read is no use");
  });
});

test("S-skill-catalog: a refused resource read takes no choice and records no use", async () => {
  const home = await mkdtemp(join(tmpdir(), "skill-selection-resource-"));
  try {
    const definitions = homeAgentDefinitions(home), skills = ["a", "b", "c", "d"].map(skillOf), a = skills[0]!;
    a.declaration.resources = [{ path: "skills/a/references/x.md", role: "reference", media_type: "text/markdown", bytes: 3, sha256: "0".repeat(64) }];
    for (const skill of skills) definitions.skills.set("project-a", "install", skill.ref.skill_id, "auto", 0, "person");
    const catalog = new SkillCatalog({ definitions, withSkills: async (_caller, use) => use(skills), resource: () => { throw new Error("the file is missing"); }, publishers: () => new Map() });
    const round = agent({ consumer: "assistant", named: [], round: "resource-round" });
    await assert.rejects(catalog.readResource(round, a.ref, "skills/a/references/x.md"),
      (error: { details?: { reason?: string } }) => error.details?.reason === "resource_invalid");
    assert.equal(definitions.skills.uses("install", "a").length, 0, "a refused resource read is no use");
    assert.deepEqual(await outcome(catalog, round, skills[1]!, skills[2]!, skills[3]!), ["ok", "ok", "ok"],
      "the refused read did not take one of the round's three choices");
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("SKL-02: a read that is no round's own (no round number) is neither counted nor recorded", async () => {
  await withCatalog(async (catalog, [a, b, c, d], definitions) => {
    // The freeze of a round's list and the person's preview read with a `skill_round` that carries no number.
    assert.deepEqual(await outcome(catalog, agent({ consumer: "assistant", named: [] }), a!, b!, c!, d!), ["ok", "ok", "ok", "ok"]);
    assert.equal(definitions.skills.uses("install", "a").length, 0);
  });
});

const READ = { capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version, provider_id: SKILLS_PROVIDER_ID };

test("SKL-11: what a round read from the catalog comes from its own tool calls, never from another tool's look-alike result", () => {
  const state = emptyPrologueStreamState(), at = "2026-11-14T00:00:00.000Z";
  const a = skillOf("a").ref, b = skillOf("b").ref;
  const answer = (...rows: object[]) => JSON.stringify({ results: rows });
  // A round's own action tool, as the Host names it: its pack's scope, then the digest of the exact action.
  const direct = "molis-action-0123456789abcdef01234567-" + createHash("sha256").update(JSON.stringify([READ.capability_id, READ.version, READ.provider_id])).digest("hex").slice(0, 24);
  const events: PrologueEvent[] = [
    { type: "tool-call", call: { id: "c1", name: direct, input: { refs: [a, b] } } },
    { type: "tool-result", callId: "c1", name: direct, outcome: "returned", text: answer({ ref: a, ok: true, name: "Skill a", body: "…" }, { ref: b, ok: false, reason: "over_limit" }) },
    { type: "tool-call", call: { id: "c2", name: "read-capability", input: { ...READ, input: { refs: [b, a] } } } },
    { type: "tool-result", callId: "c2", name: "read-capability", outcome: "returned", text: answer({ ref: b, ok: true, name: "Skill b", body: "…" }, { ref: a, ok: true, name: "Skill a", body: "…" }) },
    // Another capability answering in the catalog's shape, and a catalog read that failed: neither is a Skill the round used.
    { type: "tool-call", call: { id: "c3", name: "read-capability", input: { provider_id: "plugin.other", capability_id: "other.read", version: 1, input: {} } } },
    { type: "tool-result", callId: "c3", name: "read-capability", outcome: "returned", text: answer({ ref: skillOf("x").ref, ok: true, name: "Forged", body: "…" }) },
    { type: "tool-call", call: { id: "c4", name: direct, input: { refs: [skillOf("y").ref] } } },
    { type: "tool-result", callId: "c4", name: direct, outcome: "failed", text: answer({ ref: skillOf("y").ref, ok: true, name: "Failed", body: "…" }) },
  ] as PrologueEvent[];
  for (const event of events) applyRunEvent(state, event, at);
  assert.deepEqual(state.skill_reads, [{ ref: a, name: "Skill a" }, { ref: b, name: "Skill b" }]);
});
