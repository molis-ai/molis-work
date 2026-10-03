import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// Settings are part of the workbench (specs/artifact-positioning S6). A settings address a person opens directly (the
// address bar, a bookmark, a reload: a page navigation) opens a project's workbench with that page in its settings;
// the workbench and its scripts read the same addresses with fetch and still get the page itself.
const NAVIGATION = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };

async function server(t: test.TestContext, projectCount: number) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-settings-direct-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  const projects = [];
  for (let index = 0; index < projectCount; index++) projects.push(await catalog.createProject({ display_name: `设置直达 ${index + 1}`, actor_id: "fixture-user" }));
  catalog.close();
  const web = createMolisWorkWebServer({ homeDirectory: directory, controlToken: "settings-direct-test-control-token-0123456789" });
  await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => web.close((error) => error ? reject(error) : resolve())));
  const address = web.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  // node:http, because fetch will not send the Sec-Fetch-* headers a browser sets on a page navigation.
  const open = (path: string, headers: Record<string, string> = NAVIGATION) => new Promise<Answer>((resolve, reject) => {
    request(origin + path, { headers }, (response) => {
      let text = ""; response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, location: response.headers.location ?? null, text }));
    }).on("error", reject).end();
  });
  return { projects, open };
}

interface Answer { status: number; location: string | null; text: string }

const landing = (answer: Answer) => {
  assert.equal(answer.status, 302);
  const url = new URL(answer.location!, "http://x");
  return { pathname: url.pathname, settingsPath: url.searchParams.get("settingsPath"), desktop: url.searchParams.get("desktop") };
};

test("a project's settings page opened directly opens its workbench on that page; fetches still get the page", async t => {
  const { projects: [project], open } = await server(t, 1);
  const prefix = `/projects/${project!.project_id}`;
  assert.deepEqual(landing(await open(`${prefix}/settings/rules`)), { pathname: `${prefix}/`, settingsPath: `${prefix}/settings/rules`, desktop: null });
  assert.deepEqual(landing(await open(`${prefix}/settings/planning/new?desktop=1`)), { pathname: `${prefix}/`, settingsPath: `${prefix}/settings/planning/new`, desktop: "1" });
  const fetched = await open(`${prefix}/settings/rules`, {});
  assert.equal(fetched.status, 200);
  assert.match(fetched.text, /data-project-rules-form/);
  const embedded = await open(`${prefix}/settings/rules?embed=1`);
  assert.equal(embedded.status, 200, "the workbench's own fragment request is never sent away");
});

test("a global settings page opened directly opens the named project's workbench, or else one there is", async t => {
  const { projects: [first, second], open } = await server(t, 2);
  assert.deepEqual(landing(await open(`/settings/appearance?project=${second!.project_id}&desktop=1`)),
    { pathname: `/projects/${second!.project_id}/`, settingsPath: "/settings/appearance", desktop: "1" });
  const unnamed = landing(await open("/settings/runtimes"));
  assert.equal(unnamed.settingsPath, "/settings/runtimes", "a global page stays global inside the project's workbench");
  assert.ok([first, second].some((project) => unnamed.pathname === `/projects/${project!.project_id}/`));
  const fetched = await open("/settings/appearance", {});
  assert.equal(fetched.status, 200);
  // 能力 is part of settings too (S6b); its `project` is the scope the page shows, so it stays in the page's address.
  assert.deepEqual(landing(await open(`/capabilities/library?project=${first!.project_id}&q=functions`)),
    { pathname: `/projects/${first!.project_id}/`, settingsPath: `/capabilities/library?project=${first!.project_id}&q=functions`, desktop: null });
  // MCP, connectors and Functions moved to 能力 and still go there.
  const moved = await open("/settings/mcp");
  assert.equal(moved.status, 302);
  assert.equal(moved.location, "/capabilities/access");
});

test("with no project yet, a global settings page is shown as it is", async t => {
  const { open } = await server(t, 0);
  const page = await open("/settings/appearance");
  assert.equal(page.status, 200);
  assert.match(page.text, /<body class="settings-page/);
});
