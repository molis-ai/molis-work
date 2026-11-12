import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { BASELINE_FONT, BASELINE_SKIN, BASELINE_SPEC, FONT_STACK, MONO_FONT_STACK, MW_CONTENT_MARKS, MW_HUES, renderControlMetrics, renderPaletteTokens, renderShapeTokens, renderShellTokens } from "@molis-ai/molis-work-design-system";
import { parseSkinFile, resolveSkin, skinTokenDeclarations } from "@molis-ai/molis-work-plugin-sdk/ui";

// The baseline files (specs/font-and-skin-system/a-section-contract.md §7, §8.1). The names come from a list written down before these files existed,
// never from what they render. That the text is byte for byte what it replaced is shown once, against the merge-base, in the pull request (FSS-55).

const exec = promisify(execFile);
const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const FROZEN = JSON.parse(read("tests/fixtures/baseline-token-names.json")) as { groups: Record<string, string[]> };
// Tokens added to the spec after the freeze, each after the frozen name it follows and with the batch that added it; the frozen file stays as written.
const LATER: Record<string, { readonly after: string; readonly names: readonly string[] }> = {
  shape: { after: "dur-reveal", names: ["dur-stagger"] }, // batch 22: the step between cards arriving together (DESIGN.md「Motion」)
};
const GROUPS: Record<string, string[]> = Object.fromEntries(Object.entries(FROZEN.groups).map(([group, names]) => {
  const later = LATER[group];
  if (!later) return [group, names];
  const at = names.indexOf(later.after) + 1;
  return [group, [...names.slice(0, at), ...later.names, ...names.slice(at)]];
}));
const ALL_FROZEN = Object.values(FROZEN.groups).flat();
const ALL_NAMES = Object.values(GROUPS).flat();
const SPEC_ROLES = BASELINE_SPEC.groups.flatMap((group) => group.roles);
const LOCKED = ["focus-stroke", "focus-stroke-inset", "icon-xs", "icon-sm", "icon-md", "icon-lg", "control-h", "control-pad-x", "sheet-inset", "code-tab"];
const TYPE_TOKENS = [
  ...["body", "control", "title", "display", "reading", "note", "code"].flatMap(role => [`type-${role}-size`, `type-${role}-line-height`]),
  "type-control-font", "type-title-font", "type-display-font", "type-display-weight", "type-reading-font",
  "type-reading-weight", "type-reading-tracking", "type-note-font", "type-note-weight", "type-note-tracking", "type-code-weight",
];

test("FSS-54 the spec preserves the 194 frozen tokens and adds the B2 typography roles", () => {
  assert.equal(ALL_FROZEN.length, 194);
  const fontTokens = BASELINE_SPEC.font_roles.flatMap((role) => Object.values(role.tokens));
  assert.deepEqual([...SPEC_ROLES.map((role) => role.name), ...fontTokens].sort(), [...ALL_NAMES, ...TYPE_TOKENS].sort());
  assert.deepEqual(Object.fromEntries(BASELINE_SPEC.groups.map(({ group, roles }) => [group, roles.map((role) => role.name)])), Object.fromEntries(Object.entries(GROUPS).filter(([group]) => group !== "font")), "the groups, in output order");
  assert.deepEqual(fontTokens.sort(), [...FROZEN.groups.font!, ...TYPE_TOKENS].sort());
});

test("FSS-54 114 tokens differ by theme or terminal, 10 are locked and 63 are shared by a skin (62 frozen and the stagger step)", () => {
  assert.equal(SPEC_ROLES.filter((role) => role.varies_by === "theme").length, 108);
  assert.equal(SPEC_ROLES.filter((role) => role.varies_by === "terminal").length, 6);
  assert.deepEqual(SPEC_ROLES.filter((role) => role.locked !== undefined).map((role) => role.name).sort(), [...LOCKED].sort());
  assert.equal(SPEC_ROLES.filter((role) => role.varies_by === "none" && role.locked === undefined).length, 63);
  assert.equal(Object.keys(BASELINE_FONT.tokens).length, 8 + TYPE_TOKENS.length);
});

test("FSS-54 every role has its value on every axis it has, and the two themes write the same roles", () => {
  for (const role of SPEC_ROLES) {
    const maps = role.varies_by === "theme" ? [BASELINE_SKIN.light, BASELINE_SKIN.dark] : role.varies_by === "terminal" ? Object.values(BASELINE_SKIN.terminal) : [BASELINE_SKIN.shared];
    for (const map of maps) assert.ok(Object.hasOwn(map, role.name), role.name);
  }
  assert.deepEqual(Object.keys(BASELINE_SKIN.light), Object.keys(BASELINE_SKIN.dark));
  const names = (text: string) => [...text.matchAll(/--([a-z0-9-]+):/gu)].map((match) => match[1]);
  assert.deepEqual(names(renderShellTokens("light")), names(renderShellTokens("dark")));
  assert.deepEqual(names(renderShellTokens("light")), FROZEN.groups.shell);
  assert.deepEqual(names(renderShapeTokens()), GROUPS.shape);
  assert.deepEqual(names(renderControlMetrics()), FROZEN.groups.control);
  assert.deepEqual(names(renderPaletteTokens("dark")), [...FROZEN.groups.hue!, ...FROZEN.groups.tone!, ...FROZEN.groups.content!, ...FROZEN.groups.mark!]);
});

test("FSS-54 a skin that writes one surface carries the rest of that surface with it, and the later layer's aliases are the spec's", () => {
  const followsOf = Object.fromEntries(SPEC_ROLES.flatMap((role) => (role.follows === undefined ? [] : [[role.name, role.follows]])));
  assert.deepEqual(followsOf, { "nav-bg": "page", canvas: "paper", panel: "paper", surface: "paper", wash: "rail", text: "ink" });
  const aliasOf = Object.fromEntries(SPEC_ROLES.flatMap((role) => (role.alias_of === undefined ? [] : [[role.name, role.alias_of]])));
  assert.deepEqual(aliasOf, { desk: "page", "lift-1": "shadow-soft", "lift-2": "shadow-raised", "lift-3": "shadow" });
  const folio = parseSkinFile(JSON.stringify({ format_version: 1, id: "folio", revision: 1, spec: { id: BASELINE_SPEC.id, revision: BASELINE_SPEC.revision }, name: { literal: "Folio" }, recommended_font: BASELINE_SPEC.baseline_font, light: { page: "#fafafa" }, dark: {}, shared: {}, terminal: {} }), BASELINE_SPEC);
  assert.ok(folio.ok);
  const baselineSkin = parseSkinFile(read("packages/design-system/resources/skins/soft-workbench.json"), BASELINE_SPEC);
  assert.ok(baselineSkin.ok);
  const resolved = resolveSkin(BASELINE_SPEC, baselineSkin.value, folio.value);
  assert.ok(resolved.ok);
  assert.equal(skinTokenDeclarations(resolved.value, { theme: "light", names: ["page", "nav-bg"] }), "--page: #fafafa; --nav-bg: #fafafa;");
  assert.equal(skinTokenDeclarations(resolved.value, { theme: "dark", names: ["page", "nav-bg"] }), skinTokenDeclarations(BASELINE_SKIN, { theme: "dark", names: ["page", "nav-bg"] }));
});

test("FSS-54 hex letter case, the stacks and the unset terminal are what the files say", () => {
  assert.equal(BASELINE_SKIN.light["content-tty"], "#F8F7F4");
  assert.equal(BASELINE_SKIN.dark["mark-slate-fill"], "#3A4155");
  assert.ok(FONT_STACK.startsWith('-apple-system, BlinkMacSystemFont, "SF Pro Text"'));
  assert.ok(FONT_STACK.includes('"Inter Variable", Inter, "Noto Sans SC", system-ui, sans-serif'));
  assert.ok(MONO_FONT_STACK.startsWith('ui-monospace, "SF Mono", SFMono-Regular'));
  assert.equal(BASELINE_SKIN.terminal.unset.terminal, "#171719");
});

test("FSS-56 no token block holds a value of its own, and there is no second table", () => {
  const frozen = new Set(ALL_NAMES);
  const aliases = new Set(["--desk: var(--page)", "--lift-1: var(--shadow-soft)", "--lift-2: var(--shadow-raised)", "--lift-3: var(--shadow)"]);
  const declared = (block: string) => [...block.replace(/\/\*[\s\S]*?\*\//gu, "").matchAll(/(--([a-z0-9-]+)):\s*([^;]*);/gu)].filter((match) => frozen.has(match[2]!)).map((match) => `${match[1]}: ${match[3]}`);
  const blocks = {
    "styles/foundation.ts": read("packages/design-system/src/styles/foundation.ts").split("  body {")[0]!,
    "styles/craft-finish-bar.ts": read("packages/design-system/src/styles/craft-finish-bar.ts").split("/* ─── Browser defaults")[0]!,
    "typeface.ts": read("packages/design-system/src/typeface.ts"),
    "palette.ts": read("packages/design-system/src/palette.ts"),
    // The workbench base sets the shell before the foundation does: its terminal pair once had values of its own (#1976 review ② item 1).
    "apps/workbench/src/styles/base.ts": read("apps/workbench/src/styles/base.ts").split("  * { box-sizing")[0]!,
  };
  for (const [file, block] of Object.entries(blocks)) {
    for (const declaration of declared(block)) assert.ok(/: \$\{/u.test(declaration) || aliases.has(declaration), `${file} writes ${declaration}`);
    assert.doesNotMatch(block, /#[0-9a-fA-F]{6}\b|rgba\(|cubic-bezier\(|color-mix\(/u, file);
  }
  assert.doesNotMatch(blocks["typeface.ts"], /unicode-range|font-weight: \d|"Inter Variable"/u);
  // Nothing but the file's words: the lists left in palette.ts only name a role for the component board.
  for (const swatch of [...MW_HUES, ...MW_CONTENT_MARKS]) assert.deepEqual(Object.keys(swatch), ["id", "label", "role"]);
});

test("FSS-54 a broken baseline stops the Host at import with ui.baseline_invalid, the file and the field", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "molis-baseline-"));
  try {
    const packageRoot = new URL("../packages/design-system/", import.meta.url);
    mkdirSync(path.join(directory, "dist"));
    cpSync(new URL("dist/baseline.js", packageRoot), path.join(directory, "dist", "baseline.js"));
    cpSync(new URL("resources", packageRoot), path.join(directory, "resources"), { recursive: true });
    writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module" }));
    symlinkSync(new URL("node_modules", packageRoot), path.join(directory, "node_modules"), "dir");
    const skinPath = path.join(directory, "resources", "skins", "soft-workbench.json");
    writeFileSync(skinPath, readFileSync(skinPath, "utf8").replace('"page": "#eef3f7"', '"page": "url(evil)"'));
    await assert.rejects(exec(process.execPath, [path.join(directory, "dist", "baseline.js")]), (error: { stderr?: string }) => {
      assert.match(error.stderr ?? "", /ui\.baseline_invalid/u);
      assert.match(error.stderr ?? "", /resources\/skins\/soft-workbench\.json \$\.light\.page/u);
      return true;
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
