import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";


/**
 * The bundle's entry (dist/runtime-panel-client.js): what runs on its own here (specs/proactive-assistant/resident-runtime-design.md §4),
 * read from `/api/runtime/overview`. On the Home it is the notice of what was missed, with 「现在做」 and 「跳过」, drawn with the
 * catalog's parts. Their markup is written out here rather than taken from the SDK's renderers, whose alert brings the state ring
 * (about 5 KB) into a bundle that is inlined into the page.
 */

interface Run { run_id: string; title: string; due_at: string; project_id: string | null; needs: string[]; waiting?: boolean;
  missed_at?: string; source: { scope_project_id: string | null; provider_id: string; surface: string; title: string } }
interface Gap { from: string; to: string; cause: "quit" | "crash" | "sleep" }
interface Overview { state: "running"; waiting: { network: boolean; model: boolean }; gaps: Gap[]; upcoming: Run[]; missed: Run[];
  unavailable_sources: Array<{ project_id: string | null; provider_id: string | null; code: string }> }

const page = globalThis as typeof globalThis & { molisWorkRequest?: UiRequest };
const text = (key: string, values?: Record<string, string | number>) => globalThis.t.text(`workbench.runtime-panel.${key}`, values);
const escape = (value: string) => value.replace(/[&<>"']/gu, character => `&#${character.charCodeAt(0)};`);

const language = () => document.documentElement.lang || undefined;
function when(value: string): string {
  const at = new Date(value), now = new Date();
  const time = new Intl.DateTimeFormat(language(), { hour: "2-digit", minute: "2-digit" }).format(at);
  if (at.toDateString() === now.toDateString()) return time;
  return new Intl.DateTimeFormat(language(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(at);
}

/** The stretch the missed runs fall in, in the person's words: asleep, or the hours it was not running. */
function missedTitle(view: Overview): string {
  const count = view.missed.length, latest = view.gaps[0];
  if (latest?.cause === "sleep") return text("missed-during-sleep", { count });
  if (latest) return text("missed-while-stopped", { from: when(latest.from), to: when(latest.to), count });
  return text("missed", { count });
}

const decideAttrs = (run: Run, decision: "run_now" | "skip") => ({ "data-runtime-decide": decision, "data-run": run.run_id, "data-provider": run.source.provider_id,
  "data-scope": run.source.scope_project_id ?? "" });

// ---- the Home: the notice above the brief, in the catalog's parts ----
const attributes = (attrs: Record<string, string>) => Object.entries(attrs).map(([key, value]) => ` ${key}="${escape(value)}"`).join("");
const mwButton = (label: string, attrs: Record<string, string>, primary = false) =>
  `<button type="button" class="mw-btn mw-btn--${primary ? "primary" : "secondary"} mw-btn--sm" data-slot="button"${attributes(attrs)}><span data-slot="button-label">${escape(label)}</span></button>`;

function renderHome(view: Overview, handled: boolean): string {
  if (!view.missed.length) return handled ? `<div class="mw-alert mw-alert--success" data-slot="alert" role="status"><strong>${escape(text("all-handled"))}</strong></div>` : "";
  const rows = view.missed.map(run => `<div class="mw-dir-row mw-dir-row--meta runtime-row" data-runtime-row="${escape(run.run_id)}"><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${escape(run.title)}</strong></span><small>${escape(run.source.title)} · ${escape(when(run.due_at))}</small></span><span class="runtime-row__actions">${mwButton(text("run-now"), decideAttrs(run, "run_now"), true)}${mwButton(text("skip"), decideAttrs(run, "skip"))}</span></div>`).join("");
  return `<div class="mw-alert mw-alert--warning" data-slot="alert"><strong>${escape(missedTitle(view))}</strong><div class="runtime-rows">${rows}</div></div>`;
}

const root = document.querySelector<HTMLElement>("[data-runtime-panel]"), request = page.molisWorkRequest;
if (root && request) {
  const body = root.querySelector<HTMLElement>("[data-runtime-body]")!;
  let view: Overview | null = null, hadMissed = false;
  const paint = () => {
    if (!view) return;
    body.innerHTML = renderHome(view, hadMissed && !view.missed.length);
    root.hidden = !body.innerHTML;
  };
  const load = async () => {
    // The Host is not answering: the Home page says nothing.
    try { view = await request("/api/runtime/overview") as Overview; hadMissed ||= view.missed.length > 0; paint(); } catch { /* nothing to say */ }
  };
  body.addEventListener("click", async event => {
    const choice = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-runtime-decide]");
    if (!choice) return;
    const line = choice.closest<HTMLElement>("[data-runtime-row]"), controls = line?.querySelectorAll("button") ?? [];
    controls.forEach(control => { control.disabled = true; });
    line?.querySelector("[data-runtime-failed]")?.remove();
    try {
      await request("/api/runtime/runs/decide", { method: "POST", body: { scope_project_id: choice.dataset.scope || null, provider_id: choice.dataset.provider,
        run_id: choice.dataset.run, decision: choice.dataset.runtimeDecide }, fallback: text("decide-failed") });
      if (view) { view = { ...view, missed: view.missed.filter(run => run.run_id !== choice.dataset.run) }; paint(); }
    } catch {
      controls.forEach(control => { control.disabled = false; });
      line?.insertAdjacentHTML("beforeend", `<small class="runtime-failed" role="alert" data-runtime-failed>${escape(text("decide-failed"))}</small>`);
    }
  });
  void load();
}

export {};
