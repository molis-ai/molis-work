import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALCHEMIST_CLIENT_FACTORY_SCRIPT, ALCHEMIST_EN, ALCHEMIST_STYLES, renderAlchemistWorkbench } from "@molis-ai/molis-work-plugin-alchemist";
import { renderAgentStudio } from "@molis-ai/molis-work-plugin-builder";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// W2-18 decisions 7 and 14: the interface says where the product goes online in the places where that happens, and the
// docs page that lists every outbound class is linked from Settings.

const CONTROL = "network-notices-token-012345678901";

test("the plugin studio says that a build check sends dependency names and versions to the npm registry", () => {
  const html = renderAgentStudio();
  assert.match(html, /registry\.npmjs\.org/u);
  assert.match(html, /包名和版本/u);
  assert.match(html, /不发送你的内容/u);
});

test("the market pulse list says that collecting contacts Toolify, 观猹 and GitHub, with the English text beside it", () => {
  const html = renderAlchemistWorkbench({ primitives: { escape: value => String(value ?? ""), text: value => value } });
  const note = /<p class="alc-muted alc-list-note" data-alc-pulse-note hidden>([^<]*采集会联网访问 Toolify、观猹和 GitHub[^<]*)<\/p>/u.exec(html)?.[1];
  assert.ok(note, "the workbench carries the sentence, hidden until the market pulse collection is open");
  assert.match(note, /「设置 › 服务连接」/u, "and where the GitHub account comes from");
  assert.match(ALCHEMIST_EN[note] ?? "", /Toolify, Watcha .*GitHub/u);
  assert.match(ALCHEMIST_EN[note] ?? "", /anonymously/u);
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /\$\('\[data-alc-pulse-note\]'\)\.hidden=collection!=='pulse'/u, "shown only on the market pulse collection");
});

test("the market pulse note stays outside the rows, so an empty collection is still the only child that the list page centres", () => {
  const html = renderAlchemistWorkbench({ primitives: { escape: value => String(value ?? ""), text: value => value } });
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
  const zh = link(await (await fetch(`${origin}/settings/connectors`)).text());
  assert.equal(zh?.[1], "https://github.com/molis-ai/molis-work/blob/main/docs/platform/NETWORK.md");
  assert.equal(zh?.[2], "Molis Work 会联网去哪里");
  const en = link(await (await fetch(`${origin}/settings/connectors`, { headers: { "accept-language": "en-US" } })).text());
  assert.equal(en?.[1], "https://github.com/molis-ai/molis-work/blob/main/docs/platform/NETWORK.en.md");
  assert.equal(en?.[2], "Where Molis Work connects to");
});
