import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// Plugins on the project page link to global pages (model settings, Connectors, the capability service). Every link
// the page carries has to open something: a global page kept its own address, not one under the project.
test("every same-origin link on a project page opens, including Plugins' links to global settings", { timeout: 120_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-project-links-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  const project = await catalog.createProject({ display_name: "Links", actor_id: "fixture-user" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "feed", actor_id: "fixture-user" });
  catalog.close();
  const server = createMolisWorkWebServer({ homeDirectory: directory, controlToken: "project-links-test-control-token-0123456789" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const prefix = `/projects/${project.project_id}`;

  const page = await (await fetch(origin + prefix + "/")).text();
  const links = [...new Set([...page.matchAll(/href="(\/(?!\/)[^"#]*)/g)].map(match => match[1]!.replaceAll("&amp;", "&")))];
  assert.ok(links.length > 10, "the page carries its links");
  for (const global of ["/settings/models", "/settings/connectors"]) {
    assert.ok(links.some(link => link.startsWith(global)), `a Plugin links to ${global}`);
    assert.ok(!links.some(link => link.startsWith(prefix + global)), `${global} is not rewritten under the project`);
  }
  const broken: string[] = [];
  for (const link of links) {
    const response = await fetch(origin + link, { redirect: "manual" });
    await response.arrayBuffer();
    if (response.status >= 400) broken.push(`${response.status} ${link}`);
  }
  assert.deepEqual(broken, []);
});
