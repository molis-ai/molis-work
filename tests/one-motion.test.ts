import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";

// DESIGN「Motion」: one keyframe for each kind of entrance, written once in the design system's styles/motion.ts, and one
// wash for something that has just landed. Pages and plugins animate with those names; none writes its own rise or fade.

const root = new URL("..", import.meta.url);
const MOTION = "packages/design-system/src/styles/motion.ts";
const SHARED = ["craft-rise", "craft-fade-in", "craft-drop", "craft-rise-from-bar", "craft-landed"];
// Entrances that are not one of the four kinds, each with why it moves its own way.
const OWN_ENTRANCES: Record<string, string> = {
  "mw-toast-in": "the one toast's capsule rises from the bar (styles/toast.ts)",
  "mw-loading-in": "the waiting mark's pair: it fades in only after the wait and out when the content comes",
  "craft-bar-in": "opening a project: the bar settles in once per page",
  "craft-sheet-open": "opening a project: the sheet settles in once per page",
  "craft-dock-rise": "the bottom bar's sheet rises from the bar it belongs to",
  "as-arrive": "the plugin studio's part landing on the canvas, a moment of its own",
  "as-rise": "the plugin studio's pointer note, centred by transform",
  "im-arrive": "the IM page is its own small product page with no shared stylesheet",
  "im-switch": "the IM page is its own small product page with no shared stylesheet",
};
// The four kinds: a vertical rise or drop, or a fade from nothing.
const ENTRANCE = /^\s*opacity:\s*[\d.]+;?\s*(?:transform:\s*translateY\([^)]*\)(?:\s*scale\([^)]*\))?;?\s*)?$|^\s*transform:\s*translateY\([^)]*\);?\s*$/;

const sources = () => execFileSync("git", ["ls-files", "--", "apps", "packages", "plugins"], { cwd: root, encoding: "utf8" })
  .split("\n").filter(file => /\.(ts|js|css)$/.test(file) && !file.includes("/dist/") && !file.includes("/tests/"))
  .map(file => ({ file, source: readFileSync(new URL(file, root), "utf8") }));

test("an entrance is one of the shared keyframes, written once", () => {
  const offenders: string[] = [];
  for (const { file, source } of sources()) {
    for (const [, name, from] of source.matchAll(/@keyframes ([a-z0-9-]+)\s*\{\s*from\s*\{([^}]*)\}/gi)) {
      if (SHARED.includes(name!)) { if (file !== MOTION) offenders.push(`${file}: ${name} is the shared one`); continue; }
      if (ENTRANCE.test(from!) && !OWN_ENTRANCES[name!]) offenders.push(`${file}: @keyframes ${name}`);
    }
  }
  assert.deepEqual(offenders, [], "a rise, a drop or a fade animates with craft-rise, craft-drop, craft-rise-from-bar or craft-fade-in");
  const css = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts).renderMolisWorkWorkbenchStylesheet();
  for (const name of SHARED) assert.equal(css.split(`@keyframes ${name} {`).length - 1, 1, `${name} is in the Workbench sheet once`);
});

test("something that just landed carries the one wash", () => {
  const offenders: string[] = [];
  for (const { file, source } of sources()) {
    if (file === MOTION) continue;
    for (const [match] of source.matchAll(/\[data-landed\]|\.pc-new\b|\.issues-row\.is-new|@keyframes (?:pc-new|issues-new|mw-ix-wash)|craft-landed/g)) offenders.push(`${file}: ${match}`);
  }
  assert.deepEqual(offenders, [], "a new row is marked data-craft-new (or molisCraft.land) and washes with the shared rule");
  const motion = readFileSync(new URL(MOTION, root), "utf8");
  assert.match(motion, /\[data-craft-new\]::after \{[^}]*background: var\(--accent-soft\);[^}]*animation: craft-landed var\(--dur-moment, 640ms\)/);
  assert.match(motion, /prefers-reduced-motion: reduce\) \{ \[data-craft-new\]::after \{ animation: none; \} \}/);
  // The Issues page's browser code lives in src/browser/ (the page client is bundled from there); the row that has just
  // landed carries the marker in the list that draws it.
  const issuesBrowser = new URL("plugins/native/issues/src/browser/", root);
  assert.ok(readdirSync(issuesBrowser).filter(file => file.endsWith(".ts"))
    .some(file => /["'] data-craft-new["']/.test(readFileSync(new URL(file, issuesBrowser), "utf8"))),
  "the Issues page marks the row that just landed with data-craft-new");
  assert.match(readFileSync(new URL("packages/design-system/src/plugin-component-client.ts", root), "utf8"), /item\.dataset\.craftNew = ''/);
});

test("Feed's reader rises once: the Workbench does not animate the frame around it", () => {
  const directory = readFileSync(new URL("apps/workbench/src/styles/immersive-directory.ts", root), "utf8");
  assert.doesNotMatch(directory, /\.feed-stage-item-detail \{[^}]*animation/);
});

test("durations are the motion tokens, not the older aliases", () => {
  const offenders = sources().filter(({ file }) => file !== "packages/design-system/src/palette.ts")
    .flatMap(({ file, source }) => [...source.matchAll(/var\(--motion-(?:fast|normal|instant|arrive)\b/g)].map(() => file));
  assert.deepEqual([...new Set(offenders)], [], "a duration reads --dur-press, --dur-hover, --dur-move, --dur-arrive or --dur-moment");
});
