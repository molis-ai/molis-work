import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { reviewEvidenceUrl, shouldSaveReviewScreenshots } from "./review-evidence.js";
import type { openGoalBrowser } from "./goal-browser.js";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import type { LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { operate, operationsOf, person } from "./home-sandbox.js";
import { readsAndWrites } from "./signed-package-host.js";
import { HomeConsentLedger, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { newPublisher, signedPackage } from "./sandbox-package.js";

// What the two halves of S-package-install-sheet share (tests/security-invariants-package-install-sheet.test.ts for the Host's route,
// its .e2e twin for the shell's sheet): one signed package asking for a site and a key, and a publisher the person has pinned.

export const SHEET_PLUGIN_ID = "com.example.sheet";
export const SHEET_KEY_VALUE = "fixture-key-value-for-install-sheet";

/** The notes package asking for a site and a key, which the Host projects as two optional switches (`network:request`, `secret:use`). */
export const sheetPackage = (publisher = newPublisher(), version = "1.0.0", more: (contract: SandboxPluginContract) => void = () => undefined): PluginPackageBundle =>
  signedPackage(publisher, (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.find(operation => operation.id === "notes.list")!.effects = { storage: ["read"], networkDomains: ["api.example.test"], secretRefs: ["calendar-key"] };
    more(contract);
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    if (version !== "1.0.0") manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
  }, { pluginId: SHEET_PLUGIN_ID, version });

/** The person's pin of a publisher, as importing its first package in the settings leaves it. */
export const pinSheetPublisher = (home: string, publisher: ReturnType<typeof newPublisher>, label = "Sheet publisher") =>
  new HomeConsentLedger(home).pinPublisher({ key_id: publisher.identity, public_key_spki_base64: publisher.signer.public_key_spki_base64, label, pinned_at: new Date().toISOString(), pinned_by: "test" });

/** Each round leaves a real note behind and offers a signed version that cannot read it. */
export async function retainedSheetNotes(host: MolisWorkLocalHost, reference: LocalHostProjectReference, web: LocalHostHttpClient) {
  const publisher = newPublisher(), base = `/projects/${reference.project_id}/api/plugin-trust`;
  const bundle = (version: number) => signedPackage(publisher, readsAndWrites, { pluginId: SHEET_PLUGIN_ID, version: version + ".0.0" });
  const client = host.actionClient(reference), caller = person(reference.project_id);
  const notes = async (operation: string, input = {}) => operate(client, caller, await operationsOf(client, caller, SHEET_PLUGIN_ID), operation, input);
  const preview = await web.post<{ preview_id: string }>(base + "/install/preview", { bundle: bundle(1) });
  await web.post(base + "/install/confirm", { preview_id: preview.preview_id, consent: true, pin_label: "Notes publisher" });
  let version = 1;
  return {
    notes,
    async uninstallKeepingNote() {
      const text = "Note from " + version;
      await notes("notes.add", { text });
      assert.deepEqual(await notes("notes.list"), [{ id: "1", text }]);
      const listed = await web.get<{ plugins: import("@molis-ai/molis-work-contracts/platform/plugin-trust").PluginInstalledView[] }>(base + "/overview");
      const row = listed.plugins.find(item => item.plugin_id === SHEET_PLUGIN_ID)!;
      const saved = () => host.withProject(reference, runtime => new SqlitePluginPrivateStorage(runtime.store.db).snapshotInstallationData(row.install_id));
      const before = await saved();
      await web.post(base + "/installed/uninstall", { plugin_id: SHEET_PLUGIN_ID, keep_data: true, target: row.uninstall_target });
      assert.ok(before.length);
      return { before, saved, next: bundle(++version) };
    },
  };
}

type InstallBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
export const discardWords = { zh: "放弃旧数据并安装", en: "Discard old data and install", ja: "以前のデータを削除してインストール" } as const;

/** The settings language choice of another window arrives while the confirmation is open. */
export async function switchSettingsLanguage(browser: Pick<InstallBrowser, "evaluate">, lang: keyof typeof discardWords) {
  await browser.evaluate(`(async () => {
    await molisWorkRequest("/api/ui/locale", { control: true, body: { preference: ${JSON.stringify(lang)} } });
    const channel = new BroadcastChannel("molis-work-ui-language"); channel.postMessage(null); channel.close();
  })()`);
}

export async function checkDiscardChoice(browser: InstallBrowser, lang: keyof typeof discardWords, width: number, button: string, door: string, bundle: PluginPackageBundle) {
  await switchSettingsLanguage(browser, lang);
  await browser.waitFor(`document.documentElement.lang.startsWith(${JSON.stringify(lang)}) && document.querySelector(${JSON.stringify(button)})?.textContent === ${JSON.stringify(discardWords[lang])}`, 30_000);
  const buttonNode = `document.querySelector(${JSON.stringify(button)})`;
  await browser.waitFor(`!${buttonNode}.closest('[data-unready]') && ${buttonNode}.getAttribute('aria-disabled') !== 'true'`);
  const warning = await browser.evaluate<string>(`${buttonNode}.closest('[data-install-sheet], .plugin-trust-review').textContent`);
  assert.ok(warning.includes(bundle.payload.manifest.name) && warning.includes(bundle.payload.manifest.version), warning);
  const bounds = await browser.evaluate<{ left: number; right: number; viewport: number; clipped: boolean }>(`(() => {
    const button = document.querySelector(${JSON.stringify(button)}), box = button.getBoundingClientRect();
    return { left: box.left, right: box.right, viewport: innerWidth, clipped: button.scrollWidth > button.clientWidth + 1 };
  })()`);
  assert.equal(bounds.viewport, width);
  assert.ok(bounds.left >= 0 && bounds.right <= width + 1 && !bounds.clipped, JSON.stringify(bounds));
  if (shouldSaveReviewScreenshots()) {
    const folder = reviewEvidenceUrl("b47-kept-data/");
    await mkdir(folder, { recursive: true });
    const shot = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, browser.sessionId);
    await writeFile(new URL(`${door}-${lang}-${width}.png`, folder), Buffer.from(shot.data, "base64"));
  }
}

/** Tab from the warning to a real button, wait for the sheet's focus fence, and press Enter. */
export async function chooseWithKeyboard(browser: InstallBrowser, selector: string) {
  const key = async (name: "Tab" | "Enter", code: number) => {
    await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: name, code: name, windowsVirtualKeyCode: code, ...(name === "Enter" ? {text: "\r"} : {}) }, browser.sessionId);
    await browser.command("Input.dispatchKeyEvent", { type: "keyUp", key: name, code: name, windowsVirtualKeyCode: code }, browser.sessionId);
  };
  const focused = `document.activeElement.matches(${JSON.stringify(selector)})`;
  for (let stop = 0; stop < 2 && !await browser.evaluate(focused); stop++) await key("Tab", 9);
  // Let the shell paint the newly focused control's temporary disabled state.
  await browser.evaluate("new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))");
  await browser.waitFor(focused + " && !document.activeElement.hasAttribute('aria-disabled')");
  await key("Enter", 13);
}
