import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builderUiContribution, renderAgentStudio, renderStudioStage } from "@molis-ai/molis-work-plugin-studio";
import { withPageText } from "./fixtures/page-text.js";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

// W2-18 decisions 7 and 14: the interface says where the product goes online in the places where that happens, and the
// docs page that lists every outbound class is linked from Settings.

const CONTROL = "network-notices-token-012345678901";

const studioText = <T>(locale: "zh" | "en", draw: () => T) => withPageText(locale, ["plugin-builder"], draw);
test("the plugin studio discloses the npm registry connection in both languages", () => {
  const zh = studioText("zh", () => renderAgentStudio());
  assert.match(zh, /registry\.npmjs\.org/u);
  assert.match(zh, /公开组件包/u);
  assert.match(zh, /不会上传你的任何内容/u);
  assert.match(studioText("en", () => renderStudioStage()),
    /data-as-network-note>Packaging check.*names and versions.*registry\.npmjs\.org.*none of your content is sent/u);
});

test("the studio contribution uses its active language for the npm sentence", () => {
  const request = (surface: "workbench" | "directory") =>
    builderUiContribution.render({ contribution_id: builderUiContribution.descriptor.contribution_id, surface, model: null });
  assert.match(studioText("en", () => request("workbench")), /data-as-network-note>Packaging check.*registry\.npmjs\.org/u);
  assert.match(studioText("zh", () => request("workbench")), /data-as-network-note>打包检查说明/u);
  assert.equal(studioText("en", () => request("directory")), "", "the directory surface stays empty");
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
