import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
} from "@molis-ai/molis-work-design-system";
import {
  BUILTIN_PLUGIN_CATALOG,
  WORKBENCH_UI_SLOTS,
  createWorkbenchUiHost,
  renderMolisWorkPrimitiveCatalog,
  renderWorkbenchDocument,
} from "@molis-ai/molis-work-app-workbench";
import { UiHost, createSurfaceRenderer, createSurfaceRenderers, type UiSurfaceCallModel } from "@molis-ai/molis-work-ui-host";

test("Workbench owns the document shell and escapes document metadata", () => {
  const html = renderWorkbenchDocument({
    preamble_html: "<!-- product direction -->\n",
    lang: 'zh-CN" data-hostile="true',
    title: "Goal <One>",
    head_html: '<link rel="stylesheet" href="/workbench.css">',
    body_attributes: {
      "data-board-view": "current",
      "data-project": 'project-1" data-hostile="true',
      hidden: false,
    },
    body_html: '<main data-workbench-main>真实页面</main>',
  });

  assert.match(html, /^<!-- product direction -->\n<!doctype html>/);
  assert.match(html, /<html lang="zh-CN&quot; data-hostile=&quot;true">/);
  assert.match(html, /<title>Goal &lt;One&gt;<\/title>/);
  assert.match(html, /data-project="project-1&quot; data-hostile=&quot;true"/);
  assert.doesNotMatch(html, /<body[^>]*\shidden(?:\s|>)/);
  assert.match(html, /<main data-workbench-main>真实页面<\/main>/);
});

// K1-01: the real document shell uses the shared escaping for metadata and body attributes.
test("K1-01 document metadata keeps hostile markup inside its text and attribute values", () => {
  const value = `O'Reilly & </title><img src=x onerror="alert(1)">`;
  const html = renderWorkbenchDocument({ lang: "en", title: value, head_html: "", body_attributes: { title: value }, body_html: "<main>safe</main>" });
  assert.match(html, /<title>O&#039;Reilly &amp; &lt;\/title&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;<\/title>/);
  assert.match(html, /<body title="O&#039;Reilly &amp; &lt;\/title&gt;&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;">/);
  assert.equal(html.match(/<body[^>]*>/)?.[0], '<body title="O&#039;Reilly &amp; &lt;/title&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;">');
  assert.doesNotMatch(html, /<img/);
});

test("UI Host mounts only declared Plugin surfaces into compatible Workbench slots", () => {
  const contribution: UiContribution<{ title: string }> = {
    descriptor: {
      contribution_id: "io.molis.work.test.ui.v1",
      plugin_id: "io.molis.work.test",
      kind: "embedded",
      label: "Test",
      surfaces: [
        { surface_id: "panel", target_slot_id: "workbench.main", format: "declarative-html" },
      ],
      slots: [],
    },
    render: ({ model }) => `<article>${model.title}</article>`,
  };
  const host = new UiHost();
  host.register(contribution);
  // UIERR-01 / UIERR-02: rejected duplicates and missing content preserve the current registry.
  const before = host.list();
  assert.throws(() => host.register(contribution), (error: unknown) => error instanceof ActionError
    && error.code === "ui_host.contribution_conflict" && error.kind === "conflict" && actionHttpStatus(error) === 409);
  assert.throws(() => host.render({ contribution_id: "missing-uierr", surface: "panel", model: { title: "Missing" } }), (error: unknown) => error instanceof ActionError
    && error.code === "ui_host.contribution_not_found" && error.kind === "not_found" && actionHttpStatus(error) === 404);
  assert.deepEqual(host.list(), before);


  const mounted = host.mount({
    slot: WORKBENCH_UI_SLOTS.main,
    contribution: {
      contribution_id: contribution.descriptor.contribution_id,
      surface: "panel",
      model: { title: "Mounted" },
    },
  });
  assert.deepEqual(mounted, {
    slot_id: "workbench.main",
    contribution_id: "io.molis.work.test.ui.v1",
    surface: "panel",
    html: "<article>Mounted</article>",
  });
  assert.throws(
    () => host.mount({
      slot: WORKBENCH_UI_SLOTS.directory,
      contribution: {
        contribution_id: contribution.descriptor.contribution_id,
        surface: "panel",
        model: { title: "Wrong slot" },
      },
    }),
    (error) => error instanceof ActionError && error.code === "ui_host.slot_incompatible" && error.kind === "invalid" && actionHttpStatus(error) === 400,
  );
  assert.throws(
    () => host.mount({
      slot: WORKBENCH_UI_SLOTS.main,
      contribution: {
        contribution_id: contribution.descriptor.contribution_id,
        surface: "missing",
        model: { title: "Missing surface" },
      },
    }),
    (error) => error instanceof ActionError && error.code === "ui_host.surface_invalid" && error.kind === "invalid" && actionHttpStatus(error) === 400,
  );
});

test("W5-06 UI Host mounts a surface in the slot its contribution declares, and only in a slot this host offers", () => {
  const contribution: UiContribution<UiSurfaceCallModel<{ tag: string }>> = {
    descriptor: {
      contribution_id: "io.molis.work.test.declared.v1",
      plugin_id: "io.molis.work.test",
      kind: "embedded",
      label: "Test",
      surfaces: [
        { surface_id: "panel", target_slot_id: "workbench.main", format: "declarative-html" },
        { surface_id: "elsewhere", target_slot_id: "workbench.side", format: "declarative-html" },
      ],
      slots: [],
    },
    render: ({ surface, model }) => `<${model.primitives.tag} data-surface="${surface}">${model.kind}:${model.args.join(",")}</${model.primitives.tag}>`,
  };
  const host = new UiHost({ slots: [WORKBENCH_UI_SLOTS.main] });
  host.register(contribution);
  const id = contribution.descriptor.contribution_id;
  assert.deepEqual(host.mountDeclared({ contribution_id: id, surface: "panel", model: { kind: "panel", args: ["a"], primitives: { tag: "p" } } }), {
    slot_id: "workbench.main",
    contribution_id: id,
    surface: "panel",
    html: '<p data-surface="panel">panel:a</p>',
  });
  // The surface names a slot this host was not given: refused, never mounted in another slot.
  assert.throws(
    () => host.mountDeclared({ contribution_id: id, surface: "elsewhere", model: { kind: "elsewhere", args: [], primitives: { tag: "p" } } }),
    (error) => error instanceof ActionError && error.code === "ui_host.slot_incompatible" && error.kind === "invalid" && actionHttpStatus(error) === 400,
  );
  assert.throws(
    () => host.mountDeclared({ contribution_id: id, surface: "missing", model: { kind: "missing", args: [], primitives: { tag: "p" } } }),
    (error) => error instanceof ActionError && error.code === "ui_host.surface_invalid",
  );
  assert.throws(
    () => host.mountDeclared({ contribution_id: "io.molis.work.test.absent.v1", surface: "panel", model: { kind: "panel", args: [], primitives: { tag: "p" } } }),
    (error) => error instanceof ActionError && error.code === "ui_host.contribution_not_found",
  );

  // A renderer built from a method→surface map hands each call to the declared surface as { kind, args, primitives }.
  const renderer = createSurfaceRenderers<{ renderPanel(value: string, count: number): string }, { tag: string }>(host, id, { renderPanel: "panel" })({ tag: "em" });
  assert.equal(renderer.renderPanel("x", 2), '<em data-surface="panel">panel:x,2</em>');
  const render = createSurfaceRenderer<(value: string) => string, { tag: string }>(host, id, "panel")({ tag: "b" });
  assert.equal(render("y"), '<b data-surface="panel">panel:y</b>');
});

/**
 * Where a surface may mount: a slot the Workbench host offers, or a slot another contribution opens (`descriptor.slots`) when the plugin
 * that contribution belongs to lists the surface's plugin in its Manifest `ui.embedded_plugins`. Anything else is a problem.
 */
function surfaceSlotProblems(
  descriptors: readonly { contribution_id: string; plugin_id: string; surfaces?: readonly { surface_id: string; target_slot_id: string }[]; slots: readonly { slot_id: string }[] }[],
  embeddedBy: ReadonlyMap<string, readonly string[]>,
): string[] {
  const offered = new Set(Object.values(WORKBENCH_UI_SLOTS).map((slot) => slot.slot_id));
  const problems: string[] = [];
  for (const descriptor of descriptors) {
    for (const surface of descriptor.surfaces ?? []) {
      if (offered.has(surface.target_slot_id)) continue;
      const openers = descriptors.filter((other) => other.slots.some((slot) => slot.slot_id === surface.target_slot_id));
      if (openers.length === 0) {
        problems.push(`${descriptor.contribution_id} ${surface.surface_id} declares ${surface.target_slot_id}, which neither the Workbench host offers nor a contribution opens`);
      } else if (!openers.some((opener) => embeddedBy.get(opener.plugin_id)?.includes(descriptor.plugin_id))) {
        problems.push(`${descriptor.contribution_id} ${surface.surface_id} declares ${surface.target_slot_id}, opened by ${openers.map((opener) => opener.plugin_id).join(", ")}, whose Manifest ui.embedded_plugins does not list ${descriptor.plugin_id}`);
      }
    }
  }
  return problems;
}

test("W5-06 every surface a Workbench contribution declares names a slot the Workbench host offers, or one a plugin that embeds it opens", () => {
  const embeddedBy = new Map(BUILTIN_PLUGIN_CATALOG.map((entry) => [entry.manifest.plugin_id, entry.manifest.ui.embedded_plugins ?? []]));
  const descriptors = createWorkbenchUiHost().list();
  assert.deepEqual(surfaceSlotProblems(descriptors, embeddedBy), []);
  // The Coding page's slots are filled by the browsers it embeds, so the check above is not vacuous for them.
  assert.ok(descriptors.some((descriptor) => descriptor.surfaces?.some((surface) => surface.target_slot_id === "coding.companion-directory")));

  const opens = { contribution_id: "x.opener.ui.v1", plugin_id: "x.opener", slots: [{ slot_id: "x.opener.inner" }] };
  const embedded = { contribution_id: "x.embedded.ui.v1", plugin_id: "x.embedded", slots: [], surfaces: [{ surface_id: "s", target_slot_id: "x.opener.inner" }] };
  assert.deepEqual(surfaceSlotProblems([opens, embedded], new Map([["x.opener", ["x.embedded"]]])), []);
  // A slot nobody opens stays refused.
  assert.equal(surfaceSlotProblems([opens, { ...embedded, surfaces: [{ surface_id: "s", target_slot_id: "x.opener.nowhere" }] }], new Map([["x.opener", ["x.embedded"]]])).length, 1);
  // A slot a plugin opens is not open to a plugin its Manifest does not list.
  assert.equal(surfaceSlotProblems([opens, embedded], new Map([["x.opener", ["x.other"]]])).length, 1);
  assert.equal(surfaceSlotProblems([opens, embedded], new Map()).length, 1);
});

test("Workbench registers Native Plugin surfaces against stable slots", () => {
  const descriptors = createWorkbenchUiHost().list();
  for (const id of ["io.molis.work.native.goals.proposal", "io.molis.work.native.goals.decision-results"]) {
    assert.ok(descriptors.some(item => item.contribution_id === id), `${id} must be registered`);
  }
  const feed = descriptors.find((item) => item.contribution_id === "io.molis.work.native.feed.ui.v1");
  assert.ok(feed);
  assert.deepEqual(
    new Set(feed.surfaces?.map((surface) => surface.target_slot_id)),
    new Set(["workbench.directory", "workbench.main", "workbench.overlay"]),
  );
  const shelf = descriptors.find((item) => item.contribution_id === "io.molis.work.native.shelf.ui.v1");
  assert.ok(shelf);
  assert.deepEqual(
    new Set(shelf.surfaces?.map((surface) => surface.target_slot_id)),
    new Set(["workbench.side"]),
  );
  const shelfSettings = descriptors.find((item) => item.contribution_id === "io.molis.work.native.shelf.settings.v1");
  assert.ok(shelfSettings);
  assert.equal(shelfSettings.kind, "settings-page");
  assert.deepEqual(
    new Set(shelfSettings.surfaces?.map((surface) => surface.target_slot_id)),
    new Set(["workbench.settings"]),
  );
});

test("primitive catalog page is a local document with theme controls", () => {
  const html = renderMolisWorkPrimitiveCatalog();
  // Soft Workbench rollout: the catalog is the component board (specs/archive/soft-workbench-rollout).
  assert.match(html, /<title>组件板/);
  assert.match(html, /class="mw-catalog"/);
  assert.match(html, /href="\/assets\/molis-work-settings.css"/);
  assert.match(html, /data-theme-option="dark"/);
  assert.match(html, /data-primitive="button"/);
});

test("Design System and Workbench responsibilities have left legacy huge files", () => {
  const i18nRuntime = readFileSync("apps/workbench/src/i18n.ts", "utf8");
  const renderer = readFileSync("apps/workbench/src/renderer.ts", "utf8");

  assert.ok(i18nRuntime.split(/\r?\n/u).length < 200);
  assert.match(renderer, /from "@molis-ai\/molis-work-design-system"/);
  assert.match(renderer, /renderWorkbenchDocument/);
  assert.doesNotMatch(renderer, /const CLIENT_SCRIPT =/);
  assert.doesNotMatch(renderer, /const VISUAL_FOUNDATION_STYLES =/);
  assert.doesNotMatch(renderer, /SqliteMolisWorkStore|MolisWorkCoordinator/);

  assert.match(THEME_BOOTSTRAP_SCRIPT, /molis-work:theme/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-theme-option/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /:focus-visible/);
});
