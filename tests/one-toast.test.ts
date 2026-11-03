import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import { renderToast } from "@molis-ai/molis-work-plugin-sdk/ui";

// DESIGN「Toasts」: one toast, `.mw-toast`, drawn by the design system. The Workbench's toast, a plugin's toast at the foot
// of its stage and a completion card are all it; a host says only where it sits.

const root = new URL("..", import.meta.url);
// The one place a toast's colour, corner and motion are written. The IM page is its own small product page with its own
// palette and no shared stylesheet; it is the one recorded exception.
const OWNERS = new Set(["packages/design-system/src/styles/toast.ts", "packages/im-ui/src/styles.ts"]);
const TOAST_RULE = /([^{}]*toast[^{}]*)\{([^{}]*)\}/gi;
const LOOK = /(?:^|;|\s)(background(?:-color)?|border-radius|color|box-shadow)\s*:/;

test("only the design system draws a toast", () => {
  const files = execFileSync("git", ["ls-files", "--", "apps", "packages", "plugins"], { cwd: root, encoding: "utf8" })
    .split("\n").filter(file => /\.(ts|js|css)$/.test(file) && !file.includes("/dist/") && !file.includes("/tests/"));
  const offenders: string[] = [];
  for (const file of files) {
    if (OWNERS.has(file)) continue;
    const source = readFileSync(new URL(file, root), "utf8");
    for (const [, selector, body] of source.matchAll(TOAST_RULE)) {
      const last = selector.split(/[;}]/).pop()!.trim();
      if (!/\.[a-z-]*toast/i.test(last) || /__action|-text|-close/.test(last)) continue;
      if (LOOK.test(body!)) offenders.push(`${file}: ${last}`);
    }
    for (const [name] of source.matchAll(/@keyframes [a-z0-9-]*toast[a-z0-9-]*/gi)) offenders.push(`${file}: ${name}`);
  }
  assert.deepEqual(offenders, [], "a toast takes .mw-toast for how it looks and moves; the host writes only where it sits");
});

test("every toast on a product page is the one toast", () => {
  const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
  const css = renderer.renderMolisWorkWorkbenchStylesheet();
  assert.match(css, /\.mw-toast \{[^}]*background: var\(--tip-bg, var\(--action\)\)/);
  assert.match(css, /@keyframes mw-toast-in \{ from \{ opacity: 0; transform: translateY\(12px\) scale\(\.97\); \} \}/);
  assert.doesNotMatch(css, /\.toast \{[^}]*translate\(-50%/, "the Workbench's toast is centred by inset, so its arrival cannot fight its placement");
  for (const file of ["apps/workbench/src/shell-page-renderer.ts", "apps/workbench/src/settings-renderer.ts", "apps/workbench/src/project-settings-pages.ts", "apps/workbench/src/assistant-board-frame.ts", "plugins/native/issues/src/ui.ts", "plugins/native/workflows/src/ui.ts"])
    assert.match(readFileSync(new URL(file, root), "utf8"), /class="mw-toast /, `${file} renders the one toast`);
  assert.match(readFileSync(new URL("apps/workbench/src/scripts/client/placement.ts", root), "utf8"), /"mw-toast placement-toast"/, "a completion card is the one toast");
});

test("renderToast marks success and failure and carries an action", () => {
  assert.match(renderToast({ message: "已保存", tone: "success" }), /class="mw-toast" data-slot="toast" role="status" data-mw-state="done"/);
  assert.match(renderToast({ message: "没有存上", tone: "danger" }), /class="mw-toast is-error"[^>]*data-mw-state="failed"/);
  assert.match(renderToast({ message: "已删除", action: { label: "撤销" } }), /<span>已删除<\/span><button type="button" class="mw-toast__action">撤销<\/button>/);
  assert.doesNotMatch(renderToast({ message: "已删除" }), /data-mw-state/);
});
