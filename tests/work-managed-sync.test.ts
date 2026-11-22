import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ensureStorageSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { configureLocalAccount, createLocalHostWorkbenchRenderer, createPersonalSync } from "@molis-ai/molis-work-app-local-host";
import { workSettings } from "../scripts/account-environments.mjs";
import { syncRoundResponse } from "./fixtures/sync-round.js";

test("V2-03: a sync round from a managed test Home uses test properties and ignores the shell", async t => {
  const root = await mkdtemp(join(tmpdir(), "molis-managed-sync-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(process.cwd(), "config"), join(root, "config"), { recursive: true });
  const config = join(root, "config", "test.properties");
  const origin = "https://work.test.molis.ai";
  await writeFile(config, (await readFile(config, "utf8")).replace(/^syncOrigin=.*$/mu, "syncOrigin=" + origin));
  const settings = workSettings("test", pathToFileURL(root + "/"), { publicOnly: true });
  configureLocalAccount("test", settings.account, "fixture-generation", settings.syncOrigin);
  const saved = process.env.MOLIS_WORK_SYNC_ORIGIN;
  process.env.MOLIS_WORK_SYNC_ORIGIN = "https://wrong.example.test";
  t.after(() => {
    if (saved === undefined) delete process.env.MOLIS_WORK_SYNC_ORIGIN;
    else process.env.MOLIS_WORK_SYNC_ORIGIN = saved;
  });

  const home = join(root, "home");
  const { authOrigin, applicationId } = settings.account;
  const userId = "alice";
  const space = personalStorageSpace(authOrigin, applicationId, userId);
  ensureStorageSpace(home, space);
  const check = () => {};
  const lease = {
    userId, applicationId, authOrigin, signal: new AbortController().signal,
    assertCurrent: check, accessToken: async () => "fixture-token",
  };
  const destinations: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: URL, init: RequestInit) => {
    assert.equal(input.origin, origin);
    assert.equal(init.redirect, "error");
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer fixture-token");
    destinations.push(input.pathname);
    if (input.pathname === "/v1/quota") return Response.json({ limitBytes: 100_000_000, usedBytes: 0 });
    assert.equal(input.pathname, "/v1/round");
    return syncRoundResponse({ spaceId: space.spaceId, revision: 1, selections: [] }, 0);
  });
  const sync = await createPersonalSync(home, space, lease, withMolisWorkProjectCatalog, check);
  assert.ok(sync);
  t.after(() => sync.close());
  await sync.run();
  assert.equal(sync.status().error, null);
  assert.ok(sync.status().lastSuccess);
  assert.ok(destinations.includes("/v1/round"));
  // P1-B6: Workbench shell renders the semantic environment badge element via design-system vars rather than injecting body::after CSS.
  const renderer = createLocalHostWorkbenchRenderer({
    appendDesktopQueryToLocalHrefs: html => html,
    withDesktopQuery: path => path,
    bootstrapScript: "",
  });
  const arrivalCss = renderer.renderMolisWorkArrivalStylesheet();
  assert.equal(arrivalCss.includes("body::after"), false, "CSS must not inject a hardcoded body::after badge");
  assert.equal(arrivalCss.includes(".mw-env-badge"), true, "shared stylesheet defines .mw-env-badge using semantic tokens");
  assert.match(renderer.renderMolisWorkWorkbenchStylesheet(), /body\.immersive-workbench > \.mw-env-badge\s*\{\s*bottom:\s*calc\(var\(--dock-h,\s*0px\) \+ 12px\);/u, "immersive workbench lifts .mw-env-badge above --dock-h");
  const chooserHtml = renderer.renderMolisWorkProjectIndex([], "token", false, { now: "2026-11-20T00:00:00.000Z", last_project_id: null, opened: {} });
  assert.equal(chooserHtml.includes('class="mw-env-badge" data-env-badge="test" role="note"'), true, "Workbench renders semantic environment badge element");
});
