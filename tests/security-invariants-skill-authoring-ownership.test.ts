import assert from "node:assert/strict";
import test from "node:test";
import { actionReachesAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILL_AUTHORED_PLUGIN_IDS, skillAuthoringActions, skillDraftActions } from "@molis-ai/molis-work-contracts/services/skills";
import { SkillAuthoringService, type SkillAuthoringPorts } from "@molis-ai/molis-work-app-local-host";

// S-skill-authoring: adopting a draft and the other authoring actions are the person's alone and are not MCP/Agent/plugin/workflow
// tools; the Assistant may only start a draft, replay it and take its own draft back. A package of the same id from another
// publisher is not the person's even when this Home once signed the same version.

const ASSISTANT_DRAFTING = new Set([skillDraftActions.create, skillDraftActions.discard, skillDraftActions.runTrial]);

test("S-skill-authoring adopting and the authored actions are user-only and reach no MCP, Agent, workflow or plugin caller", () => {
  for (const action of [...Object.values(skillAuthoringActions), ...Object.values(skillDraftActions).filter(action => !ASSISTANT_DRAFTING.has(action))]) {
    assert.deepEqual(action.action.audiences, ["user"], action.capability_id);
    for (const audience of ["mcp", "agent", "workflow", "plugin"] as const)
      assert.equal(actionReachesAudience(action.action, action.capability_id, audience), false, `${action.capability_id} must not reach ${audience}`);
  }
  assert.ok(Object.values(skillDraftActions).includes(skillDraftActions.adopt));
  for (const action of ASSISTANT_DRAFTING) {
    assert.deepEqual([...action.action.audiences].sort(), ["agent", "user"], action.capability_id);
    for (const audience of ["mcp", "workflow", "plugin"] as const)
      assert.equal(actionReachesAudience(action.action, action.capability_id, audience), false, `${action.capability_id} must not reach ${audience}`);
  }
});

const packaged = (publisher: string, version: string, skillId: string) => ({
  manifest: { plugin_id: SKILL_AUTHORED_PLUGIN_IDS.project, version, methods: [{ skill_id: skillId, version: 1, name: skillId, summary: skillId,
    description: `用户要${skillId}时使用。`, applies_to: "assistant", body: `skills/${skillId}/SKILL.md` }] },
  trust: publisher, agentBodies: [{ kind: "method", entry_id: skillId, body: `# ${skillId}` }],
});

test("S-skill-authoring a foreign package of the same id and version is not the person's, even when this Home retained that version", async () => {
  let signed = 0, removed = 0;
  const foreign = packaged("foreign-key", "1.0.0", "foreign");
  const ports = {
    installed: async () => foreign,
    publisherKeyId: () => "home-key",
    readSealedPublisherKeyId: async () => { throw new Error("must not read a sealed key"); },
    retained: () => [], retainedOf: () => [packaged("home-key", "1.0.0", "mine")],
    installedPublisher: async () => "foreign-key",
    sign: async () => { signed++; throw new Error("must not sign"); },
    uninstall: async () => { removed++; },
    install: { readPreview: () => { throw new Error("must not preview"); }, confirm: async () => { throw new Error("must not confirm"); } },
  } as SkillAuthoringPorts;
  const service = new SkillAuthoringService(ports);
  await assert.rejects(service.save({ name: "mine", description: "用户要mine时使用。", applies_to: "assistant", body: "# mine", scope: "project" },
    { project_id: "project-a", actor_id: "person" }, {} as never),
  (error: { code?: string }) => error.code === "skills.authored_unknown");
  assert.deepEqual([signed, removed], [0, 0], "nothing was signed or taken off");
});

test("UPP-31 R22 the personal space has no project layer of own Skills: saving or removing one there is refused before anything is read", async () => {
  const untouched = new Proxy({}, { get: (_target, name) => () => { throw new Error(`port ${String(name)} must not be reached`); } });
  const service = new SkillAuthoringService(untouched as never);
  const who = { project_id: "personal", actor_id: "local-person" };
  const caller = {} as never;
  const refusedScope = (error: unknown) => (error as { code?: string; details?: { field?: string } }).code === "skills.authored_invalid"
    && (error as { details?: { field?: string } }).details?.field === "scope";
  await assert.rejects(service.save({ name: "周报", description: "写周报时用。", applies_to: "assistant", body: "先问清楚。", scope: "project" }, who, caller), refusedScope);
  await assert.rejects(service.remove({ scope: "project", skill_id: "weekly", expected_version: 1 }, who, caller), refusedScope);
});
