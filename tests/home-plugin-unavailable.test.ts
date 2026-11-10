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
  assert.throws(() => host.installations(), { code: "actions.plugin_unavailable" });
  await assert.rejects(host.ready(), error => error === original);
  assert.throws(() => host.installations(), error => error === original);
});


test("D0308 the unavailable page has one translated alert, keeps the original file and never renders a backend reason", async () => {
  installHostUiText();
  const { renderPluginStoreUnavailablePage } = await import("@molis-ai/molis-work-app-workbench");
  const { desktopWorkbenchRendererPorts } = await import("@molis-ai/molis-work-app-desktop");
  for (const code of ["storage.store_too_new", "storage.upgrade_required", "storage.stores_unavailable"]) {
    const html = runWithLocale("en", () => renderPluginStoreUnavailablePage({ project: { project_id: "fixture", display_name: "Fixture" }, membership: { plugins: ["goals", "feed"], hidden: ["feed"] },
      reason: "PRIVATE_FAILURE_BODY", code, reloadHref: "/projects/fixture/", desktopShell: false }, { readText, htmlLang: () => "en", desktop: desktopWorkbenchRendererPorts }));
    assert.equal((html.match(/role="alert"/g) ?? []).length, 1, code);
    assert.doesNotMatch(html, /PRIVATE_FAILURE_BODY/);
    assert.ok(html.includes(code === "storage.stores_unavailable" ? "Its files have been kept." : "The original file is kept."), code);
    assert.match(html, new RegExp(code.replaceAll(".", "\\.")));
  }
});
