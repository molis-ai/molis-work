import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SkillCatalog, homeAgentDefinitions, withSkillSelection, type CatalogSkill } from "@molis-ai/molis-work-app-local-host";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillCatalogEntry, type SkillBodyReadResult } from "@molis-ai/molis-work-contracts/services/skills";
import type { ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { installedPackageHost } from "./fixtures/signed-package-host.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { CONTENT_PLUGIN_ID, signedContentPackage } from "./fixtures/content-package.js";

const action = (value: { capability_id: string; version: number }) => ({ capability_id: value.capability_id, version: value.version });

test("SKC-06 SKC-08 SKC-09: missing grants, revoked publisher and changed signed bytes refuse Skill reads", { timeout: 90_000 }, async () => {
  const h = await installedPackageHost();
  try {
    const publisher = newPublisher(); await h.install(signedContentPackage(publisher));
    const person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] };
    const list = async () => (await h.client.invoke(person, action(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] }).skills.find(row => row.pack.plugin_id === CONTENT_PLUGIN_ID)!;
    const skill = await list();
    const read = () => h.client.invoke(person, action(skillCatalogActions.readBodies), { refs: [skill.ref] }) as Promise<{ results: SkillBodyReadResult[] }>;
    const set = () => h.client.invoke(person, action(skillCatalogActions.setState), { scope: "project", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state: "auto", expected_revision: 0 });
    await assert.rejects(h.client.invoke({ ...person, permissions: [] }, action(skillCatalogActions.readBodies), { refs: [skill.ref] }));
    await assert.rejects(h.client.invoke(person, action(skillCatalogActions.readBodies), { refs: [skill.ref], named: [skill.ref] }), { code: "actions.input_invalid" });
    await set();
    assert.equal((await read()).results[0]!.ok, true);
    const bundles = async (directory: string): Promise<string[]> => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(entry => entry.isDirectory() ? bundles(join(directory, entry.name)) : Promise.resolve(entry.name === "bundle.json" ? [join(directory, entry.name)] : [])))).flat();
    const file = (await bundles(join(h.home, "plugin-packages")))[0]!;
    const original = await readFile(file, "utf8"), bundle = JSON.parse(original); bundle.payload.manifest.name = "Tampered";
    await chmod(file, 0o600); await writeFile(file, JSON.stringify(bundle));
    assert.deepEqual((await read()).results[0], { ref: skill.ref, ok: false, reason: "resource_invalid" });
    await writeFile(file, original);
    h.ledger.revokePublisher(skill.ref.source.publisher_signature, new Date().toISOString());
    const refused = (await read()).results[0]!;
    assert.equal(refused.ok, false); if (!refused.ok) assert.equal(refused.reason, "publisher_revoked");
    await assert.rejects(set(), { code: "skills.settings_locked" });
  } finally { await h.close(); }
});

test("SKC-12: rejected, cancelled and stale acceptance receipts record no uses; accepted history survives uninstall", async () => {
  const home = await mkdtemp(join(tmpdir(), "skill-receipt-"));
  try {
    const definitions = homeAgentDefinitions(home), controller = new AbortController();
    let current = true;
    const skill: CatalogSkill = { ref: { source: { kind: "plugin", plugin_id: "example.skills", plugin_version: "1.0.0", publisher_signature: "signature" }, install_id: "install", installation_generation: "generation-1", skill_id: "review", version: 1 },
      declaration: { skill_id: "review", version: 1, name: "Review v1", summary: "Review", description: "Review a document", applies_to: "both", tools: [] }, body: "Read it", pack: { plugin_id: "example.skills", title: "Reviews", version: "1.0.0", publisher_label: "Example", trust: "pinned", scope: "project" }, availability: { available: true },
      assertCurrent: () => { if (!current) throw new Error("Installation changed"); }, assertPublisher: () => undefined };
    const catalog = new SkillCatalog({ definitions, skills: async () => [skill], resource: () => new Uint8Array(), publishers: () => new Map() });
    definitions.skills.set("project-a", "install", "review", "manual", 0, "person");
    const caller: ActionExecutionContext = { actor_id: "person", project_id: "project-a", audience: "user", permissions: SKILLS_PERMISSIONS,
      signal: controller.signal, beforeEffect: async () => { controller.signal.throwIfAborted(); } };
    const selection = { actor_id: "person", project_id: "project-a", consumer: "assistant" as const, named: [skill.ref] };
    const accept = (accepted = true) => withSkillSelection(selection, () => catalog.recordAcceptedUses(caller, { accepted, refs: [skill.ref, skill.ref], run_ref: "run-1" }));
    await accept(false); assert.deepEqual(definitions.skills.uses("install", "review"), []);
    await catalog.recordAcceptedUses(caller, { accepted: true, refs: [skill.ref] }); assert.deepEqual(definitions.skills.uses("install", "review"), [], "no trusted round selection");
    current = false; await accept(); assert.deepEqual(definitions.skills.uses("install", "review"), []);
    current = true; await accept(); assert.equal(definitions.skills.uses("install", "review").length, 1, "one receipt does not duplicate a repeated reference");
    assert.equal((await catalog.list(caller, {})).skills[0]?.last_used?.run_ref, "run-1");
    // The person's protected page click names one Skill to read (no consumer): a manual Skill opens, and the view records no use.
    const pageSelection = { actor_id: "person", project_id: "project-a", named: [skill.ref] };
    const pageRead = await withSkillSelection(pageSelection, () => catalog.readBodies(caller, [skill.ref]));
    assert.equal(pageRead.results[0]!.ok, true, "the page view may show a manual Skill it named");
    await withSkillSelection(pageSelection, () => catalog.recordAcceptedUses(caller, { accepted: true, refs: [skill.ref], run_ref: "page" }));
    assert.equal(definitions.skills.uses("install", "review").length, 1, "a page view is not a round and records no use");
    controller.abort(); await assert.rejects(accept()); assert.equal(definitions.skills.uses("install", "review").length, 1);
    definitions.skills.forget("project-a", "install");
    assert.equal(definitions.skills.uses("install", "review")[0]?.name, "Review v1");
    assert.equal(definitions.skills.uses("install", "review")[0]?.ref.version, 1);
  } finally { await rm(home, { recursive: true, force: true }); }
});
