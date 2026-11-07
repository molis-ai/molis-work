import assert from "node:assert/strict";
import test from "node:test";

import { UI_FORMAT_VERSIONS, type UiDevicePreferences, type UiEnvironmentProblem, type UiSkinFile, type UiSpecFile } from "@molis-ai/molis-work-contracts/platform/ui";
import { resolveSkin, resolveUiEnvironment, UI_ENVIRONMENT_PROBLEM_LIMITS, withDevicePreferences } from "@molis-ai/molis-work-plugin-sdk/ui";

// FSS-49: the snapshot and the four layers of precedence (specs/font-and-skin-system/spec.md §11).

const SPEC: UiSpecFile = {
  format_version: UI_FORMAT_VERSIONS.spec,
  id: "molis-interface",
  revision: 1,
  baseline_skin: { id: "soft-workbench", revision: 1 },
  baseline_font: { id: "system-sans", revision: 1 },
  groups: [{ group: "shell", roles: [
    { name: "page", type: "color", varies_by: "theme" },
    { name: "nav-bg", type: "color", varies_by: "theme", follows: "page" },
    { name: "code-tab", type: "number", varies_by: "none", locked: { number: 4 } },
  ] }],
  font_roles: [],
};
const skin = (id: string, recommended: string, light: UiSkinFile["light"]): UiSkinFile => ({
  format_version: UI_FORMAT_VERSIONS.skin, id, revision: 1, spec: { id: SPEC.id, revision: SPEC.revision }, name: { literal: id }, recommended_font: { id: recommended, revision: 1 }, light, dark: { page: "#141a20" }, shared: {}, terminal: {},
});
const SOFT = skin("soft-workbench", "system-sans", { page: "#eef3f7" });
const FOLIO = skin("folio", "folio-round", { page: "#fafafa" });
const DEVICE: UiDevicePreferences = { theme: "system", resolved_theme: "dark", density: "compact", terminal_theme: "auto", resolved_terminal_theme: "dark", reduced_motion: true };
const EN = { tag: "en", source: "explicit" } as const;
const ZH = { tag: "zh-CN", source: "system" } as const;

test("FSS-49: the snapshot holds identities and problems, never token values or translations", () => {
  const snapshot = resolveUiEnvironment({ spec: SPEC, skin: SOFT, locale: EN });
  assert.deepEqual(snapshot, {
    revision: "molis-interface@1;soft-workbench@1;system-sans@1;system-sans@1;en",
    spec: { id: "molis-interface", revision: 1 },
    skin: { id: "soft-workbench", revision: 1 },
    font: { scheme: { id: "system-sans", revision: 1 }, policy: "follow-skin", mono: { id: "system-sans", revision: 1 } },
    locale: { tag: "en", direction: "ltr", source: "explicit", formatting: "en-US" },
    device: null,
    problems: [],
  });
  const text = JSON.stringify(snapshot);
  assert.doesNotMatch(text, /#[0-9a-f]{6}|"messages"|"light"/iu, "no token value, no word");
  assert.ok(new TextEncoder().encode(text).length < 600, `${text.length} bytes`);
});

test("FSS-49: a parsed file given as the font is reduced to its identity", () => {
  const font = { ...SOFT, id: "pinned", revision: 3 };
  assert.deepEqual(resolveUiEnvironment({ spec: SPEC, skin: SOFT, font, locale: EN }).font.scheme, { id: "pinned", revision: 3 });
});

test("FSS-49: the server has no device, and only a page's merge brings it, leaving the revision alone", () => {
  const server = resolveUiEnvironment({ spec: SPEC, skin: SOFT, locale: EN });
  assert.equal(server.device, null);
  const page = withDevicePreferences(server, DEVICE);
  assert.deepEqual(page.device, DEVICE);
  assert.equal(page.revision, server.revision);
  assert.equal(server.device, null, "the snapshot given is not changed");
  assert.deepEqual({ ...page, device: null }, server);
  assert.deepEqual(resolveUiEnvironment({ spec: SPEC, skin: SOFT, locale: EN, device: DEVICE }).device, DEVICE, "a caller that has them can pass them");
});

test("FSS-49: layer 1, the common spec: a locked role and a followed one come from the spec, whichever skin is chosen", () => {
  for (const chosen of [undefined, FOLIO]) {
    const resolved = resolveSkin(SPEC, SOFT, chosen);
    assert.ok(resolved.ok, JSON.stringify(resolved));
    assert.deepEqual(resolved.value.shared["code-tab"], { number: 4 });
    assert.equal(resolved.value.light["nav-bg"], resolved.value.light.page);
  }
});

test("FSS-49: layer 2, the chosen skin: its values are in force, and it names itself in the snapshot", () => {
  const resolved = resolveSkin(SPEC, SOFT, FOLIO);
  assert.ok(resolved.ok);
  assert.equal(resolved.value.light.page, "#fafafa");
  assert.deepEqual(resolveUiEnvironment({ spec: SPEC, skin: FOLIO, locale: EN }).skin, { id: "folio", revision: 1 });
});

test("FSS-49: layer 3, the font: the skin's recommendation until someone chooses one, and a chosen one stays when the skin changes", () => {
  const followed = resolveUiEnvironment({ spec: SPEC, skin: FOLIO, locale: EN });
  assert.deepEqual(followed.font, { scheme: { id: "folio-round", revision: 1 }, policy: "follow-skin", mono: { id: "folio-round", revision: 1 } });
  const chosen = { id: "mine", revision: 2 };
  for (const each of [SOFT, FOLIO]) {
    const pinned = resolveUiEnvironment({ spec: SPEC, skin: each, font: chosen, locale: EN });
    assert.deepEqual(pinned.font, { scheme: chosen, policy: "pinned", mono: chosen });
  }
  const mono = { id: "menlo", revision: 1 };
  assert.deepEqual(resolveUiEnvironment({ spec: SPEC, skin: SOFT, mono, locale: EN }).font, { scheme: { id: "system-sans", revision: 1 }, policy: "follow-skin", mono });
});

test("FSS-49: layer 4, the entry: light or dark, density and motion come from the device; language from the entry, with its Intl tag", () => {
  const snapshot = withDevicePreferences(resolveUiEnvironment({ spec: SPEC, skin: FOLIO, locale: { tag: "ar", source: "explicit", direction: "rtl" } }), DEVICE);
  assert.deepEqual(snapshot.skin, { id: "folio", revision: 1 }, "none of them changes the skin");
  assert.equal(snapshot.device?.reduced_motion, true);
  assert.equal(snapshot.device?.density, "compact");
  assert.equal(snapshot.locale.direction, "rtl");
  assert.equal(resolveUiEnvironment({ spec: SPEC, skin: SOFT, locale: { tag: "zh", source: "default" } }).locale.formatting, "zh-CN");
  assert.equal(resolveUiEnvironment({ spec: SPEC, skin: SOFT, locale: ZH }).locale.formatting, "zh-CN");
});

test("FSS-49: changing the skin does not change the language; changing the language changes neither the skin nor a chosen font", () => {
  const chosen = { id: "mine", revision: 1 };
  const first = resolveUiEnvironment({ spec: SPEC, skin: SOFT, font: chosen, locale: EN });
  const skinChanged = resolveUiEnvironment({ spec: SPEC, skin: FOLIO, font: chosen, locale: EN });
  const localeChanged = resolveUiEnvironment({ spec: SPEC, skin: SOFT, font: chosen, locale: ZH });
  assert.deepEqual(skinChanged.locale, first.locale);
  assert.deepEqual(localeChanged.skin, first.skin);
  assert.deepEqual(localeChanged.font, first.font);
  assert.notEqual(skinChanged.revision, first.revision);
  assert.notEqual(localeChanged.revision, first.revision);
  assert.equal(resolveUiEnvironment({ spec: SPEC, skin: SOFT, font: chosen, locale: EN }).revision, first.revision, "the same choices give the same value");
  // Followed, the font is the skin's: language still does not touch it.
  assert.deepEqual(resolveUiEnvironment({ spec: SPEC, skin: FOLIO, locale: ZH }).font, resolveUiEnvironment({ spec: SPEC, skin: FOLIO, locale: EN }).font);
});

test("FSS-49: problems go into the first screen, so their number and length are bounded", () => {
  const { count, field } = UI_ENVIRONMENT_PROBLEM_LIMITS;
  const many: UiEnvironmentProblem[] = Array.from({ length: 500 }, (_, index) => ({ code: "ui.skin_missing", subject: `skin-${index}`, detail: "x".repeat(10_000) }));
  const { problems } = resolveUiEnvironment({ spec: SPEC, skin: SOFT, locale: EN, problems: many });
  assert.equal(problems.length, count);
  assert.ok(problems.every((problem) => (problem.detail?.length ?? 0) <= field && problem.subject.length <= field && problem.code.length <= field));
  assert.equal(problems.at(-1)?.code, "ui.environment_problems_more");
  assert.match(problems.at(-1)?.detail ?? "", new RegExp(String(500 - count + 1)));
  const exactly = many.slice(0, count);
  assert.equal(resolveUiEnvironment({ spec: SPEC, skin: SOFT, locale: EN, problems: exactly }).problems.at(-1)?.subject, `skin-${count - 1}`, "up to the limit nothing is dropped");
  const { problems: long } = resolveUiEnvironment({ spec: SPEC, skin: SOFT, locale: { tag: `</script>${"x".repeat(1000)}`, source: "explicit" } });
  assert.equal(long[0]?.code, "ui.environment_locale");
  assert.ok(long[0]!.subject.length <= field);
});
