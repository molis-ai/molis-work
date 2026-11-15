import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext, ActionDefinition, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { definePresentationOverviewAction, type PresentationOverviewDeclaration } from "@molis-ai/molis-work-contracts/platform/presentation";
import { SURFACES_PROVIDER_ID, surfaceCompositionActions, type SurfaceDescription, type SurfaceGroup, type SurfaceInstallationRef, type SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { assertSurfaceDescription, validatePresentationDeclaration } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { SurfaceCompositionService, type SurfaceComposePorts, type SurfaceHomePlugin, type SurfacePlugin } from "@molis-ai/molis-work-service-surfaces";

// The home's main content (`presentation.overview.lead`, specs/work-brief/contract-design.md §2): any plugin may declare one of its own
// main-area views; the composition names at most one, first, and nothing else on the home changes.

const project = "project-a";
const person = { actor_id: "local-person", project_id: project, audience: "user" } as const;
const request = { slot: { kind: "home" } } satisfies SurfaceRequest;
const ownerId = (name: string) => "io.molis.work." + name;
const release = (plugin: SurfacePlugin & { home: SurfaceHomePlugin }): SurfaceInstallationRef => ({ scope: plugin.scope, install_id: plugin.install_id,
  installation_generation: plugin.home.installation_generation, version: plugin.home.version, manifest_digest: plugin.home.manifest_digest });

function installation(name: string, order: number, lead?: string, options: Partial<SurfacePlugin> = {}): SurfacePlugin & { home: SurfaceHomePlugin } {
  const scope = options.scope ?? "project";
  const overview: PresentationOverviewDeclaration = { capability_id: name + ".overview", version: 1, ...(lead ? { lead: { view_id: lead } } : {}) };
  return { plugin_id: ownerId(name), install_id: name + "-" + scope, state: "running", slots: [], revision: "release-r1", presentation: { objects: [], overview }, ...options,
    scope, home: options.home ?? { order, installation_generation: "generation-1", version: "1.0.0", manifest_digest: "digest-" + name, stage_view_id: "stage" } };
}

function compose(plugins: SurfacePlugin[], input: SurfaceRequest = request, views: ActionView[] = []) {
  const ports: SurfaceComposePorts = {
    caller: person, current: () => undefined, beforeEffect: async () => undefined,
    catalog: () => plugins, discover: () => ({ views, retain: () => () => undefined }),
    corrections: { read: () => ({ corrections: [], revision: "0" }), correct: async () => { throw new Error("unexpected write"); } },
    attention: () => [], relations: () => [],
    values: async () => assert.fail("unexpected values read"), subject: async () => assert.fail("unexpected subject read"),
    home: { overview: async () => { throw new Error("unexpected overview"); }, acceptsEmptyInput: () => true, retainCatalog: () => () => undefined,
      hiddenAboveLabel: count => ({ owner: "workbench", key: "common.surface.hidden-above", args: [{ name: "count", kind: "number", number: count }] }) },
  };
  return new SurfaceCompositionService().compose(input, ports);
}
const leads = (result: SurfaceDescription) => result.groups.filter(group => group.kind === "lead");

test("WBR-22 a Manifest names only its own main-area view as the home's main content", () => {
  const overview = definePresentationOverviewAction("brief.overview", 1, "Overview", []);
  const manifest = (lead: unknown, slot = "stage") => ({ plugin_id: ownerId("brief"), actions: [overview], ui: { views: [{ view_id: "stage", slot }, { view_id: "side", slot: "panel" }] },
    presentation: { objects: [], overview: { capability_id: "brief.overview", version: 1, lead } } });
  assert.deepEqual(validatePresentationDeclaration(manifest({ view_id: "stage" })), []);
  assert.deepEqual(validatePresentationDeclaration(manifest({ view_id: "stage" }, "navigator")), []);
  for (const lead of [{ view_id: "side" }, { view_id: "another-owner" }, { view_id: "stage", url: "/external" }, { view_id: 1 }, "stage", null]) {
    assert.match(validatePresentationDeclaration(manifest(lead)).join("\n"), /presentation\.overview\.lead/);
  }
  assert.match(validatePresentationDeclaration(manifest({ view_id: "stage" }, "settings")).join("\n"), /presentation\.overview\.lead/);
});

test("WBR-21 WBR-22 the home leads with one running plugin's declared page, and without it is the basic home unchanged", async () => {
  const notes = installation("notes", 0), brief = installation("brief", 1, "stage");
  const basic = await compose([notes]);
  assert.deepEqual(basic.groups.map(group => group.kind), ["attention", "plugin"]);

  const led = await compose([notes, brief]);
  assert.deepEqual(led.groups.map(group => group.kind), ["lead", "attention", "plugin", "plugin"]);
  assert.deepEqual(led.groups[0], { kind: "lead", owner_plugin_id: brief.plugin_id, state: "ok", items: [], lead: { installation: release(brief), view_id: "stage" } });
  // The cards under it are the basic home's, the lead plugin's own card included: switching back loses nothing.
  assert.deepEqual(led.groups.slice(1), (await compose([notes, { ...brief, presentation: { objects: [], overview: { capability_id: "brief.overview", version: 1 } } }])).groups);
  assert.notEqual(led.revision, basic.revision);

  // Disabled, unavailable, a page that is not the selected main view, or two running installations: no lead, the basic home stays.
  for (const changed of [
    { ...brief, state: "disabled" as const },
    { ...brief, home: { ...brief.home, unavailable: true as const } },
    { ...brief, home: { ...brief.home, stage_view_id: "other" } },
    { ...brief, home: { ...brief.home, stage_view_id: undefined } },
  ]) assert.deepEqual(leads(await compose([notes, changed])), []);
  const home = installation("brief", 1, "stage", { scope: "home" });
  assert.deepEqual(leads(await compose([notes, brief, home])), []);
  // A dual-instance plugin whose project half alone has the page still leads.
  const half = { ...home, home: { ...home.home, stage_view_id: undefined } };
  assert.deepEqual(leads(await compose([notes, brief, half])).map(group => group.lead?.installation.scope), ["project"]);
});

test("WBR-23 several plugins may declare a lead; the person's order, then the Dock order, then the id picks exactly one", async () => {
  const a = installation("alpha", 1, "stage"), b = installation("beta", 0, "stage"), c = installation("gamma", 0, "stage");
  const owner = async (input?: SurfaceRequest) => leads(await compose([a, b, c], input)).map(group => group.owner_plugin_id);
  assert.deepEqual(await owner(), [b.plugin_id]);
  assert.deepEqual(await owner({ ...request, home_order: [a.plugin_id] }), [a.plugin_id]);
  assert.deepEqual(await owner({ ...request, home_order: [c.plugin_id, a.plugin_id] }), [c.plugin_id]);
});

test("WBR-22 the action contract and the SDK reject a lead that is misplaced, rewritten, filled or not ok", async () => {
  const brief = installation("brief", 0, "stage");
  const candidate = await compose([brief]);
  const lead = candidate.groups[0]!;
  assert.deepEqual(assertSurfaceDescription(candidate, candidate), { description: candidate, dropped: [] });
  const withLead = (group: unknown): SurfaceDescription => ({ ...candidate, groups: [group as SurfaceGroup, ...candidate.groups.slice(1)] });
  const bad = [
    { ...lead, lead: { ...lead.lead!, view_id: "other" } },
    { ...lead, lead: { ...lead.lead!, installation: { ...lead.lead!.installation, manifest_digest: "other-release" } } },
    { ...lead, lead: { ...lead.lead!, url: "/external" } },
    { ...lead, owner_plugin_id: ownerId("other") },
  ];
  for (const group of bad) assert.throws(() => assertSurfaceDescription(withLead(group), candidate), { code: "actions.output_invalid" });
  // Forged candidates: the rules hold on the facts themselves.
  for (const group of [
    { ...lead, state: "stale", read_at: "2026-11-14T08:00:00Z" },
    { ...lead, lead: undefined },
    { ...lead, owner_plugin_id: undefined },
    { kind: "attention", state: "ok", items: [], lead: lead.lead },
    { kind: "plugin", owner_plugin_id: brief.plugin_id, state: "ok", items: [], plugin_card: {}, lead: lead.lead },
  ]) {
    const forged = withLead(group);
    assert.throws(() => assertSurfaceDescription(forged, forged), { code: "actions.output_invalid" });
  }

  const service = new ActionService();
  let answer: unknown = candidate;
  const definition: ActionDefinition = surfaceCompositionActions.compose;
  service.registerProvider({ provider: { provider_id: SURFACES_PROVIDER_ID, kind: "system", title: "Surfaces", project_id: project },
    definitions: [definition], handlers: [{ capability_id: definition.capability_id, version: definition.version, handle: () => answer }] });
  const caller: ActionCallContext = { actor_id: "local-person", audience: "user", project_id: project, permissions: [] };
  assert.deepEqual(await service.invoke(caller, definition, request), candidate);
  for (const group of [
    { ...lead, state: "unreadable" },
    { ...lead, lead: undefined },
    { ...lead, owner_plugin_id: undefined },
    { ...lead, lead: { view_id: "stage" } },
    { ...lead, lead: { ...lead.lead!, frame_path: "/x" } },
    { kind: "attention", state: "ok", items: [], lead: lead.lead },
  ]) {
    answer = withLead(group);
    await assert.rejects(service.invoke(caller, definition, request), { code: "actions.output_invalid" });
  }
});
