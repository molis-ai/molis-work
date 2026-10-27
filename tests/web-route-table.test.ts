import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// specs/repository-anti-corruption W5-07: handleMolisWorkWebRequest became an ordered route table. What the table must keep is which
// handler answers each address, in the same order, and what falls through to the 404s. This asks the public web server (the same
// local control guard in front) a fixed list of requests and pins what comes back: status, content type, redirect, and the JSON
// error code and message or the top-level keys, or an HTML page's title. The snapshot was written on main before the refactor
// (MOLIS_WORK_UPDATE_ROUTE_SNAPSHOT=1) and the refactor passes it unchanged.

const SNAPSHOT = fileURLToPath(new URL("./fixtures/web-route-table.snapshot.json", import.meta.url));

type Probe = { method: "GET" | "POST"; path: string; body?: unknown; html?: boolean; bare?: boolean };

/** Addresses outside any project: before the request is resolved, then the Home's own pages and APIs. */
const HOME_PROBES: Probe[] = [
  { method: "GET", path: "/", html: true },
  { method: "GET", path: "/onboarding", html: true },
  { method: "GET", path: "/health" },
  { method: "GET", path: "/api" },
  { method: "GET", path: "/api/no-such-route" },
  { method: "GET", path: "/no-such-page", html: true },
  { method: "GET", path: "/plugins/todo", html: true },
  { method: "GET", path: "/plugins/no-such-plugin", html: true },
  { method: "GET", path: "/api/plugins/todo/no-such-operation" },
  { method: "GET", path: "/api/plugins/no-such-plugin/x" },
  { method: "GET", path: "/functions", html: true },
  { method: "GET", path: "/settings", html: true },
  { method: "GET", path: "/settings/connectors", html: true },
  { method: "GET", path: "/settings/mcp", html: true },
  { method: "GET", path: "/settings/functions", html: true },
  { method: "GET", path: "/__ui/catalog", html: true },
  { method: "GET", path: "/api/agent-definitions/" },
  { method: "GET", path: "/api/agent-definitions/no-such-definition" },
  { method: "GET", path: "/api/agent-definitions/prompts" },
  { method: "GET", path: "/api/memory/" },
  { method: "GET", path: "/api/memory/overview" },
  { method: "GET", path: "/api/memory/items" },
  { method: "GET", path: "/api/assistant/" },
  { method: "GET", path: "/api/assistant/works" },
  { method: "GET", path: "/api/attention" },
  { method: "GET", path: "/api/side/files/sources" },
  { method: "GET", path: "/api/side/files/raw" },
  { method: "GET", path: "/api/agent/reviews" },
  { method: "POST", path: "/api/agent/reviews/decide", body: {} },
  { method: "GET", path: "/api/projects" },
  { method: "GET", path: "/api/search/status" },
  { method: "GET", path: "/api/settings/planning-methods" },
  { method: "GET", path: "/api/board" },
  { method: "GET", path: "/api/board", bare: true },
  { method: "POST", path: "/api/assistant/works", body: {}, bare: true },
  { method: "GET", path: "/desktop/pty-client.js" },
  { method: "GET", path: "/projects/no-such-project/api/board" },
  { method: "GET", path: "/projects/no-such-project/", html: true },
];

/** Addresses inside one project, in roughly the order the table tries them. */
const PROJECT_PROBES: Probe[] = [
  { method: "GET", path: "/", html: true },
  { method: "GET", path: "/?desktop=1", html: true },
  { method: "GET", path: "/settings", html: true },
  { method: "GET", path: "/settings/connectors", html: true },
  { method: "GET", path: "/plugins/todo", html: true },
  { method: "GET", path: "/api/plugins/todo/no-such-operation" },
  { method: "GET", path: "/api/project-settings/workspaces" },
  { method: "POST", path: "/api/project-settings/workspaces", body: {} },
  { method: "GET", path: "/api/project-settings/write-checkers" },
  { method: "POST", path: "/api/project-settings/write-checkers", body: {} },
  { method: "GET", path: "/side/todo/no-such-view", html: true },
  { method: "GET", path: "/side/no-such-plugin/x", html: true },
  { method: "GET", path: "/api/side/files/sources" },
  { method: "GET", path: "/api/side/files/raw" },
  { method: "GET", path: "/api/plugin-builder/studio" },
  { method: "GET", path: "/api/plugin-builder/studio/no-such" },
  { method: "GET", path: "/plugin-builder/studio/preview/00000000-0000-4000-8000-000000000000", html: true },
  { method: "GET", path: "/api/plugins/runtime/updates" },
  { method: "GET", path: "/api/plugins/io.molis.work.coding/no-such" },
  { method: "GET", path: "/api/plugins/io.molis.work.no-such-plugin/x" },
  { method: "GET", path: "/api/plugins/io.molis.work.todo/x" },
  { method: "GET", path: "/sessions", html: true },
  { method: "GET", path: "/workspaces", html: true },
  { method: "GET", path: "/api/sessions" },
  { method: "GET", path: "/settings/general", html: true },
  { method: "GET", path: "/settings/planning", html: true },
  { method: "GET", path: "/api/settings/planning-methods" },
  { method: "GET", path: "/health" },
  { method: "GET", path: "/api/runtime-availability" },
  { method: "GET", path: "/desktop/pty-client.js" },
  { method: "GET", path: "/api/board/cursor" },
  { method: "GET", path: "/api/agent/reviews" },
  { method: "POST", path: "/api/agent/reviews/decide", body: {} },
  { method: "GET", path: "/api/board" },
  { method: "GET", path: "/api/search/status" },
  { method: "POST", path: "/api/search/query", body: {} },
  { method: "POST", path: "/api/placement/describe", body: {} },
  { method: "GET", path: "/api/contextual/surfaces" },
  { method: "GET", path: "/api/functions" },
  { method: "GET", path: "/api/functions/settings" },
  { method: "GET", path: "/api/plugins/io.molis.work.lingguang/sparks" },
  { method: "GET", path: "/api/pages" },
  { method: "POST", path: "/api/pages/import/preview", body: {} },
  // Pages' positive path is its Runtime route (W5-01-PAGES-02); the short routes above are only the removed aliases.
  { method: "GET", path: "/api/plugins/io.molis.work.pages/pages" },
  { method: "POST", path: "/api/plugins/io.molis.work.pages/pages/import/preview", body: {} },
  { method: "GET", path: "/api/plugins/io.molis.work.pages/pages/no-such" },
  { method: "GET", path: "/api/dataset" },
  { method: "GET", path: "/api/dataset/no-such" },
  // Dataset's positive path is its Runtime route; the short route above is only the removed alias.
  { method: "GET", path: "/api/plugins/io.molis.work.dataset/datasets" },
  { method: "GET", path: "/api/plugins/io.molis.work.dataset/datasets/no-such" },
  { method: "GET", path: "/api/images" },
  { method: "GET", path: "/api/plugins/io.molis.work.images/jobs" },
  { method: "GET", path: "/api/plugins/io.molis.work.images/connections" },
  { method: "GET", path: "/api/ppt" },
  { method: "GET", path: "/api/plugins/io.molis.work.ppt/ppt" },
  { method: "GET", path: "/api/plugins/io.molis.work.ppt/ppt/no-such" },
  { method: "GET", path: "/api/jelly" },
  { method: "GET", path: "/api/plugins/io.molis.work.jelly/" },
  { method: "GET", path: "/api/plugins/io.molis.work.todo/items" },
  { method: "GET", path: "/api/plugins/io.molis.work.todo/items/no-such" },
  { method: "GET", path: "/api/plugins/io.molis.work.cognia/library" },
  { method: "GET", path: "/api/alchemist" },
  { method: "GET", path: "/api/shelf" },
  // Shelf's positive path is its Runtime route (Shelf S3); the short route above is only the removed alias.
  { method: "GET", path: "/api/plugins/io.molis.work.shelf/" },
  { method: "GET", path: "/api/memory/" },
  { method: "GET", path: "/api/memory/items" },
  { method: "GET", path: "/api/memory/overview" },
  { method: "GET", path: "/api/agent-definitions/prompts" },
  { method: "GET", path: "/api/assistant/" },
  { method: "GET", path: "/api/assistant/works" },
  { method: "GET", path: "/api/attention" },
  { method: "GET", path: "/api/workflows" },
  { method: "GET", path: "/api/plugins/io.molis.work.native.workflows/workflows" },
  { method: "GET", path: "/api/plugins/io.molis.work.native.workflows/workflows/no-such" },
  { method: "GET", path: "/api/plugins/io.molis.work.inbox/entries" },
  { method: "GET", path: "/api/stage/inbox" },
  { method: "GET", path: "/api/home/dock-judgment" },
  { method: "GET", path: "/api/home/actions/choices" },
  { method: "GET", path: "/api/plugins/io.molis.work.schedule/list" },
  { method: "GET", path: "/api/feed" },
  // Feed's positive paths are its Runtime route and the shell's stage (FI-7); the short route above is only the removed edge.
  { method: "GET", path: "/api/plugins/io.molis.work.feed/snapshot" },
  { method: "GET", path: "/api/stage/feed" },
  { method: "GET", path: "/api/capsule" },
  { method: "GET", path: "/api/panels" },
  { method: "GET", path: "/api/panels/no-such-panel" },
  { method: "GET", path: "/api/home/events" },
  { method: "GET", path: "/api/project-references/no-such" },
  { method: "GET", path: "/api/goals" },
  { method: "POST", path: "/api/goals", body: {} },
  { method: "GET", path: "/api/artifacts/versions" },
  { method: "GET", path: "/artifacts", html: true },
  { method: "GET", path: "/archive", html: true },
  { method: "GET", path: "/goals/no-such-goal", html: true },
  { method: "GET", path: "/api/no-such-route" },
  { method: "POST", path: "/api/no-such-route", body: {} },
  { method: "GET", path: "/no-such-page", html: true },
  { method: "GET", path: "/no-such-page" },
  { method: "GET", path: "/assets/no-such.css", html: true },
  { method: "GET", path: "/api/board", bare: true },
];

/** What decides which handler answered, with the parts that change per run (ids, the temporary Home) replaced. */
async function fingerprint(response: Response, scrub: (text: string) => string): Promise<Record<string, unknown>> {
  const type = response.headers.get("content-type") ?? "";
  const location = response.headers.get("location");
  const out: Record<string, unknown> = { status: response.status, type: type.split(";")[0] ?? "" };
  if (location) out.location = scrub(location);
  const text = await response.text();
  if (type.includes("json")) {
    let body: unknown;
    try { body = JSON.parse(text); } catch { out.json = "unparseable"; return out; }
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      if (typeof record.code === "string") out.code = record.code;
      if (typeof record.error === "string") out.error = scrub(record.error);
      else out.keys = Object.keys(record).sort();
    } else out.json = Array.isArray(body) ? "array" : typeof body;
  } else if (type.includes("html")) {
    out.title = scrub(/<title>([^<]*)<\/title>/u.exec(text)?.[1] ?? "");
  } else if (type.includes("text/plain")) {
    out.text = scrub(text).slice(0, 60);
  }
  return out;
}

test("W5-07: every address reaches the same handler, in the same order, and the rest falls through to the same 404s", async t => {
  const home = mkdtempSync(join(tmpdir(), "web-route-table-"));
  const token = "web-route-table-control-token-0123456789";
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "路由表", actor_id: "test" });
  // Inbox is a plugin of the project's Runtime: the pages and routes under test are the project's only when it has it.
  catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "inbox", actor_id: "test" });
  const missing = await catalog.createProject({ display_name: "没有库", actor_id: "test" });
  rmSync(catalog.getProject(missing.project_id).database_path, { force: true });
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const web = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  t.after(async () => {
    await new Promise<void>(resolve => web.close(() => resolve()));
    await host.close();
    catalog.close();
    rmSync(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => web.listen(0, "127.0.0.1", resolve));
  const address = web.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const scrub = (text: string) => text.split(home).join("<home>").split(created.project_id).join("<project>")
    .split(missing.project_id).join("<missing>").split(origin).join("<origin>");
  const ask = async (probe: Probe, prefix: string) => {
    const headers: Record<string, string> = { origin, accept: probe.html ? "text/html" : "application/json" };
    if (!probe.bare) Object.assign(headers, { "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() });
    if (probe.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${origin}${prefix}${probe.path}`, { method: probe.method, headers, redirect: "manual",
      ...(probe.body !== undefined ? { body: JSON.stringify(probe.body) } : {}) });
    const key = `${probe.method} ${prefix ? "<project>" : ""}${probe.path}${probe.html ? " (page)" : ""}${probe.bare ? " (no token)" : ""}`;
    return [key, await fingerprint(response, scrub)] as const;
  };
  const seen: Array<readonly [string, Record<string, unknown>]> = [];
  for (const probe of HOME_PROBES) seen.push(await ask(probe, ""));
  for (const probe of PROJECT_PROBES) seen.push(await ask(probe, `/projects/${encodeURIComponent(created.project_id)}`));
  for (const probe of [{ method: "GET", path: "/api/board" }, { method: "GET", path: "/", html: true }] satisfies Probe[]) {
    const [key, value] = await ask(probe, `/projects/${encodeURIComponent(missing.project_id)}`);
    seen.push([key.replace("<project>", "<missing>"), value]);
  }
  seen.push(await ask({ method: "GET", path: "/projects/personal/health" }, ""));
  seen.push(await ask({ method: "GET", path: "/projects/personal/api/plugins/io.molis.work.todo/items" }, ""));
  const actual = Object.fromEntries(seen);
  assert.equal(Object.keys(actual).length, seen.length, "every probe has its own key");
  if (process.env.MOLIS_WORK_UPDATE_ROUTE_SNAPSHOT === "1") {
    writeFileSync(SNAPSHOT, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(SNAPSHOT, "utf8")));
});
