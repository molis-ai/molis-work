import { t as uiText, escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { packageInstallHeight, packageInstallHtml, type PackageInstallPermission, type PackageInstallSheet, type PackageInstallView } from "./package-install-card.js";
import { PACKAGE_INSTALL_AREA_STYLES } from "./styles/package-install-area.js";

/**
 * The component board's 原处的安装单 · 平台区域版 (specs/plugin-builder-upgrade/spec.md §7.0; design in docs/design/studio-package-install):
 * the sheet the shell draws outside a plugin page's frame when the page offers a signed package, in every stage, with its two lists side
 * by side (720px), stacked (560px) and at the narrow step (375px). Drawn with the sheet's own markup (`packageInstallHtml`) at the height
 * the shell gives it (`packageInstallHeight`), so the specimens are what a page shows. Four board parts are new with it: the sheet, the
 * permission tile, the chip and the three steps. The plugin, its publisher and its reasons are sample data; nothing is installed.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

const row = (permission: string, reason: string, more: Partial<PackageInstallPermission> = {}): PackageInstallPermission =>
  ({ permission, reason, required: false, meaning: null, on: false, fresh: false, ...more });

function sample(more: Partial<PackageInstallSheet> = {}): PackageInstallSheet {
  const s = uiText.text;
  return { preview_id: "specimen", kept_data_incompatible: false, plugin_id: "com.example.checkin", name: s("workbench.package-install-specimens.meeting-check-in"), version: "1.0.0", from_version: null,
    runtime_scope: "project", dual: false, publisher: { label: null, local: true, trusted: true },
    permissions: [row("storage:private", "", { required: true, on: true }), row("capabilities:call", s("workbench.package-install-specimens.note-absences-in-goals")), row("network:request", "")],
    jobs: [{ reason: s("workbench.package-install-specimens.monday-reminder-to-import-the-list") }], secrets: [], network: ["calendar.example.com"], ...more };
}

const view = (stage: PackageInstallView["stage"], sheet: PackageInstallSheet | null, more: Partial<PackageInstallView> = {}): PackageInstallView =>
  ({ stage, sheet, on: new Set(), step: 1, note: "", busy: false, answered: false, ...more });

/** One sheet as the shell holds it: a fixed width, the height that width and its rows get, the sheet's markup inside. */
function card(readText: Say, entry: PackageInstallView, width: number): string {
  return `<div class="mw-platform-area install-sheet" data-install-sheet-specimen="${entry.stage}" data-stage="${entry.stage}" style="width:${width}px;height:${packageInstallHeight(entry, width)}px">${packageInstallHtml(readText, uiText.text("workbench.package-install-specimens.plugin-studio"), entry)}</div>`;
}

const figure = (caption: string, body: string) => `<figure class="mw-catalog__specimen"><figcaption>${escapeHtml(caption)}</figcaption><div class="mw-is-board__stage">${body}</div></figure>`;

/** The section the board places after 原处的连接卡. */
export function renderPackageInstallSection(readText: Say): string {
  const s = uiText.text, first = sample();
  const upgrade = sample({ version: "1.1.0", from_version: "1.0.0", permissions: [row("storage:private", "", { required: true, on: true }), row("capabilities:call", s("workbench.package-install-specimens.note-absences-in-goals"), { on: true }),
    row("network:request", "", { on: true }), row("model:invoke", s("workbench.package-install-specimens.group-absence-reasons"), { fresh: true })] });
  const home = sample({ runtime_scope: "home", publisher: { label: s("workbench.package-install-specimens.molis-samples"), local: false, trusted: true }, permissions: [row("storage:private", "", { required: true, on: true })], network: [] });
  const keyed = sample({ permissions: [row("storage:private", "", { required: true, on: true }), row("network:request", ""), row("secret:use", "")], secrets: [{ name: "calendar-key", saved: false }] });
  const stages: Array<[string, PackageInstallView, number[]]> = [
    [s("workbench.package-install-specimens.first-install-into-the-project"), view("review", first, { on: new Set(["network:request"]) }), [720, 560, 375]],
    [s("workbench.package-install-specimens.upgrade-one-more-permission-asked"), view("review", upgrade, { on: new Set(["capabilities:call", "network:request"]) }), [720, 375]],
    [s("workbench.package-install-specimens.into-the-personal-space-nothing-optional"), view("review", home), [720, 375]],
    [s("workbench.package-install-specimens.one-more-step-the-key"), view("keys", keyed, { on: new Set(["network:request", "secret:use"]) }), [720, 375]],
    [s("workbench.package-install-specimens.installing-three-steps"), view("working", first, { on: new Set(["network:request"]), busy: true }), [720, 375]],
    [s("workbench.package-install-card.cannot-read-kept-data"), view("discard", sample({ kept_data_incompatible: true })), [720, 375]],
    [s("workbench.package-install-specimens.installed"), view("done", first, { on: new Set(["network:request"]), answered: true, openable: true }), [720, 375]],
    [s("workbench.package-install-specimens.not-installed-where-it-stopped"), view("failed", first, { step: 2, failure: s("workbench.package-install-specimens.the-plugin-would-not-start") }), [720, 375]],
    [s("workbench.package-install-specimens.publisher-not-trusted-yet"), view("untrusted", sample({ publisher: { label: null, local: false, trusted: false } })), [720, 375]],
  ];
  const small = card(readText, view("loading", null), 560) + card(readText, view("line", first, { answered: true, line: s("workbench.package-install-specimens.kept-for-later-line") }), 560);
  return `<section class="mw-catalog__section" id="install-sheet" data-primitive="install-sheet"><h2>${escapeHtml(s("workbench.package-install-specimens.install-sheet-in-place-platform-area"))}</h2>
    <div class="mw-catalog__specimens">
      ${stages.map(([caption, entry, widths]) => figure(caption, widths.map(width => card(readText, entry, width)).join(""))).join("\n      ")}
      ${figure(s("workbench.package-install-specimens.checking-the-package-folded-into-one-line"), small)}
    </div>
  </section>`;
}

/** The board's layout for the section; the sheet's own styles are the shell's. */
export const PACKAGE_INSTALL_SECTION_STYLES = PACKAGE_INSTALL_AREA_STYLES
  + `.mw-is-board__stage{display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;max-width:100%;overflow-x:auto;padding:16px;border-radius:var(--r-card);background:var(--desk);box-shadow:inset 0 0 0 1px var(--line)}`
  + `.mw-is-board__stage>.mw-platform-area{flex:none}`;
