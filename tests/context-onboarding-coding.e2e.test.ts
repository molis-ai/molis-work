import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { withContextJourneys } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type ContextJourney = ReturnType<Parameters<Parameters<typeof withContextJourneys>[1]>[0]["get"]>;
type ContextReference = NonNullable<ContextJourney["summary"]>["references"][number];

const README = "# Login\nShip the login page by Friday; the API is in src/api.ts.";
const NOTE = "Design review: keep the login button on the left.";

/**
 * ONB-44, ONB-46 (the page half): a round that read the person's own code folder and a pasted note reaches review; the person ticks
 * handing the folder to Coding (the plugin that declares it takes one), adopts, and lands in the session Coding opened in that folder. Reading and the model's summary of the same kind
 * of round are walked in tests/context-onboarding.test.ts (ONB-44), and Coding reading the adopted materials in
 * tests/coding-material-consumption.test.ts.
 */
test("ONB-44 ONB-46 a code folder ticked at review becomes Coding's working folder, and the new project opens in Coding", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, async () => "# Login\nShip the login page. [S1]");
  if (!browser) return;
  const folder = await mkdtemp(join(tmpdir(), "molis-onb-code-")); t.after(() => rm(folder, { recursive: true, force: true }));
  await writeFile(join(folder, "package.json"), '{"name":"login"}'); await writeFile(join(folder, "README.md"), README);
  const child = await pluginFrameBrowser(t, browser, "coding");
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, homeDirectory } = browser;
  const id = randomUUID();
  const reference = (label: string, path: string, text: string): ContextReference => {
    const sha256 = createHash("sha256").update(text).digest("hex"), bytes = Buffer.byteLength(text);
    return { source_id: label, version: 1, label, title: path, path, text: { sha256, bytes, chars: text.length }, original: { filename: path, mime: "text/markdown", sha256, size_bytes: bytes } };
  };
  const readme = reference("S1", "README.md", README), note = reference("S2", "网页内容.md", NOTE);
  for (const [text, ref] of [[README, readme], [NOTE, note]] as const) for (const kind of ["files", "texts"]) {
    const directory = join(homeDirectory, "context-onboarding", "journeys", id, kind);
    await mkdir(directory, { recursive: true }); await writeFile(join(directory, ref.text.sha256), text);
  }
  const file = (path: string) => ({ path, size: 1, modified_ms: 1, identity: path });
  withContextJourneys(homeDirectory, store => {
    const journey = store.create(id);
    journey.sources = [{ kind: "custom", selected: true, path: folder, metadata: { files: [file("package.json"), file("README.md")], skipped: 0, truncated: false }, references: [readme] },
      { kind: "browser", selected: true, text: NOTE, references: [note] }];
    journey.phase = "review";
    journey.summary = { title: "Login", body: "Ship the login page by Friday. [S1] Keep the button on the left. [S2]", references: [readme, note] };
    return store.save(journey);
  });
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project&journey=${id}` }, sessionId));
  const box = "[data-take='io.molis.work.coding']";
  await waitFor(`Boolean(document.querySelector(${JSON.stringify(box)}))`);
  const folderName = folder.split("/").at(-1)!;
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(box)}).checked`), false, "not ticked by itself: a material folder is not made a working folder unasked");
  assert.match(String(await evaluate(`document.querySelector(${JSON.stringify(box)}).closest('label').textContent`)), new RegExp(`Coding.*${folderName}`));
  await click(box);
  await navigate(() => click("[data-action=adopt]"));
  await waitFor("location.pathname.startsWith('/projects/') && document.body.dataset.desktopSurface === 'coding'", 20_000);
  await child.waitFor(`document.querySelector('[data-coding-workspace-label]')?.title === ${JSON.stringify(await realpath(folder))}`, 20_000);
  // Both materials are in the project for Coding to cite: the folder's README and the pasted note, each in the 成果库 and in Pages.
  const adopted = withContextJourneys(homeDirectory, store => store.get(id));
  assert.equal(adopted.phase, "complete"); assert.deepEqual(adopted.adoption?.take, { plugin_id: "io.molis.work.coding", project_plugin_id: "coding", code_root: folder, output_set: true });
  // BCD-17: the folder and the round's materials were handed over by Coding's declared take action, which opened its own session.
  assert.ok(adopted.take_result?.open?.item_id, "Coding answered the take with the session it opened");
  assert.equal(adopted.take_result?.materials, 3, "the README, the pasted note and the accepted summary");
  assert.deepEqual(adopted.summary!.references.map(ref => [ref.path, Boolean(ref.artifact), Boolean(ref.documents?.length)]), [["README.md", true, true], ["网页内容.md", true, true]]);
});
