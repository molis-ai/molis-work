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
  WORKBENCH_UI_SLOTS,
  createWorkbenchUiHost,
  renderMolisWorkPrimitiveCatalog,
  renderWorkbenchDocument,
} from "@molis-ai/molis-work-app-workbench";
import { UiContributionError, UiHost } from "@molis-ai/molis-work-ui-host";

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
    (error) => error instanceof UiContributionError && error.code === "ui_slot_incompatible",
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
    (error) => error instanceof UiContributionError && error.code === "ui_surface_invalid",
  );
});

test("Workbench registers Native Plugin surfaces against stable slots", () => {
  const descriptors = createWorkbenchUiHost().list();
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
    new Set(["workbench.directory", "workbench.main"]),
  );
});

test("primitive catalog page is a local document with theme controls", () => {
  const html = renderMolisWorkPrimitiveCatalog();
  assert.match(html, /<title>控件原语/);
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
