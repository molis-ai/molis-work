import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { renderImPage, IM_STYLES, IM_CLIENT_SCRIPT } from "@molis-ai/molis-work-im-ui";
import { inviteFixture } from "./fixtures/im-invites.js";

test("RAC-102: real invitation UI generates explicitly, keeps retries in memory, rejects stale replay and explains reload", { timeout: 120_000 }, async t => {
  const executable = process.env.MOLIS_WORK_TEST_CHROME ?? join(homedir(), ".local/bin/molis-test-browser");
  if (!existsSync(executable)) { t.skip("Dedicated test Chrome is required"); return; }
  assert.ok(!executable.startsWith("/Applications/Google Chrome.app/"), "Use a dedicated test browser");
  const f = await inviteFixture(t, { imAssets: { html: renderImPage(), css: IM_STYLES, script: IM_CLIENT_SCRIPT } });
  const browser = await ChromeHarness.start(f.home, { executable, commandTimeoutMs: 15_000, describe: "document.body.innerText.slice(0,1400)" });
  let closed = false;
  const close = async () => { if (!closed) { closed = true; await browser.close(); } };
  t.after(close);
  try {
    const page = await browser.page(); await browser.command("Target.activateTarget", { targetId: page.targetId });
    await page.command("Page.enable"); await page.command("Runtime.enable"); await page.viewport(1440, 900);
    await browser.command("Browser.grantPermissions", { origin: f.origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
    await Promise.all([browser.event("Page.loadEventFired"), page.command("Page.navigate", { url: f.origin + "/im" })]);
    await page.wait("document.querySelector('[data-name-form] input')?.checkVisibility()");
    await page.fill("[data-name-form] input", "Invitation owner"); await page.click("[data-name-form] button[type=submit]");
    await page.wait("document.querySelector('[data-welcome-body] [data-action=create-room]')?.checkVisibility()");
    await page.click("[data-welcome-body] [data-action=create-room]"); await page.fill("[data-dialog] input[name=title]", "Invite recovery");
    await page.click("[data-dialog] button[type=submit]");
    await page.wait("document.querySelector('[data-conversations]')?.hidden === false && !document.querySelector('[data-dialog]').open");
    const room = (f.storage.db.prepare("SELECT id FROM im_rooms").get() as { id: string }).id;
    const count = () => (f.storage.db.prepare("SELECT COUNT(*) AS n FROM mw_events WHERE kind='invite'").get() as { n: number }).n;
    const storedHash = () => (f.storage.db.prepare("SELECT invite_token_hash FROM im_rooms").get() as { invite_token_hash: string | null }).invite_token_hash;
    await page.click("[data-action=invite]");
    await page.wait("document.querySelector('[data-action=rotate-invite]')?.textContent === '生成邀请链接'");
    assert.equal(count(), 0); assert.equal(storedHash(), null);
    await page.click("[data-action=rotate-invite]"); await page.wait("document.querySelector('[data-invite-value]')");
    const firstUrl = await page.evaluate<string>("document.querySelector('[data-invite-value]').value"), firstToken = new URL(firstUrl).searchParams.get("invite")!;
    assert.match(firstToken, /^[0-9a-f]{64}$/); assert.equal(count(), 1);
    await page.click("[data-action=copy-invite]"); await page.wait("document.querySelector('[data-action=copy-invite]')?.dataset.copy === 'done'");
    assert.equal(await page.evaluate("navigator.clipboard.readText()"), firstUrl);
    assert.equal(await page.evaluate<boolean>(`JSON.stringify(localStorage).includes(${JSON.stringify(firstToken)})`), false);
    await Promise.all([browser.event("Page.loadEventFired"), page.command("Page.reload")]);
    await page.wait("document.querySelector('[data-action=invite]')?.checkVisibility() && !document.querySelector('[data-conversations]').hidden");
    await page.click("[data-action=invite]");
    await page.wait("document.querySelector('[data-invite-notice]')?.textContent.includes('无法重新取回')");
    assert.equal(await page.evaluate("!!document.querySelector('[data-invite-value]')"), false); assert.equal(count(), 1);
    const bob = await f.person("External reader"); assert.equal((await f.post(bob.cookie, "/join", { token: firstToken })).status, 200);
    await page.evaluate(`window.__inviteCalls=[];window.__dropNextInvite=true;const nativeFetch=window.fetch.bind(window);
      window.fetch=async(input,init)=>{if(String(input).endsWith('/invite/rotate')){window.__inviteCalls.push(JSON.parse(init.body));const response=await nativeFetch(input,init);
        if(window.__dropNextInvite){window.__dropNextInvite=false;await response.arrayBuffer();throw new TypeError('response lost after commit');}return response;}return nativeFetch(input,init);};`);
    await page.click("[data-action=rotate-invite]");
    await page.wait("document.querySelector('[data-action=rotate-invite]')?.textContent === '重试原操作'");
    assert.equal(count(), 2);
    await page.click("[data-action=rotate-invite]"); await page.wait("document.querySelector('[data-invite-value]')");
    const requests = await page.evaluate<Array<{ client_id: string; token: string }>>("window.__inviteCalls");
    assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]); assert.equal(count(), 2);
    assert.equal(new URL(await page.evaluate<string>("document.querySelector('[data-invite-value]').value")).searchParams.get("invite"), requests[0]!.token);
    assert.equal((await f.post(bob.cookie, "/join", { token: firstToken })).status, 404);
    // A second unknown outcome is superseded by a separate explicit operation before its retry.
    await page.evaluate("window.__dropNextInvite=true"); await page.click("[data-action=rotate-invite]");
    await page.wait("document.querySelector('[data-action=rotate-invite]')?.textContent === '重试原操作'");
    const newerHash = await page.evaluate<string>(`(async()=>{const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
      const answer=await fetch('/im/api/rooms/${room}/invite/rotate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:crypto.randomUUID(),token})});return (await answer.json()).token_hash;})()`);
    assert.equal(count(), 4); await page.click("[data-action=rotate-invite]");
    await page.wait("document.querySelector('[data-invite-error]')?.textContent.includes('不会重新激活旧链接')");
    assert.equal(await page.evaluate("!!document.querySelector('[data-invite-value]')"), false);
    assert.equal(storedHash(), newerHash); assert.equal(count(), 4);
    const all = await page.evaluate<Array<{ client_id: string; token: string }>>("window.__inviteCalls");
    assert.deepEqual(all[2], all[4]);
    assert.equal(await page.evaluate<boolean>(`JSON.stringify(localStorage).includes(${JSON.stringify(all[2]!.token)})`), false);
    await page.click("[data-action=rotate-invite]"); await page.wait("document.querySelector('[data-invite-value]')");
    const currentToken = new URL(await page.evaluate<string>("document.querySelector('[data-invite-value]').value")).searchParams.get("invite")!;
    assert.equal(storedHash(), createHash("sha256").update(currentToken).digest("hex"));
    const shots = join(process.cwd(), ".impeccable/qa/review/w5-16-im-invites"); mkdirSync(shots, { recursive: true });
    for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
      await page.viewport(width, 900); await page.evaluate(`document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
      assert.equal(await page.evaluate<boolean>("(()=>{const d=document.querySelector('[data-dialog]'),r=d.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&d.scrollWidth<=d.clientWidth+1;})()"), true);
      await page.screenshot(join(shots, `${theme}-${width}.png`));
    }
  } finally { await close(); }
});
