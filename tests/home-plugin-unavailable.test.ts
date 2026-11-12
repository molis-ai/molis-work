import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomePluginHost, installHostUiText, readText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { ActionService } from "@molis-ai/molis-work-kernel";

test("D0304 D0308 Home plugin startup is unavailable before ready and preserves a startup failure instead of reporting an empty installation list", async t => {
  const home = await mkdtemp(join(tmpdir(), "home-unavailable-")), actions = new ActionService(), original = new Error("private startup detail");
  const host = new HomePluginHost({ home, actorId: "local-owner", registry: actions, client: actions,
    entries: [{ create: () => { throw original; }, package_name: "unused-test-package", factory_export: "create" }] });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  installHostUiText();
  await assert.rejects(runWithLocale("en", () => host.ready({ start: false })), { code: "actions.unavailable" });
  assert.throws(() => host.installations(), { code: "actions.plugin_unavailable" });
  await assert.rejects(host.ready(), error => error === original);
  assert.throws(() => host.installations(), error => error === original);
});


test("D0308 the unavailable page has one translated alert, keeps the original file and never renders a backend reason", async () => {
  installHostUiText();
  const { renderOwnerUnavailablePage } = await import("@molis-ai/molis-work-app-workbench");
  const { desktopWorkbenchRendererPorts } = await import("@molis-ai/molis-work-app-desktop");
  // The page says why in its own words and gives the number to quote (upgrade-continuity U3 §2.3), never the store's message or code.
  for (const [reason, kept] of [["store_too_new", "neither reads nor changes it"], ["unreadable", "The original file is kept unchanged."]] as const) {
    const html = runWithLocale("en", () => renderOwnerUnavailablePage({ project: { project_id: "fixture", display_name: "Fixture" }, membership: { plugins: ["goals", "feed"], hidden: ["feed"] },
      card: { title: "The Home plugin store", reason, diagnostic_id: "D-3F9A2C81", rollback_href: null, reload_href: "/projects/fixture/" },
      desktopShell: false }, { readText, htmlLang: () => "en", desktop: desktopWorkbenchRendererPorts }));
    assert.equal((html.match(/role="alert"/g) ?? []).length, 1, reason);
    assert.doesNotMatch(html, /PRIVATE_FAILURE_BODY|storage\./u);
    assert.ok(html.includes(kept), reason);
    assert.match(html, /data-copy-value="D-3F9A2C81"/u);
    assert.match(html, /data-stored-project-plugin="feed" data-plugin-hidden="true"/u);
  }
});
