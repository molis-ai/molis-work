import { installArrange } from "./arrange.js";
import { installControls } from "./controls.js";
import { installDirectory } from "./directory.js";
import { installDocument, installPageEvents } from "./document.js";
import { installMaterial } from "./material.js";
import { reading } from "./reading.js";
import { installResult } from "./result.js";
import { load } from "./snapshot.js";
import { stageBusy } from "./model.js";
import { installTui } from "./tui.js";
import type { ShelfHost, ShelfPage } from "./types.js";

/**
 * The Shelf page: materials in, results out, a command bar that runs actions on the copies. Built with esbuild into the plugin's
 * client pack (src/client.ts reads the bundle); type-checked by tsconfig.browser.json.
 */
export function shelfClient(host: ShelfHost): void {
  const directory = document.querySelector<HTMLElement>("[data-shelf=directory]");
  const bench = document.querySelector<HTMLElement>("[data-shelf=workbench]");
  if (!directory || !bench) return;
  const lifetime = host.mountPluginClient(bench);
  if (!lifetime) return;
  const stage = bench.querySelector<HTMLElement>("[data-shelf-stage]");
  const preview = bench.querySelector<HTMLElement>("[data-shelf-preview]");
  const bar = bench.querySelector<HTMLElement>("[data-shelf-bar]");
  if (!stage || !preview || !bar) return;
  const page: ShelfPage = {
    host, L: host.translate, lifetime, directory, bench, stage, preview, bar, reading,
    stageWorkspace: bench.querySelector<HTMLElement>("[data-shelf-stage-workspace]"),
    fileInput: bench.querySelector<HTMLInputElement>("[data-shelf-file]"),
    search: bench.querySelector<HTMLInputElement>("[data-shelf-search]"),
    projectPrefix: document.body.dataset.routePrefix || "",
    api: host.pluginRoute(""),
    hintDefault: bench.querySelector("[data-shelf-bar-hint]")?.textContent || "",
    snapshot: { materials: [], results: [], clipboard: [], recipes: [], current_clip_id: null, runtime: null },
    selected: null, selection: new Set(), pending: null, choices: {}, runningJob: null, selectedChild: null, openFolders: new Set(), runWatch: null,
    selClip: null, clipSelection: new Set(), clipExpanded: false, compare: false, compareSourceId: null,
    editing: false, editLoading: false, editDraft: "", textCache: new Map(), textVersion: 0, editTimer: 0, arranging: false,
    lastBarKind: "empty", stickyHint: "", admitRetry: null, materialPreview: null, materialTicket: 0, editWrites: Promise.resolve(),
    multiMode: false, composingAction: false, loadVersion: 0, wantedId: null, findTimer: 0, dragSlot: "", dragOrder: null,
  };
  installDirectory(page);
  installControls(page);
  installArrange(page);
  installTui(page);
  installMaterial(page);
  installResult(page);
  installDocument(page);
  installPageEvents(page);
  lifetime.whenVisible((signal) => {
    if (!page.editing && !page.editLoading && !stageBusy(page)) void load(page, undefined, signal).catch(() => undefined);
    return () => { page.loadVersion++; };
  });
}
