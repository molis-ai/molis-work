import assert from "node:assert/strict";
import test from "node:test";
import { actionReachesAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILL_AUTHORED_PLUGIN_IDS, skillAuthoringActions } from "@molis-ai/molis-work-contracts/services/skills";
import { SkillAuthoringService, type SkillAuthoringPorts } from "@molis-ai/molis-work-app-local-host";

// S-skill-authoring: the four authored actions are the person's alone and are not MCP/Agent/plugin/workflow tools; a package of the
// same id from another publisher is not the person's even when this Home once signed the same version.

test("S-skill-authoring the four authored actions are user-only and reach no MCP, Agent, workflow or plugin caller", () => {
  for (const action of Object.values(skillAuthoringActions)) {
    assert.deepEqual(action.action.audiences, ["user"], action.capability_id);
    for (const audience of ["mcp", "agent", "workflow", "plugin"] as const)
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
