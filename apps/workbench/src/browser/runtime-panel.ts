import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";


/**
 * The bundle's entry (dist/runtime-panel-client.js): what runs on its own here (specs/proactive-assistant/resident-runtime-design.md §4),
 * read from `/api/runtime/overview`. In the menu-bar capsule it is the 「运行」 section — running or waiting, what was missed with
 * 「现在做」 and 「跳过」, what comes next, and the confirmation before quitting; on the Home it is only the notice of what was missed.
 * The capsule has the capsule's own sheet, so it is drawn with the section's classes there; the Home draws the catalog's parts. Their
 * markup is written out here rather than taken from the SDK's renderers, whose alert brings the state ring (about 5 KB) into a bundle
 * that is inlined into the page.
 */

interface Run { run_id: string; title: string; due_at: string; project_id: string | null; needs: string[]; waiting?: boolean;
  missed_at?: string; source: { scope_project_id: string | null; provider_id: string; surface: string; title: string } }
interface Gap { from: string; to: string; cause: "quit" | "crash" | "sleep" }
interface Overview { state: "running"; waiting: { network: boolean; model: boolean }; gaps: Gap[]; upcoming: Run[]; missed: Run[] }
interface TauriBridge { core: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> } }

const page = globalThis as typeof globalThis & { molisWorkRequest?: UiRequest; __TAURI__?: TauriBridge; molisWorkRuntimeQuit?: () => void };
const text = (key: string, values?: Record<string, string | number>) => globalThis.t.text(`workbench.runtime-panel.${key}`, values);
const escape = (value: string) => value.replace(/[&<>"']/gu, character => `&#${character.charCodeAt(0)};`);
const NEXT_SHOWN = 5, QUIT_HOURS = 24, REFRESH_MS = 30_000;

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

function waitingLines(view: Overview): Array<{ key: "network" | "model"; count: number }> {
  return (["network", "model"] as const).filter(need => view.waiting[need])
    .map(need => ({ key: need, count: view.upcoming.filter(run => run.needs.includes(need)).length }));
}

/**
 * How the section reaches the Host. The Home page has the shared request client; the capsule does not load it (it is larger than this
 * whole section), so there the desktop reads and decides for it (`runtime_overview`, `runtime_decide`), as it already serves the capsule.
 */
interface RuntimeTransport { overview(): Promise<Overview>; decide(body: Record<string, unknown>): Promise<unknown> }
const transport = (capsule: boolean): RuntimeTransport | null => {
  const bridge = page.__TAURI__, request = page.molisWorkRequest;
  if (capsule) return bridge ? { overview: async () => JSON.parse(String(await bridge.core.invoke("runtime_overview"))) as Overview,
    decide: body => bridge.core.invoke("runtime_decide", body) } : null;
  return request ? { overview: async () => await request("/api/runtime/overview") as Overview,
    decide: body => request("/api/runtime/runs/decide", { method: "POST", body, fallback: text("decide-failed") }) } : null;
};

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

// ---- the capsule: its own section, on the capsule's tokens ----
function row(title: string, caption: string, end: string, id?: string): string {
  return `<li class="runtime-panel__row"${id ? ` data-runtime-row="${escape(id)}"` : ""}><span class="runtime-panel__copy"><strong>${escape(title)}</strong>${caption ? `<small>${escape(caption)}</small>` : ""}</span><span class="runtime-panel__end">${end}</span></li>`;
}
const button = (label: string, attrs: Record<string, string>, primary = false) =>
  `<button type="button" class="capsule__button${primary ? " capsule__button--primary" : ""} runtime-panel__button"${attributes(attrs)}>${escape(label)}</button>`;

function renderCapsule(view: Overview, handled: boolean, quitting: boolean): string {
  const waits = waitingLines(view);
  const status = `<p class="runtime-panel__status" data-tone="${waits.length ? "waiting" : "running"}"><i aria-hidden="true"></i>${escape(waits.length ? text(waits[0]!.key === "network" ? "offline" : "no-model") : text("running"))}</p>`;
  if (quitting) {
    const until = Date.now() + QUIT_HOURS * 3_600_000, coming = view.upcoming.filter(run => Date.parse(run.due_at) < until);
    const shown = coming.slice(0, NEXT_SHOWN).map(run => row(run.title, run.source.title, `<span class="runtime-panel__time">${escape(when(run.due_at))}</span>`)).join("");
    const more = coming.length > NEXT_SHOWN ? `<p class="runtime-panel__more">${escape(text("more", { count: coming.length - NEXT_SHOWN }))}</p>` : "";
    return `<div class="runtime-panel__notice" data-tone="warning" role="alertdialog" aria-labelledby="runtime-quit-title"><strong id="runtime-quit-title">${escape(text("quit-title"))}</strong><ul class="runtime-panel__rows">${shown}</ul>${more}<div class="runtime-panel__actions">${button(text("cancel"), { "data-runtime-quit": "cancel" })}${button(text("quit"), { "data-runtime-quit": "confirm" }, true)}</div></div>`;
  }
  const missed = view.missed.length
    ? `<div class="runtime-panel__notice" data-tone="warning"><strong>${escape(missedTitle(view))}</strong><ul class="runtime-panel__rows">${view.missed.map(run => row(run.title, `${run.source.title} · ${when(run.due_at)}`, button(text("run-now"), decideAttrs(run, "run_now"), true) + button(text("skip"), decideAttrs(run, "skip")), run.run_id)).join("")}</ul></div>`
    : handled ? `<div class="runtime-panel__notice" data-tone="success"><strong>${escape(text("all-handled"))}</strong></div>` : "";
  const waiting = waits.map(line => `<div class="runtime-panel__notice" data-tone="warning"><strong>${escape(text(line.key === "network" ? "network-waiting" : "model-waiting", { count: line.count }))}</strong>${line.key === "model" ? `<a class="runtime-panel__link" href="/settings/models" data-runtime-open="/settings/models">${escape(text("open-models"))}</a>` : ""}</div>`).join("");
  const next = view.upcoming.slice(0, NEXT_SHOWN).map(run => row(run.title, run.source.title, run.waiting
    ? `<span class="runtime-panel__waiting">${escape(text("waiting"))}</span>` : `<span class="runtime-panel__time">${escape(when(run.due_at))}</span>`)).join("");
  const upcoming = next ? `<section class="runtime-panel__next" aria-labelledby="runtime-next-title"><h3 id="runtime-next-title">${escape(text("next"))}</h3><ul class="runtime-panel__rows">${next}</ul></section>` : "";
  return `${status}${missed}${waiting}${upcoming}`;
}

const root = document.querySelector<HTMLElement>("[data-runtime-panel]"), host = transport(root?.dataset.mode === "capsule");
if (root && host) {
  const capsule = root.dataset.mode === "capsule", body = root.querySelector<HTMLElement>("[data-runtime-body]")!;
  let view: Overview | null = null, hadMissed = false, quitting = new URLSearchParams(location.search).get("quit") === "1", timer: ReturnType<typeof setTimeout> | null = null;
  const paint = () => {
    if (!view) return;
    // Nothing would stop by quitting in the next day: no list to read, it quits at once.
    if (capsule && quitting && !view.upcoming.some(run => Date.parse(run.due_at) < Date.now() + QUIT_HOURS * 3_600_000)) {
      page.__TAURI__?.core.invoke("runtime_quit_confirmed").catch(() => undefined);
      return;
    }
    const handled = hadMissed && !view.missed.length;
    body.innerHTML = capsule ? renderCapsule(view, handled, quitting) : renderHome(view, handled);
    root.hidden = !body.innerHTML;
    // The menu bar's dot: there are missed runs the person has not decided on.
    if (capsule) page.__TAURI__?.core.invoke("runtime_missed_dot", { missed: view.missed.length > 0 }).catch(() => undefined);
  };
  const load = async () => {
    if (timer) { clearTimeout(timer); timer = null; }
    try { view = await host.overview(); hadMissed ||= view.missed.length > 0; paint(); }
    catch { /* the Host is not answering: the capsule's own error and the native 「没在运行」 page say so */ }
    if (capsule && !document.hidden) timer = setTimeout(() => void load(), REFRESH_MS);
  };
  body.addEventListener("click", async event => {
    const target = event.target as Element | null;
    const choice = target?.closest<HTMLButtonElement>("[data-runtime-decide]");
    if (choice) {
      const line = choice.closest<HTMLElement>("[data-runtime-row]"), controls = line?.querySelectorAll("button") ?? [];
      controls.forEach(control => { control.disabled = true; });
      line?.querySelector("[data-runtime-failed]")?.remove();
      try {
        await host.decide({ scope_project_id: choice.dataset.scope || null, provider_id: choice.dataset.provider, run_id: choice.dataset.run, decision: choice.dataset.runtimeDecide });
        if (view) { view = { ...view, missed: view.missed.filter(run => run.run_id !== choice.dataset.run) }; paint(); }
      } catch {
        controls.forEach(control => { control.disabled = false; });
        line?.insertAdjacentHTML("beforeend", `<small class="runtime-failed" role="alert" data-runtime-failed>${escape(text("decide-failed"))}</small>`);
      }
      return;
    }
    const quit = target?.closest<HTMLElement>("[data-runtime-quit]");
    if (quit) {
      if (quit.dataset.runtimeQuit === "confirm") { await page.__TAURI__?.core.invoke("runtime_quit_confirmed").catch(() => undefined); return; }
      quitting = false; paint(); page.__TAURI__?.core.invoke("capsule_hide").catch(() => undefined);
      return;
    }
    const open = target?.closest<HTMLElement>("[data-runtime-open]");
    if (open && capsule && page.__TAURI__) { event.preventDefault(); page.__TAURI__.core.invoke("capsule_open_main", { path: open.dataset.runtimeOpen }).catch(() => undefined); }
  });
  // The desktop asks before quitting (the tray's 「退出」 and ⌘Q): the capsule shows what will not run, then quits only on 「退出」.
  page.molisWorkRuntimeQuit = () => { quitting = true; void load(); };
  if (capsule) document.addEventListener("visibilitychange", () => { if (!document.hidden) void load(); else if (timer) { clearTimeout(timer); timer = null; } });
  void load();
}

export {};
