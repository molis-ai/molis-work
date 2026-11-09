import { actionReachesAudience, requireSynchronous, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PresentationOverview, PresentationOverviewDeclaration } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceGroup, SurfaceHomeEnable, SurfaceHomeStart, SurfaceInstallationRef, SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";
import { isPresentationOverviewReader, presentationOverviewProblems } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { tryOwnedTextRef } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ComposeRead } from "./composition.js";
import { composeObjects, groupState, readAttention, retainDisplayedOperations, type ObjectSource } from "./objects.js";
import { directoryAction, ownsView } from "./operations.js";
import { subjectKey, viewKey, viewRef, viewRevision, type SurfaceHomePlugin, type SurfaceHomePorts, type SurfacePlugin } from "./ports.js";

type HomePlugin = SurfacePlugin & { home: SurfaceHomePlugin };
const isHomePlugin = (plugin: SurfacePlugin): plugin is HomePlugin => plugin.home !== undefined;

interface OverviewJob {
  plugin: HomePlugin;
  declaration: PresentationOverviewDeclaration;
  view: ActionView;
}

interface OverviewAnswer {
  job: OverviewJob;
  summary: OwnedTextRef;
  note?: OwnedTextRef;
  answer: PresentationOverview;
}

const installation = (plugin: HomePlugin): SurfaceInstallationRef => {
  const { scope, install_id, home: { installation_generation, version, manifest_digest } } = plugin;
  return { scope, install_id, installation_generation, version, manifest_digest };
};
const refOf = (target: { capability_id: string; version: number }) => target.capability_id + "@" + target.version;
const matchesReference = (target: ExactActionReference, view: ActionView) =>
  target.capability_id === view.capability_id && target.version === view.version && target.provider_id === view.provider.provider_id;
const usable = (view: ActionView) => view.availability.available && actionReachesAudience(view.action, view.capability_id, "user");

function scopedViews(views: readonly ActionView[], plugin: HomePlugin, ref: string): ActionView[] {
  return views.filter(view => viewRef(view) === ref && view.action.scope === plugin.scope && ownsView(plugin, view));
}

function authorizedView(matches: readonly ActionView[], considered: Set<ActionView>): ActionView | undefined {
  for (const view of matches) considered.add(view);
  return matches.length === 1 && usable(matches[0]!) ? matches[0] : undefined;
}

function groupInstallations(plugins: readonly SurfacePlugin[]) {
  const groups = new Map<string, HomePlugin[]>();
  for (const plugin of plugins) {
    if (!isHomePlugin(plugin)) continue;
    const group = groups.get(plugin.plugin_id);
    if (group) group.push(plugin);
    else groups.set(plugin.plugin_id, [plugin]);
  }
  return groups;
}

async function readOverviews(read: ComposeRead, home: SurfaceHomePorts, groups: ReadonlyMap<string, HomePlugin[]>, considered: Set<ActionView>) {
  const jobs = [...groups.values()].flatMap(entries => {
    const matches: OverviewJob[] = [];
    for (const plugin of entries) {
      const declaration = plugin.presentation?.overview;
      if (plugin.state !== "running" || plugin.home.unavailable || !declaration) continue;
      for (const view of scopedViews(read.views, plugin, refOf(declaration))) {
        considered.add(view);
        if (usable(view) && isPresentationOverviewReader(view)) matches.push({ plugin, declaration, view });
      }
    }
    return matches.length === 1 ? matches : [];
  });
  read.retain(jobs.map(job => job.view));
  const overviews = new Map<string, OverviewAnswer>();
  await read.deadline.read(jobs, read.current, ({ view }, signal) => home.overview(view, signal, read.current), (job, result) => {
    const owner = job.plugin.plugin_id;
    if ("value" in result) {
      const answer = result.value;
      const summary = tryOwnedTextRef(answer.summary, owner);
      if (summary && !presentationOverviewProblems(job.declaration, answer).length) {
        const note = job.declaration.note && tryOwnedTextRef(job.declaration.note, owner);
        overviews.set(owner, { job, answer, summary, ...(note ? { note } : {}) });
        return;
      }
    }
    read.ports.diagnostic?.("overview_unavailable", { plugin_id: owner, provider_id: job.view.provider.provider_id, ref: viewRef(job.view) });
  });
  return overviews;
}

function openFor(entries: readonly HomePlugin[]): SurfacePluginCard["open"] {
  const selected = entries.filter(plugin => plugin.state === "running" && plugin.home.stage_view_id);
  if (selected.length !== 1) return undefined;
  const plugin = selected[0]!;
  return { kind: "stage", installation: installation(plugin), view_id: plugin.home.stage_view_id! };
}

function startsFor(overview: OverviewAnswer, read: ComposeRead, home: SurfaceHomePorts, considered: Set<ActionView>, used: ActionView[]): SurfaceHomeStart[] {
  const { job: { plugin, declaration }, answer } = overview;
  const starts: SurfaceHomeStart[] = [];
  for (const target of answer.start) {
    const ref = refOf(target);
    const declared = declaration.start?.find(item => refOf(item) === ref);
    if (!declared) continue;
    const view = authorizedView(scopedViews(read.views, plugin, ref), considered);
    if (!view) continue;
    const form = declared.open;
    const base = { action: directoryAction(view, starts.length === 0), installation: installation(plugin) };
    if (form) {
      if (!plugin.home.forms?.some(actual => matchesReference(actual.action, view) && actual.view_id === form.view_id && actual.panel === form.panel)) continue;
      starts.push({ ...base, kind: "form", view_id: form.view_id, panel: form.panel });
    } else {
      if (!requireSynchronous(home.acceptsEmptyInput(view))) continue;
      starts.push({ ...base, kind: "invoke" });
    }
    used.push(view);
  }
  return starts;
}

function enableFor(entries: readonly HomePlugin[], read: ComposeRead, used: ActionView[], considered: Set<ActionView>): SurfaceHomeEnable | undefined {
  const candidates = entries.filter(plugin => plugin.home.enable);
  if (candidates.length !== 1) return undefined;
  const plugin = candidates[0]!, enable = plugin.home.enable!;
  const release = installation(plugin);
  if (enable.kind === "home_plugin_settings") {
    return release.scope === "home" ? { kind: enable.kind, installation: { ...release, scope: "home" } } : undefined;
  }
  if (release.scope !== "project") return undefined;
  const view = authorizedView(read.views.filter(view => matchesReference(enable.action, view) && view.provider.kind === "system"
    && view.action.scope === "project" && view.operation === "command"), considered);
  if (!view) return undefined;
  used.push(view);
  const base = { installation: { ...release, scope: "project" as const }, action: directoryAction(view, true) };
  return enable.kind === "project_membership" ? { ...base, kind: enable.kind, expected_revision: enable.expected_revision } : { ...base, kind: enable.kind };
}

interface CardPlan {
  owner: string;
  order: number;
  state: SurfaceGroup["state"];
  card: SurfacePluginCard;
}

function cardPlans(read: ComposeRead, home: SurfaceHomePorts, groups: ReadonlyMap<string, HomePlugin[]>, overviews: ReadonlyMap<string, OverviewAnswer>,
  considered: Set<ActionView>): CardPlan[] {
  const used: ActionView[] = [];
  const plans = [...groups].map(([owner, entries]): CardPlan => {
    const order = Math.min(...entries.map(plugin => plugin.home.order));
    const overview = overviews.get(owner);
    const open = openFor(entries);
    const card: SurfacePluginCard = open ? { open } : {};
    if (entries.every(plugin => plugin.state === "disabled" && !plugin.home.unavailable)) {
      const enable = enableFor(entries, read, used, considered);
      return { owner, order, state: "disabled", card: enable ? { enable } : {} };
    }
    if (overview) {
      const start = startsFor(overview, read, home, considered, used);
      return { owner, order, state: "ok", card: { ...card, summary: overview.summary, ...(overview.note ? { note: overview.note } : {}), ...(start.length ? { start } : {}) } };
    }
    const undeclared = entries.some(plugin => plugin.state === "running" && !plugin.home.unavailable) && entries.every(plugin => !plugin.presentation?.overview);
    return { owner, order, state: undeclared ? "undeclared" : "unreadable", card };
  });
  read.retain(used);
  return plans;
}

export async function composeHome(read: ComposeRead, home: SurfaceHomePorts) {
  const attention = readAttention(read);
  const groups = groupInstallations(read.plugins);
  const considered = new Set<ActionView>();
  const overviews = await readOverviews(read, home, groups, considered);
  const cards = cardPlans(read, home, groups, overviews, considered);
  // The completion order of parallel overview reads must not order objects or revisions.
  const sources = [...groups.keys()].flatMap(owner => {
    const overview = overviews.get(owner);
    return overview?.answer.subjects.map(subject => ({ subject, kind: "overview", plugin: overview.job.plugin } satisfies ObjectSource)) ?? [];
  });
  const objects = await composeObjects(read, [...attention.sources, ...sources]);
  const attentionRows = objects.visible.filter(row => row.attention);
  const above = new Set(attentionRows.flatMap(({ item }) => [subjectKey(item.subject), ...(item.merged ?? []).map(entry => subjectKey(entry.subject))]));
  const attended = new Set(objects.readable.filter(row => row.attention).map(row => row.item.owner_plugin_id));
  const pinned = new Map(read.request.home_order?.map((owner, index) => [owner, index]));
  const rank = (owner: string) => pinned.get(owner) ?? pinned.size;
  cards.sort((a, b) => Number(attended.has(b.owner)) - Number(attended.has(a.owner))
    || rank(a.owner) - rank(b.owner) || a.order - b.order || compareCodeUnits(a.owner, b.owner));
  const attentionGroup: SurfaceGroup = { kind: "attention", ...groupState(attentionRows, attention.unreadable || objects.unreadableAttention),
    items: attentionRows.map(row => row.item), ...(objects.excluded ? { excluded: objects.excluded } : {}) };
  const displayed = [...attentionRows];
  const pluginGroups = cards.map(({ owner, state, card }): SurfaceGroup => {
    const rows = objects.visible.filter(row => !row.attention && row.inOverview && row.item.owner_plugin_id === owner);
    displayed.push(...rows);
    const count = objects.readable.filter(row => row.inOverview && row.item.owner_plugin_id === owner && above.has(subjectKey(row.item.subject))).length;
    return { kind: "plugin", owner_plugin_id: owner, ...(state === "ok" ? groupState(rows, objects.unreadableOwners.has(owner)) : { state }),
      items: rows.map(row => row.item), plugin_card: card, ...(count ? { hidden_above: { count, label: home.hiddenAboveLabel(count) } } : {}) };
  });
  const catalog = read.plugins.map(plugin => [plugin.plugin_id, plugin.scope, plugin.install_id, plugin.state, plugin.revision, plugin.home])
    .sort((a, b) => compareCodeUnits(JSON.stringify(a), JSON.stringify(b)));
  const cardAuthority = [...considered].sort((a, b) => compareCodeUnits(viewKey(a), viewKey(b))).map(viewRevision);
  return { groups: [attentionGroup, ...pluginGroups], facts: { ...objects.facts, catalog, cardAuthority, operations: retainDisplayedOperations(read, displayed) } };
}
