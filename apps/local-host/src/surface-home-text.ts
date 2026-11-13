import type { SurfaceHomeDisplay, SurfaceHomeText } from "@molis-ai/molis-work-design-system";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { isPresentationOverviewReader } from "@molis-ai/molis-work-plugin-sdk/presentation";
import type { HomeReadSample } from "./surface-home-display.js";
import { pluginPagesFor } from "./plugin-page-authority.js";
import { sameInstalledRelease } from "./installed-stage-identity.js";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";

/** At most this many keys from one response's source: a home shows a bounded result, and the grant never grows from later reads. */
const KEYS_PER_SOURCE = 512;

interface Source { owner: string; installation: SurfaceInstallationRef; positions: string[]; keys: Set<string> }

/** Every plugin-owned key in a shown part, by its owner only: the shared and workbench words come from the shell's own packs. */
function ownedKeys(value: unknown, owner: string, into: Set<string>) {
  if (Array.isArray(value)) { for (const item of value) ownedKeys(item, owner, into); return; }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.owner === owner && typeof record.key === "string") into.add(record.key);
  for (const child of Object.values(record)) ownedKeys(child, owner, into);
}

/** The one overview reader whose result a card shows; a card without exactly one has no words of its own to take. */
function cardSource(sample: HomeReadSample, owner: string): SurfaceInstallationRef | undefined {
  const readers = [...sample.views].filter(view => view.provider.plugin_id === owner && isPresentationOverviewReader(view));
  const reader = readers.length === 1 ? readers[0]! : undefined;
  const scope = reader?.provider.project_id ? "project" : "home";
  return reader && sample.catalog.entries.find(entry => entry.plugin.plugin_id === owner && entry.installation.scope === scope
    && entry.installation.install_id === reader.provider.plugin_install_id)?.installation;
}

function shownSources(sample: HomeReadSample, display: SurfaceHomeDisplay): Source[] {
  const sources = new Map<string, Source>();
  const add = (owner: string, installation: SurfaceInstallationRef | undefined, position: string, shown: unknown) => {
    if (!installation) return;
    // One real source can share its key set; two of one owner (a dual plugin's halves, a reinstall) never do.
    const id = JSON.stringify([owner, installation.scope, installation.install_id, installation.installation_generation, installation.manifest_digest]);
    const source = sources.get(id) ?? { owner, installation, positions: [], keys: new Set<string>() };
    sources.set(id, source);
    source.positions.push(position);
    ownedKeys(shown, owner, source.keys);
  };
  for (const group of display.groups) {
    if (group.kind === "plugin" && group.owner_plugin_id) add(group.owner_plugin_id, cardSource(sample, group.owner_plugin_id), "group:" + group.owner_plugin_id, group);
  }
  for (const row of display.display.rows) {
    add(row.owner, row.installation, "row:" + JSON.stringify([row.owner, row.subject.kind, row.subject.id]), row);
  }
  return [...sources.values()].filter(source => source.keys.size > 0 && source.keys.size <= KEYS_PER_SOURCE);
}

/**
 * Word grants for what this home response shows (surface-composition §14.6), issued after its last check. Each binds one exact running
 * source and the keys shown from it; the shell reads them through the locale entry when the language changes, and nothing is composed again.
 */
export function grantSurfaceHomeText(sample: HomeReadSample, display: SurfaceHomeDisplay, scope: {
  home: string; project_id: string; actor_id: string; record(installation: SurfaceInstallationRef): PluginInstanceRecord | null | undefined;
}): { text: SurfaceHomeText[]; release(): void } {
  const pages = pluginPagesFor(scope.home), text: SurfaceHomeText[] = [];
  for (const { owner, installation, positions, keys } of shownSources(sample, display)) {
    const project_id = installation.scope === "home" ? null : scope.project_id;
    const ref = pages.grantText(scope.project_id, { plugin_id: owner, project_id, actor_id: scope.actor_id, install_id: installation.install_id,
      installation_generation: installation.installation_generation }, keys, () => {
      const now = scope.record(installation);
      if (now?.state !== "running" || now.plugin_id !== owner || !sameInstalledRelease(installation, now)) throw new ActionError("actions.forbidden", "首页文字的来源已变化");
    });
    if (ref) text.push({ ref, owner, positions });
  }
  return { text, release: () => pages.releaseText(text.map(item => item.ref), scope.project_id) };
}
