import type { ComposerControl } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { escapeHtml, format, icon, renderAlert, renderBadge, type MwButtonOptions } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage } from "../dom.js";
import { refreshState } from "./configuration.js";
import type { Page } from "./page.js";
import type { RunView } from "./shapes.js";

/**
 * 「规则 N」 at the foot of the composer and what it opens (specs/coding-harness-optimization/batch12-design.md §3.6, §3.7): the project's
 * own instructions and the repository's instruction files the latest round was given, each as that round recorded it. N counts the
 * files only. Why the files were not read, and the button that changes it, come from the project as it is now; a round never shows
 * files it did not record (an older round says it recorded none).
 */
const round = (page: Page): RunView | null => page.s.current && page.s.sessionOnShow ? page.s.lastRun : null;

export function rulesControl(page: Page): ComposerControl[] {
  const { readText, s } = page;
  if (!s.current || !s.sessionOnShow) return [];
  const recorded = round(page)?.frozen.instructions;
  const label = recorded?.trusted ? readText("coding.rules.count", { count: recorded.files.length }) : readText("coding.rules.label");
  const title = !round(page) ? readText("coding.rules.title") : !recorded ? readText("coding.rules.unrecorded") : recorded.trusted ? readText("coding.rules.title") : readText("coding.rules.not-loaded");
  return [{ kind: "button", id: "rules", label, title, run: () => openRules(page) }];
}

export function openRules(page: Page): void {
  const dialog = page.q<HTMLDialogElement>("[data-coding-rules-dialog]");
  drawRules(page);
  if (!dialog.open) dialog.showModal();
}

/** The two groups: the project's own instructions, then the repository's files; the second says why none were read, when none were. */
export function drawRules(page: Page): void {
  const { readText, q } = page, run = round(page);
  const body = q("[data-coding-rules-body]");
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
  const reason = why === "default_output" ? "coding.rules.not-loaded-default" : why === "off" ? "coding.rules.not-loaded-off" : why === "not_chosen" ? "coding.rules.not-loaded-unconfirmed" : "coding.rules.not-loaded-unknown";
  return renderAlert({ title: readText("coding.rules.not-read"), body: readText(reason), tone: "warning", role: null, ...(action ? { actions: [action] } : {}),
    attrs: { "data-coding-rules-not-loaded": why ?? "" } });
}

/** 「读取这个文件夹的说明文件」: the Host asks the person in its own dialog; once it is on, the page reads the project again. */
export async function confirmRules(page: Page, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    await page.host.readInstructions();
    await refreshState(page);
    drawRules(page);
  } catch (error) {
    // The person said no in the Host's dialog, or the change was refused: the menu stays as it was, with the reason under it.
    const said = errorMessage(error);
    if (said) page.q("[data-coding-rules-body]").insertAdjacentHTML("beforeend", `<p class="coding-rules__error" role="alert">${escapeHtml(said)}</p>`);
    button.disabled = false;
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

/** The file kind mark the component board draws for a name: its extension, up to four letters; a name without one is text. */
function extension(path: string): string {
  const name = path.split("/").at(-1) ?? path, dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(dot + 1) : "txt").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "txt";
}

