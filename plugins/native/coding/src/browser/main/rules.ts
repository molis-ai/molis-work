import { escapeHtml, fileKindExtension, format, icon, renderAlert, renderBadge, type MwButtonOptions } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage } from "../dom.js";
import type { Page } from "./page.js";
import type { RunView } from "./shapes.js";

/**
 * 「本轮设置」 (screen-polish §6.7), opened from ＋: the model's rows (composer-model.ts) and, under 「规则 N」, what the latest round was
 * given to follow (specs/coding-harness-optimization/batch12-design.md §3.6, §3.7): the project's own instructions and the
 * repository's instruction files, each as that round recorded it. N counts the files only. Why the files were not read, and the
 * button that changes it, come from the project as it is now; a round never shows files it did not record (an older round says it
 * recorded none).
 */
const round = (page: Page): RunView | null => page.s.current && page.s.sessionOnShow ? page.s.lastRun : null;

/** 「规则 N」 as the dialog's heading and ＋ say it, and the one line saying where the rules stand. */
function rulesWord(page: Page): { label: string; title: string } {
  const { readText } = page, recorded = round(page)?.frozen.instructions;
  return { label: recorded?.trusted ? readText("coding.rules.count", { count: recorded.files.length }) : readText("coding.rules.label"),
    title: !round(page) ? readText("coding.rules.title") : !recorded ? readText("coding.rules.unrecorded") : recorded.trusted ? readText("coding.rules.title") : readText("coding.rules.not-loaded") };
}

/** What ＋ says beside 「本轮设置」: the model chosen and the rules, so both are read without opening it. */
export function roundSettingsHint(page: Page): string {
  const model = page.refs.composerModels.summary();
  return [model || page.readText("coding.model.none"), rulesWord(page).label].join(" · ");
}

/** Opens 「本轮设置」; `on` puts the focus on the model's choice (`/model`). */
export function openRoundSettings(page: Page, on?: "model"): void {
  const dialog = page.q<HTMLDialogElement>("[data-coding-rules-dialog]");
  drawRules(page);
  if (!dialog.open) dialog.showModal();
  if (on) dialog.querySelector<HTMLElement>("[data-coding-model]")?.focus({ preventScroll: true });
}

/** 「规则 N」 over the rules, kept as the latest round stands (the composer's redraw calls it), so it is right the moment 「本轮设置」 opens. */
export function drawRulesLabel(page: Page): void {
  const word = rulesWord(page), label = page.q("[data-coding-rules-label]");
  if (label.textContent !== word.label) label.textContent = word.label;
  label.title = word.title;
}

/** The two groups: the project's own instructions, then the repository's files; the second says why none were read, when none were. */
export function drawRules(page: Page): void {
  const { readText, q } = page, run = round(page);
  const body = q("[data-coding-rules-body]");
  drawRulesLabel(page);
  const project = (run?.frozen.prompts ?? []).filter(prompt => prompt.layer === "project");
  const projectRows = project.map(prompt => row({ kind: "txt", name: readText("coding.rules.project-prompt"), size: readText("coding.rules.version", { version: prompt.user_revision ?? prompt.version }) }));
  body.innerHTML = group({ glyph: "book", title: readText("coding.rules.project"), count: project.length ? String(project.length) : "",
    rows: projectRows, note: run ? project.length ? "" : readText("coding.rules.project-none") : readText("coding.rules.no-round") }) + files(page, run);
}

function files(page: Page, run: RunView | null): string {
  const { readText, s } = page, recorded = run?.frozen.instructions, now = s.state.instructions;
  const title = readText("coding.rules.files");
  if (run && !recorded) return group({ glyph: "file", title, rows: [], note: readText("coding.rules.unrecorded") });
  if (recorded?.trusted) {
    const at = run?.started_at ? format.date(run.started_at, "time") : "";
    const rows = recorded.files.map(file => row({ kind: extension(file.path), name: file.path, size: readText("coding.rules.chars", { count: file.chars }),
      title: readText("coding.rules.fingerprint", { hash: file.sha256.slice(0, 12) }),
      state: file.truncated ? renderBadge({ label: readText("coding.rules.truncated"), tone: "warning" }) : renderBadge({ label: readText("coding.rules.in-effect"), tone: "success" }) }));
    return group({ glyph: "file", title, count: String(recorded.files.length), caption: at ? readText("coding.rules.as-of", { time: at }) : "", rows,
      note: recorded.files.length ? "" : readText("coding.rules.files-none") });
  }
  // Not read in that round, or no round yet: the next round reads them when the project trusts its output now.
  if (now?.trusted) return group({ glyph: "file", title, rows: [], note: readText(run ? "coding.rules.next-reads" : "coding.rules.will-read") });
  return group({ glyph: "file", title, rows: [] }) + notLoaded(page, now?.why_not);
}

function notLoaded(page: Page, why: "default_output" | "off" | "not_chosen" | undefined): string {
  const { readText } = page;
  const settings = page.q<HTMLElement>("[data-coding-rules-dialog]").dataset.codingRulesSettings;
  const action: MwButtonOptions | null = why === "default_output"
    ? settings ? { label: readText("coding.rules.open-settings"), variant: "primary", href: settings, attrs: { "data-coding-rules-settings-link": "" } } : null
    : why ? { label: readText("coding.rules.confirm"), variant: "primary", attrs: { "data-coding-rules-confirm": "" } } : null;
  const reason = why === "default_output" ? readText("coding.rules.not-loaded-default") : why === "off" ? readText("coding.rules.not-loaded-off")
    : why === "not_chosen" ? readText("coding.rules.not-loaded-unconfirmed") : readText("coding.rules.not-loaded-unknown");
  return renderAlert({ title: readText("coding.rules.not-read"), body: reason, tone: "warning", role: null, ...(action ? { actions: [action] } : {}),
    attrs: { "data-coding-rules-not-loaded": why ?? "" } });
}

/** 「读取这个文件夹的说明文件」: the Host asks the person in its own dialog; once it is on, the page reads the project again. */
export async function confirmRules(page: Page, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    page.s.state.instructions = await page.host.readInstructions();
    drawRules(page);
    // The button is gone with the redraw; the menu keeps focus on its own close control.
    page.q<HTMLElement>("[data-coding-rules-close]").focus({ preventScroll: true });
  } catch (error) {
    // The Host's refusal carries its status and is an error; a "no" in the Host's dialog carries none and is only a note. One line
    // either way: a second try replaces the first's, and focus stays on the button the person pressed.
    const said = errorMessage(error), refused = typeof (error as { status?: unknown }).status === "number";
    const body = page.q("[data-coding-rules-body]");
    body.querySelector("[data-coding-rules-said]")?.remove();
    if (said) body.insertAdjacentHTML("beforeend", `<p class="coding-rules__${refused ? "error" : "note"}" role="${refused ? "alert" : "status"}" data-coding-rules-said>${escapeHtml(said)}</p>`);
    button.disabled = false;
    button.focus({ preventScroll: true });
  }
}

function group(options: { glyph: "book" | "file"; title: string; caption?: string; count?: string; rows: readonly string[]; note?: string }): string {
  return `<section class="mw-file-group coding-rules__group" data-slot="file-group"><div class="mw-file-group__head"><span class="mw-file-group__ic">${icon(options.glyph)}</span>`
    + `<span class="mw-file-group__text"><strong>${escapeHtml(options.title)}</strong>${options.caption ? `<small>${escapeHtml(options.caption)}</small>` : ""}</span>`
    + `${options.count ? `<span class="mw-file-group__count">${escapeHtml(options.count)}</span>` : ""}</div>`
    + `${options.rows.length ? `<ul class="mw-file-list">${options.rows.join("")}</ul>` : ""}${options.note ? `<p class="mw-file-group__note">${escapeHtml(options.note)}</p>` : ""}</section>`;
}

function row(options: { kind: string; name: string; size: string; title?: string; state?: string }): string {
  return `<li class="mw-file-row" data-slot="file-row"${options.title ? ` title="${escapeHtml(options.title)}"` : ""}><span class="mw-file-row__label"><span class="mw-file-kind mw-file-kind--${escapeHtml(options.kind)}" data-slot="file-kind">${escapeHtml(options.kind.toUpperCase())}</span>`
    + `<span class="mw-file-row__name">${escapeHtml(options.name)}</span></span><span class="mw-file-row__size">${escapeHtml(options.size)}</span>${options.state ?? ""}</li>`;
}

/** The one shared file-kind rule (the component board and onboarding use it too), so `.env*` is ENV here as well. */
const extension = (path: string): string => fileKindExtension(path);

