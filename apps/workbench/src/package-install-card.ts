import { escapeHtml as escape, renderStateRing } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The install sheet's markup (specs/plugin-builder-upgrade/spec.md §7.0, design in docs/design/studio-package-install): the one card
 * the shell draws outside a plugin page's frame (browser/plugin-frame/package-install.ts) when the page offers a signed package. What
 * it shows is what the Host verified in that package (`POST /api/host/plugin-page-install`), never anything the page said; the person's
 * switches and the keys they type stay in the shell. One screen: the height follows what the package asks (`packageInstallHeight`),
 * every line is one line, and only a package asking for more than a screen holds makes the middle scroll.
 */

export type PackageInstallStage = "loading" | "review" | "discard" | "keys" | "working" | "done" | "failed" | "untrusted" | "line";
type Say = (text: string, values?: Record<string, string | number>) => string;

/** One permission the package asks for, as the Host's sheet route answers it. */
export interface PackageInstallPermission { permission: string; required: boolean; reason: string; meaning: string | null; on: boolean; fresh: boolean }
/** The Host's answer for one package (`PageInstallView`, apps/local-host/src/plugin-page-install-http.ts). */
export interface PackageInstallSheet {
  preview_id: string; kept_data_incompatible: boolean; plugin_id: string; name: string; version: string; from_version: string | null;
  runtime_scope: "home" | "project"; dual: boolean;
  publisher: { label: string | null; local: boolean; trusted: boolean };
  permissions: PackageInstallPermission[]; jobs: Array<{ reason: string }>; secrets: Array<{ name: string; saved: boolean }>; network: string[];
}
/** What the markup reads. */
export interface PackageInstallView {
  stage: PackageInstallStage; sheet: PackageInstallSheet | null;
  /** The optional permissions switched on in this sheet (the person's, never the page's). */
  on: ReadonlySet<string>;
  /** Installing: the step under way. Failed: the step it stopped at (0 the package, 1 installing, 2 starting). */
  step: number;
  note: string; busy: boolean; answered: boolean; line?: string;
  /** Why it was not installed, in the Host's own words. */
  failure?: string;
  /** After an upgrade: how many switches could not be moved. */
  unmoved?: number;
  /** The installed plugin has a place to open. */
  openable?: boolean;
}

const PART = "install-sheet__", SECRET = "secret:use";
const icon = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
const optional = (sheet: PackageInstallSheet) => sheet.permissions.filter(row => !row.required);
const required = (sheet: PackageInstallSheet) => sheet.permissions.filter(row => row.required);
/** The switches the person may move here: none for a package whose two halves are installed apart (they are switched in the settings). */
export const packageInstallChoices = (sheet: PackageInstallSheet) => sheet.dual ? [] : optional(sheet);
/** The keys still to type before installing: only when the package may use keys at all (its switch on, or required). */
export function packageInstallKeys(view: PackageInstallView): string[] {
  const sheet = view.sheet, row = sheet?.permissions.find(item => item.permission === SECRET);
  return sheet && (!row || row.required || view.on.has(SECRET)) ? sheet.secrets.filter(item => !item.saved).map(item => item.name) : [];
}

/** How a permission reads: the platform's own name for its kind, and under it what this package says or what it is held to. */
function words(t: Say, sheet: PackageInstallSheet, row: PackageInstallPermission): { icon: string; tint: string; name: string; note: string; tag?: string } {
  const kind = row.permission.slice(0, row.permission.indexOf(":") >= 0 ? row.permission.indexOf(":") : row.permission.length), said = row.reason || row.meaning || "";
  if (kind === "storage") return { icon: "database", tint: "blue", name: t("workbench.package-install-card.keep-its-own-data"),
    note: sheet.runtime_scope === "home" ? t("workbench.package-install-card.one-copy-for-all-projects") : t("workbench.package-install-card.stays-in-this-project") };
  if (kind === "network") return { icon: "globe", tint: "amber", tag: t("workbench.package-install-card.online"), name: t("workbench.package-install-card.reach-websites"),
    note: sheet.network.length ? t("workbench.package-install-card.only-sites", { sites: sheet.network.join(", ") }) : said };
  if (kind === "secret") return { icon: "key", tint: "amber", name: t("workbench.package-install-card.use-keys-you-save"),
    note: sheet.secrets.length ? t("workbench.package-install-card.keys-named", { count: sheet.secrets.length, names: sheet.secrets.map(item => item.name).join(", ") }) : said };
  if (kind === "capabilities") return { icon: "target", tint: "green", name: t("workbench.package-install-card.use-other-plugins"), note: said };
  if (kind === "background") return { icon: "clock", tint: "plain", name: t("workbench.package-install-card.work-in-background"), note: said };
  if (kind === "connections") return { icon: "link", tint: "blue", name: t("workbench.package-install-card.use-connected-accounts"), note: said };
  if (kind === "model") return { icon: "sparkles", tint: "accent", name: t("workbench.package-install-card.use-your-model"), note: said };
  return { icon: "shield", tint: "plain", name: row.permission, note: said };
}

const TILE = { wide: 52, narrow: 48 }, STRIP = { wide: 28, narrow: 22 };
/** From this width the sheet's two lists stand side by side (the styles' container query is the same number). */
export const PACKAGE_INSTALL_COLUMNS_FROM = 640;
/** The folded line, and the tallest the sheet grows before its middle scrolls. */
export const PACKAGE_INSTALL_HEIGHTS = { line: 48, loading: 168, max: { wide: 580, narrow: 640 } } as const;

/**
 * The sheet's height at a width: fixed for a result, and for the sheet itself what its rows add up to (styles/package-install-area.ts
 * holds every part at the height counted here), so nothing scrolls until a package asks for more than the cap holds.
 */
export function packageInstallHeight(view: PackageInstallView, width: number): number {
  const wide = width >= 480, size = wide ? "wide" : "narrow", sheet = view.sheet;
  if (view.stage === "line") return PACKAGE_INSTALL_HEIGHTS.line;
  if (view.stage === "loading" || !sheet) return view.stage === "failed" ? (wide ? 344 : 388) : PACKAGE_INSTALL_HEIGHTS.loading;
  if (view.stage === "done") return wide ? 322 : 364;
  if (view.stage === "untrusted" || view.stage === "discard") return wide ? 322 : 372;
  if (view.stage === "failed") return wide ? 344 : 388;
  const gap = wide ? 8 : 6, title = 18 + gap, head = wide ? 76 : sheet.from_version ? 98 : 70, foot = wide ? 60 : 96, pad = wide ? 20 : 12;
  let body: number;
  if (view.stage === "keys") {
    const keys = packageInstallKeys(view).length;
    body = 18 + keys * (10 + TILE[size] + 8 + (wide ? 58 : 124));
  } else {
    const rows = (count: number, strips = 0) => count ? title + count * TILE[size] + (count - 1) * gap + strips * (gap + STRIP[size]) : 0;
    const strips = (sheet.jobs.length ? 1 : 0) + (sheet.dual && optional(sheet).length ? 1 : 0);
    const need = rows(required(sheet).length, strips), pick = rows(packageInstallChoices(sheet).length);
    body = width >= PACKAGE_INSTALL_COLUMNS_FROM ? Math.max(need, pick) : need + (need && pick ? (wide ? 16 : 10) : 0) + pick;
  }
  const news = sheet.from_version && sheet.permissions.some(row => row.fresh) ? (wide ? 44 : 40) : 0;
  return Math.min(PACKAGE_INSTALL_HEIGHTS.max[size], 32 + head + news + 4 + body + pad - 4 + foot);
}

/** 必需 2 项 · 可选开了 1/2: the foot's one line, which follows the switches. */
export function packageInstallSummary(say: Say, view: PackageInstallView): string {
  const sheet = view.sheet!, picks = packageInstallChoices(sheet);
  return picks.length ? say("workbench.package-install-card.required-count-optional-on-of", { required: required(sheet).length, on: picks.filter(row => view.on.has(row.permission)).length, optional: picks.length })
    : say("workbench.package-install-card.required-count", { required: required(sheet).length });
}

const STEP_STATES = ["idle", "doing", "done", "failed"] as const;
/** The three steps (检查安装包 → 装进项目 → 启动), each with its ring: the 三步进度 part. */
export function packageInstallSteps(say: Say, sheet: PackageInstallSheet | null, at: number, state: "doing" | "done" | "failed"): string {
  const middle = !sheet ? say("workbench.package-install-card.install") : sheet.from_version ? say("workbench.package-install-card.switch-to-version", { version: sheet.version })
    : sheet.runtime_scope === "home" ? say("workbench.package-install-card.install-in-personal-space") : say("workbench.package-install-card.install-in-project");
  const names = [say("workbench.package-install-card.check-package"), middle, say("workbench.package-install-card.start")];
  return `<ol class="install-steps" aria-label="${escape(say("workbench.package-install-card.progress"))}">${names.map((name, index) => {
    const now = STEP_STATES[state === "done" || index < at ? 2 : index > at ? 0 : state === "failed" ? 3 : 1];
    return `<li data-state="${now}">${renderStateRing({ state: now, size: 16 })}<span>${escape(name)}</span></li>`;
  }).join("")}</ol>`;
}

/** A short fact with its icon: the 小标记 part. */
const chip = (name: string, text: string, tone = "") => `<span class="install-chip"${tone ? ` data-tone="${tone}"` : ""}>${icon(name)}<span>${escape(text)}</span></span>`;

/** The sheet's markup, one stage at a time. `owner` is the page's plugin as the shell lists it. */
export function packageInstallHtml(say: Say, owner: string, view: PackageInstallView): string {
  const t = say, sheet = view.sheet, upgrade = Boolean(sheet?.from_version);
  const button = (name: string, label: string, variant = "secondary") => `<button type="button" class="mw-btn mw-btn--md mw-btn--${variant}" data-slot="button" data-framed-control="${name}">${escape(label)}</button>`;
  if (view.stage === "line") return `<div class="${PART}line" data-framed-area-head data-framed-area-foot><p role="status" tabindex="-1">${escape(view.line ?? "")}</p></div>`;
  const band = `<header class="${PART}band" data-framed-area-head><span class="${PART}by">${icon("shield")}<strong>${escape(t("workbench.package-install-card.molis-work-install-confirmation"))}</strong></span>`
    + `<span class="${PART}guard" title="${escape(owner)}">${escape(t("workbench.package-install-card.owner-cant-change-this-part", { owner }))}</span></header>`;
  const note = `<p class="${PART}note" role="status">${escape(view.note)}</p>`;
  // A result takes the sheet's own place: a ring, one heading, one or two lines, and at most two buttons.
  const result = (tone: "ok" | "bad" | "warn", title: string, text: string, more: string, acts: string) =>
    `${band}<div class="${PART}result" data-tone="${tone}"${tone === "bad" ? ' role="alert"' : ""} tabindex="-1" data-install-focus><span class="${PART}ring">${tone === "warn" ? icon("lock") : renderStateRing({ state: tone === "ok" ? "done" : "failed", size: 44 })}</span>`
    + `<h3>${escape(title)}</h3><p>${escape(text)}</p>${more}${note}<div class="${PART}acts" data-framed-area-foot>${acts}</div></div>`;
  if (view.stage === "loading" || !sheet) {
    if (view.stage !== "failed") return `${band}<div class="${PART}result" data-tone="wait" data-framed-area-foot><span class="${PART}ring">${renderStateRing({ state: "doing", size: 44 })}</span><p role="status">${escape(t("workbench.package-install-card.checking-the-package"))}</p></div>`;
    return result("bad", t("workbench.package-install-card.not-installed"), view.failure || t("workbench.package-install-card.nothing-installed-no-data-changed"), packageInstallSteps(t, null, 0, "failed"), button("dismiss", t("workbench.package-install-card.got-it")));
  }
  const picks = packageInstallChoices(sheet), need = required(sheet), name = { name: sheet.name };
  if (view.stage === "discard") return result("warn", t("workbench.package-install-card.cannot-read-kept-data"), t("workbench.package-install-card.discard-consequence", { name: sheet.name, version: sheet.version }), "",
    button("later", t("workbench.package-install-card.not-installing-now")) + button("discard", t("workbench.package-install-card.discard-and-install"), "danger"));
  if (view.stage === "untrusted") return result("warn", t("workbench.package-install-card.publisher-not-trusted-yet"), t("workbench.package-install-card.import-in-settings-to-trust"), "",
    button("dismiss", t("workbench.package-install-card.got-it")) + button("settings", t("workbench.package-install-card.open-plugin-settings"), "primary"));
  if (view.stage === "failed") return result("bad", upgrade ? t("workbench.package-install-card.not-upgraded") : t("workbench.package-install-card.not-installed"),
    view.failure || t("workbench.package-install-card.nothing-installed-no-data-changed"), packageInstallSteps(t, sheet, view.step, "failed"),
    button("dismiss", t("workbench.package-install-card.got-it")) + button("retry", t("workbench.package-install-card.try-again"), "primary"));
  if (view.stage === "done") {
    const on = picks.filter(row => view.on.has(row.permission)).length, off = picks.length - on;
    const chips = chip("shield", t("workbench.package-install-card.required-count", { required: need.length }))
      + (view.unmoved ? chip("alert", t("workbench.package-install-card.switches-not-changed", { count: view.unmoved }), "amber")
        : picks.length ? chip("tune", off ? t("workbench.package-install-card.optional-still-off", { count: off }) : t("workbench.package-install-card.all-optional-on"), off ? "" : "green") : "");
    return result("ok", upgrade ? t("workbench.package-install-card.upgraded-to-version", { version: sheet.version }) : t("workbench.package-install-card.installed"),
      upgrade ? t("workbench.package-install-card.your-data-is-kept-carry-on") : sheet.runtime_scope === "home" ? t("workbench.package-install-card.open-it-from-any-project") : t("workbench.package-install-card.open-it-in-this-project"),
      `<div class="${PART}chips" data-center>${chips}</div>`,
      button("manage", t("workbench.package-install-card.manage-permissions")) + (view.openable ? button("open", t("workbench.package-install-card.open-name", name), "primary") : ""));
  }
  const versions = upgrade ? `<span class="${PART}ver">${escape(sheet.from_version!)}</span><span class="${PART}arrow" aria-hidden="true">${icon("arrow")}</span><span class="${PART}ver" data-new>${escape(sheet.version)}</span>`
    : `<span class="${PART}ver" data-new>${escape(sheet.version)}</span>`;
  const head = `<div class="${PART}head" data-chips="${upgrade ? 3 : 2}"><span class="${PART}app" aria-hidden="true">${icon("package")}</span><div class="${PART}id"><div class="${PART}name"><strong title="${escape(sheet.name)}">${escape(sheet.name)}</strong>${versions}</div>`
    + `<div class="${PART}chips">${chip("user", sheet.publisher.local ? t("workbench.package-install-card.made-by-you-this-computer") : t("workbench.package-install-card.from-publisher", { publisher: sheet.publisher.label ?? "" }))}`
    + (sheet.runtime_scope === "home" ? chip("home", t("workbench.package-install-card.into-personal-space-all-projects")) : chip("folder", t("workbench.package-install-card.into-this-project")))
    + `${upgrade ? chip("check", t("workbench.package-install-card.data-kept"), "green") : ""}</div></div></div>`;
  const fresh = sheet.permissions.filter(row => row.fresh).length;
  const news = upgrade && fresh ? `<p class="${PART}news">${icon("plus")}<span>${escape(t("workbench.package-install-card.version-asks-count-more-off-still-upgrades", { version: sheet.version, count: fresh }))}</span></p>` : "";
  const mark = (name: string, tint: string) => `<span class="install-tile__mark" data-tint="${tint}" aria-hidden="true">${icon(name)}</span>`;
  const tile = (row: PackageInstallPermission, pick: boolean) => {
    const w = words(t, sheet, row), on = view.on.has(row.permission), tags = (w.tag ? `<em class="install-tile__tag" data-tint="amber">${escape(w.tag)}</em>` : "")
      + (row.fresh ? `<em class="install-tile__tag" data-tint="accent">${escape(t("workbench.package-install-card.new"))}</em>` : "");
    const copy = `${mark(w.icon, w.tint)}<span class="install-tile__copy"><strong><span title="${escape(w.name)}">${escape(w.name)}</span>${tags}</strong><span title="${escape(w.note)}">${escape(w.note)}</span></span>`;
    // A required tile takes keyboard focus, so a cut name or note is shown whole by the shared tooltip there too (VUX-05).
    if (!pick) return `<li class="install-tile" tabindex="0">${copy}<span class="install-tile__lock" title="${escape(t("workbench.package-install-card.required"))}">${icon("lock")}<span class="mw-sr-only">${escape(t("workbench.package-install-card.required"))}</span></span></li>`;
    // The whole tile presses (`tile:`), and the switch itself holds the keyboard (`switch:`); both are the one choice.
    return `<li><label class="install-tile" data-pick data-on="${on}" data-framed-control="${escape("tile:" + row.permission)}">${copy}<span class="mw-switch" data-slot="switch"><input type="checkbox" role="switch" aria-label="${escape(w.name)}"${on ? " checked" : ""}${view.busy ? " disabled" : ""} data-framed-control="${escape("switch:" + row.permission)}"><span class="mw-switch__track" aria-hidden="true"></span></span></label></li>`;
  };
  const strip = (name: string, text: string) => `<p class="${PART}strip">${icon(name)}<span title="${escape(text)}">${escape(text)}</span></p>`;
  const body = view.stage === "keys"
    ? `<div class="${PART}keys" tabindex="-1" data-install-focus><h4>${escape(t("workbench.package-install-card.one-more-step-count-keys", { count: packageInstallKeys(view).length }))}<span>${escape(t("workbench.package-install-card.kept-only-in-this-computers-encrypted-store"))}</span></h4>`
      + packageInstallKeys(view).map(key => `<div class="install-key"><div class="install-tile">${mark("key", "amber")}<span class="install-tile__copy"><strong><span>${escape(key)}</span></strong><span>${escape(t("workbench.package-install-card.plugin-asks-to-use-it-never-reads-it"))}</span></span></div>`
        + `<div class="install-key__fields"><label class="mw-field"><span class="mw-field__label">${escape(t("workbench.package-install-card.key"))}</span><input class="mw-input" type="password" autocomplete="off" spellcheck="false" data-install-key="${escape(key)}"></label>`
        + `<label class="mw-field"><span class="mw-field__label">${escape(t("workbench.package-install-card.sent-in-header"))}</span><input class="mw-input" spellcheck="false" autocomplete="off" value="Authorization" data-install-header="${escape(key)}"></label></div></div>`).join("") + "</div>"
    : `<div class="${PART}grid"${picks.length && need.length ? "" : " data-single"}>`
      + (need.length ? `<section><h4>${escape(t("workbench.package-install-card.always-needed"))}</h4><ul class="${PART}tiles">${need.map(row => tile(row, false)).join("")}</ul>`
        + (sheet.jobs.length ? strip("clock", sheet.jobs.length > 1 ? t("workbench.package-install-card.background-count-things-first", { count: sheet.jobs.length, first: sheet.jobs[0]!.reason }) : t("workbench.package-install-card.background-reason", { reason: sheet.jobs[0]!.reason })) : "")
        + (sheet.dual && optional(sheet).length ? strip("tune", t("workbench.package-install-card.count-optional-switched-in-settings-after", { count: optional(sheet).length })) : "") + "</section>" : "")
      + (picks.length ? `<section><h4>${escape(t("workbench.package-install-card.your-choice"))}<span>${escape(t("workbench.package-install-card.change-later-in-settings"))}</span></h4><ul class="${PART}tiles">${picks.map(row => tile(row, true)).join("")}</ul></section>` : "") + "</div>";
  const said = view.note ? `<span class="${PART}sum is-note" role="status">${escape(view.note)}</span>` : "";
  const foot = view.stage === "working" ? packageInstallSteps(t, sheet, view.step, "doing")
    : view.stage === "keys" ? `${said || `<span class="${PART}sum">${escape(t("workbench.package-install-card.installing-starts-once-filled"))}</span>`}<span class="${PART}acts">${button("back", t("workbench.package-install-card.back"), "ghost")}${button("save", t("workbench.package-install-card.save-and-install"), "primary")}</span>`
    : `${said || `<span class="${PART}sum" aria-live="polite" data-install-sum>${escape(packageInstallSummary(t, view))}</span>`}<span class="${PART}acts">${button("later", upgrade ? t("workbench.package-install-card.not-upgrading-now") : t("workbench.package-install-card.not-installing-now"), "ghost")}`
      + `${button("confirm", upgrade ? t("workbench.package-install-card.agree-and-upgrade") : t("workbench.package-install-card.agree-and-install"), "primary")}</span>`;
  return `${band}<div class="${PART}main" data-framed-scroll${view.stage === "working" ? ' aria-busy="true" inert' : ""}>${head}${news}${body}</div><footer class="${PART}foot" data-framed-area-foot>${foot}</footer>`;
}
