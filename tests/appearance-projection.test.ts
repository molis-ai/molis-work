import assert from "node:assert/strict";
import { withPageText } from "./fixtures/page-text.js";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION, appearanceSelectionActions as actions } from "@molis-ai/molis-work-contracts/platform/ui";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { BASELINE_FONT, BASELINE_REGISTRY, BASELINE_SPEC, baselinePackageFile, PLUGIN_COMPONENTS, PRIMITIVE_CATALOG_IDS, renderPrimitiveCatalog } from "@molis-ai/molis-work-design-system";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { fontFaceRules, parseFontScheme, parseUiSpecFile } from "@molis-ai/molis-work-plugin-sdk/ui";
import { APPEARANCE_STATE_PATH, createAppearanceOwner } from "@molis-ai/molis-work-service-appearance";

test("FSS-05 FSS-26 component metadata is one validated definition with a real catalog specimen for every kind", () => {
  const document = withPageText("zh", [], renderPrimitiveCatalog);
  assert.deepEqual(PLUGIN_COMPONENTS.map(row => row.kind), BASELINE_SPEC.components.map(row => row.kind));
  assert.deepEqual(PRIMITIVE_CATALOG_IDS, PLUGIN_COMPONENTS.map(row => row.kind));
  for (const row of PLUGIN_COMPONENTS) assert.ok(document.includes(`data-primitive="${row.kind}"`), row.kind);
  const row = BASELINE_SPEC.components[0]!;
  const duplicate = parseUiSpecFile(JSON.stringify({ ...BASELINE_SPEC, components: [row, row] }));
  assert.ok(!duplicate.ok && duplicate.problems.some(problem => problem.code === "ui.spec_repeated_component"));
  const unknownIcon = parseUiSpecFile(JSON.stringify({ ...BASELINE_SPEC, components: [{ ...row, icon: "unknown-icon" }] }));
  assert.ok(!unknownIcon.ok && unknownIcon.problems.some(problem => problem.path === "$.components[0].icon"));
});

test("FSS-01 FSS-16 FSS-27 candidates are read-only, with the same typography that a committed selection publishes", async t => {
  const home = await realpath(await mkdtemp(join(tmpdir(), "molis-appearance-projection-")));
  const fail = (error: unknown) => { throw error; };
  const owner = createAppearanceOwner(home, { locale: { defaultLocale: "zh", isSupported: (value): value is "zh" => value === "zh",
    readFailed: (_, error) => fail(error), writeFailed: (_, error) => fail(error), writeSucceeded() {} }, listenerFailed: fail });
  const dispatcher = new ActionService(), unregister = dispatcher.registerProvider(owner.provider());
  const action = bindActionClient(dispatcher, () => ({ actor_id: "appearance-reader", audience: "user", project_id: null,
    permissions: [APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION] }));
  t.after(async () => { unregister(); owner.close(); await rm(home, { recursive: true, force: true }); });

  const locale = { tag: "en", source: "explicit" } as const;
  const start = owner.current(locale);
  assert.equal(start.selection_revision, 0);
  assert.deepEqual(start.snapshot.problems, []);
  const select = { skin: { id: "folio", revision: 1 }, font: { policy: "follow-skin" }, mono: { id: "system-menlo", revision: 1 } } as const;
  const trial = owner.preview(select, locale);
  assert.equal(trial.skin.light.page, "#f4ede2");
  assert.equal(trial.skin.dark.page, "#171f1b");
  assert.match(trial.font.tokens.font ?? "", /^"Nunito Variable", "Molis Folio Rounded SC"/u);
  assert.equal(trial.font.tokens["type-reading-font"], "var(--font)");
  assert.match(trial.mono.tokens["font-mono"] ?? "", /^Menlo,/u);
  assert.equal(trial.font.faces.length, 9);
  const css = fontFaceRules(trial.font, BASELINE_REGISTRY);
  assert.ok(css.ok);
  assert.equal(css.value.match(/@font-face/gu)?.length, 9);
  assert.ok(Buffer.byteLength(css.value, "utf8") <= 32_911, "the nine approved declarations fit the font CSS budget");
  assert.equal(owner.current(locale).selection_revision, 0);
  assert.equal(existsSync(join(home, APPEARANCE_STATE_PATH)), false);
  assert.throws(() => owner.preview({ ...select, mono: { id: "system-menlo", revision: 2 } }, locale), { code: "appearance.selection_unavailable" });

  let notified: number | undefined;
  owner.subscribe(revision => { notified = owner.current(locale).selection_revision ?? undefined; assert.equal(notified, revision); });
  const receipt = await action.invoke(actions.apply, { expected_revision: 0, request_id: "use-folio", choice: { kind: "selection", selection: select } });
  assert.equal(notified, 1);
  assert.deepEqual(owner.current(locale), { selection_revision: 1, selection: select, ...trial });
  await action.invoke(actions.undo, { expected_revision: receipt.selection_revision, applied_request_id: receipt.request_id });
  assert.equal(notified, 2);
  assert.deepEqual(owner.current(locale), { ...start, selection_revision: 2 });

  const reading = owner.preview({ skin: start.snapshot.skin, font: { policy: "pinned", scheme: { id: "relaxed-reading", revision: 1 } }, mono: null }, locale);
  assert.equal(reading.font.tokens.font, BASELINE_FONT.tokens.font);
  assert.equal(reading.mono.tokens["font-mono"], BASELINE_FONT.tokens["font-mono"]);
  assert.match(reading.font.tokens["type-reading-font"] ?? "", /^Georgia,/u);
  assert.equal(reading.font.tokens["type-reading-line-height"], "1.8");
});

test("FSS-16 malformed typography cannot become CSS dimensions", () => {
  const file = JSON.parse(readFileSync(baselinePackageFile("font-scheme.system-sans"), "utf8"));
  file.roles.note.size_px = "calc(1px)";
  file.roles.code.line_height = 0.5;
  const result = parseFontScheme(JSON.stringify(file));
  assert.ok(!result.ok);
  assert.deepEqual(result.problems.map(problem => problem.path), ["$.roles.note.size_px", "$.roles.code.line_height"]);
});
