import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalProjectDatabase, createLocalFeedSourceService, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-workbench";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// Every plugin is content in the one workbench (specs/artifact-positioning §4, S7). Following every local link a seeded
// workbench offers, as a person opening it in the address bar would, each address is the workbench itself, leads into it,
// is not a page at all (data, a file), or is on the exception list below. Nothing else may be a whole page of its own.
const EXCEPTIONS: readonly (readonly [RegExp, string])[] = [
  [/^\/$/, "进入页：项目选择"],
  [/^\/onboarding(?:[/?]|$)/, "进入页：Onboarding"],
  [/^\/desktop\/capsule(?:[/?]|$)/, "桌面菜单栏胶囊"],
  [/^\/__ui\/catalog(?:[/?]|$)/, "开发规格板"],
  [/^\/projects\/[^/]+\/side\//, "宿主排版的侧栏文档"],
  [/^\/(?:continuity|im)(?:[/?]|$)/, "协作服务"],
  [/[?&]frame=workbench(?:&|$)/, "沙箱框里的文档"],
];
const NAVIGATION = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", accept: "text/html" };

interface Answer { status: number; location: string | null; type: string; body: string }
/** A page navigation as a browser makes it. node:http, because fetch will not send the Sec-Fetch-* headers. */
const open = (origin: string, address: string) => new Promise<Answer>((resolve, reject) => {
  request(origin + address, { headers: NAVIGATION }, (response) => {
    let body = ""; response.setEncoding("utf8");
    response.on("data", (chunk) => { body += chunk; });
    response.on("end", () => resolve({ status: response.statusCode ?? 0, location: response.headers.location ?? null, type: String(response.headers["content-type"] ?? ""), body }));
  }).on("error", reject).end();
});
const LIMIT = 600;

async function seededHome(t: test.TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-page-gate-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: directory });
  const project = await catalog.createProject({ display_name: "整页门禁", actor_id: "page-gate" });
  for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "page-gate" });
  catalog.close();
  for (const suffix of ["", "-wal", "-shm"]) await rm(project.database_path + suffix, { force: true });
  seedDemoBoard(project.database_path, project.project_id);
  const store = new LocalProjectDatabase(project.database_path);
  // Feed has no sources until one is added; two give its source pages and their links something to show.
  const sources = createLocalFeedSourceService(store.db, project.project_id);
  sources.register({ kind: "web_query", query: "整页门禁" });
  sources.register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "page-gate" });
  store.close();
  const server = createMolisWorkWebServer({ homeDirectory: directory, controlToken: "page-gate-test-control-token-0123456789" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { origin: `http://127.0.0.1:${address.port}`, prefix: `/projects/${project.project_id}` };
}

const isWorkbench = (html: string) => /<body[^>]*class="[^"]*\bimmersive-workbench\b/.test(html);
const exceptionOf = (address: string) => EXCEPTIONS.find(([pattern]) => pattern.test(address))?.[1];

/** The local addresses a page links to: href attributes and GET forms, without fragments and data or file endpoints. */
function localLinks(html: string, base: string, origin: string): string[] {
  const found = new Set<string>();
  const add = (raw: string) => {
    if (!raw || raw.startsWith("#") || raw.startsWith("__") || /^(?:javascript|data|blob|mailto):/i.test(raw) || raw.includes("${") || raw.includes("' +")) return;
    let url: URL;
    try { url = new URL(raw.replaceAll("&amp;", "&"), origin + base); } catch { return; }
    if (url.origin !== origin) return;
    if (/^\/(?:api|assets)\//.test(url.pathname) || /\/api\//.test(url.pathname) || /\.(?:js|css|json|png|svg|woff2?|ico|pdf|zip)$/i.test(url.pathname)) return;
    url.hash = "";
    found.add(url.pathname + url.search);
  };
  for (const match of html.matchAll(/\shref="([^"]*)"/g)) add(match[1]!);
  for (const match of html.matchAll(/<form\b[^>]*\saction="([^"]*)"[^>]*>/g)) if (!/\smethod="post"/i.test(match[0])) add(match[1]!);
  return [...found];
}

test("every local address a seeded workbench links to is the workbench, leads into it, or is on the exception list", { timeout: 300_000 }, async t => {
  const { origin, prefix } = await seededHome(t);
  const queue = ["/", `${prefix}/`], seen = new Set(queue), violations: string[] = [];
  const visit = async (address: string) => {
    let response = await open(origin, address);
    let landed = address;
    for (let hops = 0; response.status >= 300 && response.status < 400 && hops < 5; hops++) {
      const next = new URL(response.location!, origin + landed);
      landed = next.pathname + next.search;
      response = await open(origin, landed);
    }
    const { type, body } = response;
    if (!/text\/html/.test(type)) return [];
    const page = /<!doctype html>/i.test(body.slice(0, 2000)) || /<html[\s>]/i.test(body.slice(0, 2000));
    if (!page) return [];
    if (isWorkbench(body) || exceptionOf(landed)) return localLinks(body, landed, origin);
    violations.push(`${address}${landed === address ? "" : ` → ${landed}`} (${response.status}) is a page of its own`);
    return [];
  };
  while (queue.length && seen.size <= LIMIT) {
    const address = queue.shift()!;
    for (const next of await visit(address)) if (!seen.has(next) && seen.size < LIMIT) { seen.add(next); queue.push(next); }
  }
  t.diagnostic(`followed ${seen.size} local addresses`);
  // The number only guards that the crawl really walked the workbench. It was 41 until the Goal-era /decisions page, which one
  // link in the relation editor opened, was removed (specs/repository-anti-corruption, W2-02): that link is `/` now. It was 40
  // until the Experiments plugin was deleted (2026-10-10): its page linked to `/settings/connectors?connector=typesafe`, one address
  // fewer to follow.
  assert.ok(seen.size >= 39, `the crawl reached only ${seen.size} addresses`);
  assert.deepEqual(violations, []);
});

test("the workbench is one page: plugin content brings no page shell of its own", async t => {
  const { origin, prefix } = await seededHome(t);
  const html = (await open(origin, prefix + "/")).body;
  assert.ok(isWorkbench(html));
  // Plugin surfaces are fragments in the one document: one doctype, one html, one body; no chrome of a separate page.
  assert.equal(html.match(/<!doctype html>/gi)?.length, 1);
  assert.equal(html.match(/<html[\s>]/gi)?.length, 1);
  assert.equal(html.match(/<body[\s>]/gi)?.length, 1);
  assert.doesNotMatch(html, /class="[^"]*\b(?:project-preferences-chrome|settings-nav-back|artifact-shell|plugin-page-workspace)\b/);
  // A local link opens in the workbench, never in a new browser tab.
  const leaving = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0])
    .filter(tag => /\starget="_blank"/.test(tag) && /\shref="\/(?!\/)/.test(tag) && !/\sdownload[\s>=]/.test(tag));
  assert.deepEqual(leaving, []);
});

// Every source file that produces a whole page, and which exception it serves. A new one is a new standalone page: it
// needs a place on the exception list (specs/artifact-positioning §4) before it can be added here.
const PAGE_PRODUCERS: Record<string, string> = {
  "apps/workbench/src/document-shell.ts": "the workbench document itself",
  "apps/workbench/src/goals-page-renderer.ts": "the workbench",
  "apps/workbench/src/side-view-document.ts": "宿主排版的侧栏文档",
  "apps/local-host/src/web-request.ts": "宿主排版的侧栏文档：插件不在时侧栏框里的一句说明",
  "apps/workbench/src/arrival/shell.ts": "进入页",
  "apps/workbench/src/arrival/chooser.ts": "进入页：项目选择",
  "apps/workbench/src/onboarding-renderer.ts": "进入页：Onboarding",
  "apps/workbench/src/context-onboarding-renderer.ts": "进入页：Onboarding",
  "apps/workbench/src/settings-renderer.ts": "进入页：还没有项目时的设置；有项目时工作台用 fetch 读它的内容",
  "apps/workbench/src/project-settings-pages.ts": "工作台用 fetch 读它的内容；页面导航一律进工作台",
  "apps/desktop/src/capsule-shell.ts": "桌面菜单栏胶囊",
  "apps/workbench/src/primitive-catalog.ts": "开发规格板",
  "apps/local-host/src/plugin-builder/agent-surface.ts": "沙箱框里的文档：试用与已安装的生成插件",
  "packages/im-ui/src/page.ts": "协作服务",
  "plugins/native/form/src/fillpage.ts": "导出：问卷填写页文件",
  "plugins/native/jelly/src/markdown.ts": "导出：Jelly 的 HTML 文件",
  "plugins/native/pages/src/client.ts": "导出：Pages 的 HTML 文件",
  "plugins/native/ppt/src/client.ts": "打印：PPT 打印框",
};

test("only the listed source files produce a whole page", () => {
  const files = execFileSync("git", ["ls-files", "apps", "packages", "plugins", "horizontal", "modules", "server"], { encoding: "utf8" })
    .split("\n").filter(file => /\.(?:ts|mts)$/.test(file) && !/\/tests?\//.test(file));
  const producers = files.filter(file => /<!doctype html>|renderWorkbenchDocument\(|\bshell\.document\(|\bdocument: \(request: WorkbenchDocumentRenderRequest\)/i.test(readFileSync(file, "utf8")));
  assert.deepEqual(producers.filter(file => !(file in PAGE_PRODUCERS)), [], "a new page producer needs an exception");
  assert.deepEqual(Object.keys(PAGE_PRODUCERS).filter(file => !producers.includes(file)), [], "a producer that is gone leaves the list");
});
