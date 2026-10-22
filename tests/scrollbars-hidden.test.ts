import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { desktopWorkbenchRendererPorts, renderDesktopCapsuleShell } from "@molis-ai/molis-work-app-desktop";
import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { HIDDEN_SCROLLBAR_STYLES } from "@molis-ai/molis-work-design-system";
import { IM_STYLES } from "@molis-ai/molis-work-im-ui";

// The product draws no scrollbar anywhere (user, 2026-10-21): one design-system rule hides them on every page and
// every region keeps scrolling. Under forced colours the system's bars come back, since the edge fade is off there.

const root = new URL("..", import.meta.url);
const SCROLLBAR_PROPERTY = /scrollbar-width|scrollbar-color|::-webkit-scrollbar|-ms-overflow-style/;
// The rule itself, and the continuity page, a static file served by the remote server that cannot import it.
const OWNERS = new Set(["packages/design-system/src/styles/scrollbars.ts", "server/public/style.css"]);

test("only the design system's one rule styles scrollbars", () => {
  const files = execFileSync("git", ["ls-files", "--", "apps", "packages", "plugins", "server"], { cwd: root, encoding: "utf8" })
    .split("\n").filter(file => /\.(ts|tsx|js|mjs|css|html)$/.test(file) && !file.includes("/dist/") && !file.includes("/tests/"));
  const offenders = files.filter(file => !OWNERS.has(file) && SCROLLBAR_PROPERTY.test(readFileSync(new URL(file, root), "utf8")));
  assert.deepEqual(offenders, [], "a region that should scroll quietly needs nothing: the shared rule already hides its bar");
  assert.ok(readFileSync(new URL("server/public/style.css", root), "utf8").includes(HIDDEN_SCROLLBAR_STYLES), "the continuity page carries the same rule");
});

test("the rule hides bars outside forced colours only", () => {
  assert.match(HIDDEN_SCROLLBAR_STYLES, /^@media not \(forced-colors:active\)\{/);
  assert.match(HIDDEN_SCROLLBAR_STYLES, /\*\{scrollbar-width:none\}/);
  assert.match(HIDDEN_SCROLLBAR_STYLES, /\*::-webkit-scrollbar\{display:none/);
});

test("every product document carries the rule", () => {
  const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
  const documents: Record<string, string> = {
    "workbench.css": renderer.renderMolisWorkWorkbenchStylesheet(),
    "arrival.css": renderer.renderMolisWorkArrivalStylesheet(),
    "settings.css": renderer.renderMolisWorkSettingsStylesheet(),
    "IM": IM_STYLES,
    "capsule": renderDesktopCapsuleShell([], { translate: text => text, htmlLang: "zh-CN", clientI18nScript: "", themeBootstrapScript: "" }),
  };
  for (const [name, css] of Object.entries(documents)) assert.ok(css.includes(HIDDEN_SCROLLBAR_STYLES), `${name} hides scrollbars`);
});
