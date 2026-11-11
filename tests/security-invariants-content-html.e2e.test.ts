import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { ChromeHarness, locateTestChrome } from "@molis-ai/molis-work-test-kit/browser";

test("D0103 shared content boundary refuses executable markup and preserves comparison presentation", { timeout: 60_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "content-html-"));
  let browser: ChromeHarness | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  // node:test stops running later after hooks when an earlier hook fails. Stop writers
  // before removing their profile, and attempt every release even if one rejects.
  t.after(async () => {
    try { await browser?.close(); }
    finally {
      try {
        server?.closeAllConnections();
        if (server?.listening) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      } finally { await rm(directory, { recursive: true, force: true }); }
    }
  });
  const executable = locateTestChrome(); if (!executable) { t.skip("Chrome is unavailable"); return; }
  browser = await ChromeHarness.start(directory, { executable });
  const page = await browser.page();
  let external = 0;
  server = createServer((request, response) => { if (request.url === "/probe") external++; response.end("<!doctype html><div id='content'></div>"); });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  await page.command("Page.navigate", { url: `http://127.0.0.1:${address.port}/` }); await page.wait("document.querySelector('#content')");
  const bundle = await build({ stdin: { contents: 'import {setContentHtml,contentHtml} from "@molis-ai/molis-work-plugin-sdk/browser"; globalThis.contentProbe={setContentHtml,contentHtml};', resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", platform: "browser", minify: true });
  await page.evaluate(bundle.outputFiles[0]!.text);
  const markup = '<section class="mw-diff" data-phase="ready"><h2>Safe heading</h2><dl><dt>Lines</dt><dd>3</dd></dl><pre><code class="language-ts">const safe = true;</code></pre>'
    + '<ol class="mw-diff-rows" style="--diff-digits:5"><li>10005</li></ol><ol class="mw-diff-rows" title="bad-css" style="--diff-digits:5;background:url(/probe)"><li>bad CSS</li></ol>'
    + '<ol title="unbounded" style="--diff-digits:9999999999"><li>unbounded</li></ol><div title="wrong-tag" style="--diff-digits:5">wrong tag</div>'
    + '<svg viewBox="0 0 24 24"><use href="#icon-check"></use><path d="M0 0" fill="url(/probe)" onload="globalThis.pwned=1"></path></svg>'
    + '<li data-diff-folded="1" hidden>hidden context</li><button data-diff-unfold="1">Reveal</button><button data-action="diff.show-file" data-change-index="1">File</button>'
    + '<script>globalThis.pwned=1</script><img src="/probe" onerror="globalThis.pwned=1"><iframe srcdoc="bad"></iframe><style>body{display:none}</style>'
    + '<a href="javascript:globalThis.pwned=1">bad link</a><a href="https://example.com">safe link</a><button onclick="globalThis.pwned=1" formaction="/probe" data-action="delete-all">bad button</button></section>';
  const result = await page.evaluate<{ bad: boolean; headings: string; controls: number; safeLink: string; pwned: boolean; digits: string; unsafeStyles: number }>(`(() => {
    const target=document.querySelector('#content');contentProbe.setContentHtml(target,${JSON.stringify(markup)});
    const streamed=contentProbe.contentHtml(target.innerHTML);contentProbe.setContentHtml(target,streamed);
    target.querySelector('button:last-child').click();
    return {bad:!!target.querySelector('script,img,iframe,style,[onload],[onclick],[onerror],[formaction],[data-action="delete-all"],[fill^="url"],[href^="javascript"]'),headings:target.querySelector('h2').textContent,
      controls:target.querySelectorAll('[data-diff-unfold],button[data-action="diff.show-file"],li[hidden]').length,
      safeLink:target.querySelector('a[href]').getAttribute('rel'),pwned:globalThis.pwned===1,
      digits:target.querySelector('ol').style.getPropertyValue('--diff-digits'),unsafeStyles:target.querySelectorAll('[title="bad-css"][style],[title="unbounded"][style],[title="wrong-tag"][style]').length};})()`);
  assert.deepEqual(result, { bad: false, headings: "Safe heading", controls: 3, safeLink: "noopener noreferrer", pwned: false, digits: "5", unsafeStyles: 0 });
  assert.equal(external, 0, "inert parsing does not request rejected media");
});
