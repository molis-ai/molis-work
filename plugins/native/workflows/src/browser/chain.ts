import type { WorkflowLink } from "../model.js";
import { uid } from "./dom.js";
import type { ActionRef, Chain } from "./types.js";

export const DEFAULT_BODY_TOKEN = "{正文}";

/** The chain rules the page edits with. New links default to direct pass-through (PF-A13) so no template syntax is needed. */
export const handLink = (): WorkflowLink => ({ kind: "function", title_template: "", body_template: DEFAULT_BODY_TOKEN, instructions: "" });
export const tint = (plugin: string) => `var(--plugin-${plugin}, var(--muted))`;
export const ruleKey = (ref: ActionRef | null | undefined) => ref ? `${ref.capability_id}@${ref.version}@${ref.provider_id}` : "";

export function insertStn(chain: Chain, gap: number, plugin: string, id?: string): Chain {
  const stations = [...chain.stations], links = [...chain.links];
  const at = Math.max(0, Math.min(gap, stations.length));
  stations.splice(at, 0, { station_id: id || uid(), plugin });
  if (stations.length === 1) return { stations, links: [] };
  if (at === 0) links.unshift(handLink()); else if (at === stations.length - 1) links.push(handLink()); else links.splice(at, 0, handLink());
  return { stations, links };
}

export function removeStn(chain: Chain, index: number): Chain {
  const last = chain.stations.length - 1;
  const stations = chain.stations.filter((_, at) => at !== index), links = [...chain.links];
  if (links.length) links.splice(index === 0 ? 0 : index === last ? last - 1 : index, 1);
  return { stations, links };
}

export function moveStation(chain: Chain, from: number, gap: number): Chain {
  if (gap === from || gap === from + 1) return chain;
  const station = chain.stations[from]!;
  const removed = removeStn(chain, from);
  const at = gap > from ? gap - 1 : gap;
  const inserted = insertStn(removed, at, station.plugin);
  inserted.stations[at] = station;
  return inserted;
}
