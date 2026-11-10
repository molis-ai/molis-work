import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_STYLES, alchemistActions, renderAlchemistWorkbench } from "@molis-ai/molis-work-plugin-alchemist";
import { builderUiContribution, renderAgentStudio, renderStudioStage } from "@molis-ai/molis-work-plugin-builder";
import { withPageText } from "./fixtures/page-text.js";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

// W2-18 decisions 7 and 14: the interface says where the product goes online in the places where that happens, and the
// docs page that lists every outbound class is linked from Settings.

const CONTROL = "network-notices-token-012345678901";

const studioText = <T>(locale: "zh" | "en", draw: () => T) => withPageText(locale, ["plugin-builder"], draw);
const alchemist = (locale: "zh" | "en") => withPageText(locale, ["alchemist"], () =>
  renderAlchemistWorkbench({ primitives: { escape: value => String(value ?? ""), text: value => value } }));

test("the plugin studio discloses the npm registry connection in both languages", () => {
  const zh = studioText("zh", () => renderAgentStudio());
  assert.match(zh, /registry\.npmjs\.org/u);
  assert.match(zh, /包名和版本/u);
  assert.match(zh, /不发送你的内容/u);
  assert.match(studioText("en", () => renderStudioStage()),
    /data-as-network-note>The build check’s packaging step.*names and versions.*npm registry \(registry\.npmjs\.org\).*None of your content is sent/u);
});

test("the studio contribution uses its active language for the npm sentence", () => {
  const request = (surface: "workbench" | "directory") =>
    builderUiContribution.render({ contribution_id: builderUiContribution.descriptor.contribution_id, surface, model: null });
  assert.match(studioText("en", () => request("workbench")), /data-as-network-note>The build check’s packaging step.*registry\.npmjs\.org/u);
  assert.match(studioText("zh", () => request("workbench")), /data-as-network-note>构建检查的「打包」一步/u);
  assert.equal(studioText("en", () => request("directory")), "", "the directory surface stays empty");
});

test("the market pulse list says which sites it contacts and which GitHub account it uses in both languages", () => {
  const pulseNote = (html: string) => /<p class="alc-muted alc-list-note" data-alc-pulse-note hidden>([^<]*)<\/p>/u.exec(html)?.[1] ?? "";
  const zh = pulseNote(alchemist("zh"));
  assert.match(zh, /采集会联网访问 Toolify、观猹和 GitHub/u);
  assert.match(zh, /GitHub 只用你在「来源设置」里选的账号，没选就匿名访问/u);
  const en = pulseNote(alchemist("en"));
  assert.match(en, /Toolify, Watcha .*GitHub/u);
  assert.match(en, /GitHub uses only the account you pick in Source settings.*anonymously/u);
  // NETWORK-PULSE-01: visible-only-on-pulse behavior runs through the actual Chrome client in alchemist-client-boundaries.e2e.
});

test("the GitHub account picker comes with the page in both languages; its accounts and choice go through the actions", () => {
  const template = (html: string) => /<template data-alc-github>([\s\S]*?)<\/template>/u.exec(html)?.[1] ?? "";
  const zh = template(alchemist("zh")), en = template(alchemist("en"));
  assert.match(zh, /<select class="mw-select" name="githubAccount"><option value="">匿名访问<\/option><\/select>/u);
  assert.match(en, /<select class="mw-select" name="githubAccount"><option value="">Anonymous<\/option><\/select>/u);
  assert.match(zh, /所有项目共用.*令牌留在宿主里/u);
  assert.match(en, /Every project shares this choice.*token stays in the host.*anonymously/u);
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /api\('\/pulse\/github'\)/u, "the accounts are read through the action");
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /api\('\/pulse\/github',\{connectionId:account\},'PUT'\)/u, "and the choice is saved through the action, null meaning anonymous");
});

test("the market pulse note stays outside the rows, so an empty collection is still the only child that the list page centres", () => {
  const html = alchemist("zh");
  assert.match(html, /data-alc-pulse-note hidden>[^<]*<\/p>\s*<div data-alc-rows>/u, "the note precedes the rows container instead of sitting inside it");
  assert.doesNotMatch(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /el\.innerHTML=[^;]*alc-muted/u, "nothing is written before the groups or the empty state in the rows");
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /el\.innerHTML=html\|\|\(q\?empty\(/u, "the rows hold the groups, or one empty state");
  assert.match(ALCHEMIST_STYLES, /\[data-alc-rows\] > \.alc-empty:only-child \{ max-width:32em; margin:0 auto; padding:12vh 24px 64px; text-align:center;/u, "the centring rule of the list page");
});

test("Settings links the docs page that lists every outbound class, in the interface language", { timeout: 30_000 }, async t => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "network-notices-"));
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: CONTROL });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(homeDirectory, { recursive: true, force: true }); });
  const link = (html: string) => /<a href="([^"]+)"[^>]*>([^<]*)<\/a>/u.exec(/data-network-doc[^>]*>([\s\S]*?)<\/p>/u.exec(html)?.[1] ?? "");
  const zhPage = await (await fetch(`${origin}/settings/connectors`)).text();
  // The link sits in the page heading, before the catalog, and the page has no footnote at its foot (the settings convention).
  const heading = /<header class="settings-heading">([\s\S]*?)<\/header>/u.exec(zhPage)?.[1] ?? "";
  assert.match(heading, /<h1 id="settings-title">服务连接<\/h1>/u);
  assert.match(heading, /data-network-doc/u, "the link is in the heading block, where it is seen");
  assert.ok(zhPage.indexOf("data-network-doc") < zhPage.indexOf("data-connectors-list"), "and above the list of connections and the catalog");
  assert.doesNotMatch(zhPage, /class="settings-footnote"/u);
  const zh = link(zhPage);
  assert.equal(zh?.[1], "https://github.com/molis-ai/molis-work/blob/main/docs/platform/NETWORK.md");
  assert.equal(zh?.[2], "Molis Work 会联网去哪里");
  const en = link(await (await fetch(`${origin}/settings/connectors`, { headers: { "accept-language": "en-US" } })).text());
  assert.equal(en?.[1], "https://github.com/molis-ai/molis-work/blob/main/docs/platform/NETWORK.en.md");
  assert.equal(en?.[2], "Where Molis Work connects to");
});

test("the network page's class 7 says that the assistant, MCP clients and workflows can start a pulse too, and that only the person picks the GitHub account", () => {
  // The pulse carries the picked GitHub account's token, so the page that lists every trigger has to name every caller that can start one.
  const pulse = alchemistActions.pulseStart.action.audiences;
  for (const audience of ["user", "agent", "mcp", "workflow"] as const) assert.ok(pulse.includes(audience), `alchemist.pulse.start is offered to ${audience}`);
  assert.deepEqual(alchemistActions.pulseGithubSelect.action.audiences, ["user"], "choosing the account is the person's alone");
  const section = (file: string, heading: RegExp) => heading.exec(readFileSync(new URL(`../docs/platform/${file}`, import.meta.url), "utf8"))?.[1] ?? "";
  const zh = section("NETWORK.md", /### 7\. [^\n]*\n([\s\S]*?)\n### 8\./u);
  const en = section("NETWORK.en.md", /### 7\. [^\n]*\n([\s\S]*?)\n### 8\./u);
  assert.match(zh, /alchemist\.pulse\.start/u);
  assert.match(zh, /助理、MCP 客户端、工作流/u, "the Chinese page names the assistant, MCP clients and workflows as callers");
  assert.match(zh, /限制的只是“选哪个账号”，不限制谁能启动采集/u);
  assert.match(zh, /整个 Home 共用[\s\S]*所有项目共用/u, "the choice is the Home's: the dialog's wording is on the page");
  assert.match(en, /alchemist\.pulse\.start/u);
  assert.match(en, /the assistant, an MCP client or a workflow starts the same action/u, "the English page names the assistant, MCP clients and workflows as callers");
  assert.match(en, /limit is on picking the account, not on starting a pulse/u);
  assert.match(en, /shared by the whole Home[\s\S]*Every project shares this choice/u, "the choice is the Home's: the dialog's wording is on the page");
});
