import { createHash } from "node:crypto";
import { actionEffect, type ActionProvider, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginReadGroupDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { TaskGrantCategory, TaskGrantCategoryReference, TaskGrantCategoryState } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import type { McpActionGrant, McpToolPreference } from "./mcp-settings-store.js";

// What a task grant subject may read, worked out from the catalog and the providers' Manifests as they are now
// (specs/proactive-assistant/schedule-task-reads.md §3.2, §10 C1). A grant is still kept one record per action, in the shape every
// MCP client's grant has; which category a record belongs to is read from the provider's current read groups, never stored. So a
// provider that drops a group, or a provider that starts declaring groups, takes the actions it no longer offers out of every task at
// once: they are not readable, and `list` shows them as one `removed` category of that provider.

/** What a provider's Manifest says about itself (its `summary`) and its read groups; `{}` for a provider the Host registers itself. */
export interface ProviderDeclaration {
  readonly description?: string;
  readonly read_groups?: readonly PluginReadGroupDeclaration[];
}
/**
 * A provider's declaration now. `null`: it is a plugin whose Manifest cannot be read, so whether it declares groups is not known and it
 * offers a task nothing (read as a whole provider, it might give a task what its groups keep back).
 */
export type DeclarationOf = (provider: Pick<ActionProvider, "provider_id"> & Partial<Pick<ActionProvider, "kind">>) => ProviderDeclaration | null;

/** A category this project offers now and the actions turning it on records. */
export interface OfferedCategory {
  readonly category: TaskGrantCategory;
  readonly members: readonly ActionView[];
}

const TEXT_LIMIT = 2000;
const words = (value: string) => value.length > TEXT_LIMIT ? value.slice(0, TEXT_LIMIT) : value;

/** A task can be given only what an agent may call and what only reads: a query whose effect is `read` (G3, as for the Home's aggregates). */
export function readableByTask(view: ActionView): boolean {
  return view.action.audiences.includes("agent") && view.operation === "query" && actionEffect(view.action, view.capability_id) === "read";
}

/** The group an action is in under its provider's declaration now: `""` for a provider without groups, undefined when it gives the action to no task. */
function groupOf(capabilityId: string, declaration: ProviderDeclaration | null): string | undefined {
  const groups = declaration?.read_groups;
  if (!groups?.length) return "";
  return groups.find(group => group.actions.includes(capabilityId))?.group_id;
}

/** What a task may be authorized for now: readable actions in a current category. Every check of a task's calls reads the catalog through this. */
export function taskReadableCatalog(views: readonly ActionView[], declarationOf: DeclarationOf): ActionView[] {
  return views.filter(view => {
    const declaration = declarationOf(view.provider);
    return declaration !== null && readableByTask(view) && groupOf(view.capability_id, declaration) !== undefined;
  });
}

function byProvider(views: readonly ActionView[]): Map<string, ActionView[]> {
  const providers = new Map<string, ActionView[]>();
  for (const view of views) providers.set(view.provider.provider_id, [...providers.get(view.provider.provider_id) ?? [], view]);
  return providers;
}

/** A provider's own words: its Manifest's summary, or (a provider without one) what its readable actions are called. */
function providerCategory(providerId: string, views: readonly ActionView[], declaration: ProviderDeclaration | null): TaskGrantCategory {
  const provider = views[0]?.provider;
  const description = declaration?.description ?? [...new Set(views.filter(readableByTask).map(view => view.action.title))].join("、");
  return { provider_id: providerId, ...(provider?.plugin_id ? { plugin_id: provider.plugin_id } : {}), title: words(provider?.title ?? providerId), description: words(description) };
}

function groupCategory(whole: TaskGrantCategory, group: PluginReadGroupDeclaration): TaskGrantCategory {
  return { provider_id: whole.provider_id, group_id: group.group_id, ...(whole.plugin_id ? { plugin_id: whole.plugin_id } : {}), title: words(group.title), description: words(group.description) };
}

/** The categories this project offers now, each with its readable actions; a group none of whose actions is registered now is not offered. */
export function offeredCategories(views: readonly ActionView[], declarationOf: DeclarationOf): OfferedCategory[] {
  const offered: OfferedCategory[] = [];
  for (const [providerId, all] of byProvider(views)) {
    const declaration = declarationOf(all[0]?.provider ?? { provider_id: providerId }), readable = taskReadableCatalog(all, () => declaration);
    if (!readable.length) continue;
    const whole = providerCategory(providerId, all, declaration), groups = declaration?.read_groups;
    if (!groups?.length) { offered.push({ category: whole, members: readable }); continue; }
    for (const group of groups) {
      const members = readable.filter(view => group.actions.includes(view.capability_id));
      if (members.length) offered.push({ category: groupCategory(whole, group), members });
    }
  }
  return offered;
}

/** The one category a reference names now, or undefined: an unknown provider or group, a removed one, or no group for a provider that declares some (C3). */
export function namedCategory(offered: readonly OfferedCategory[], reference: TaskGrantCategoryReference): OfferedCategory | undefined {
  return offered.find(entry => entry.category.provider_id === reference.provider_id && entry.category.group_id === reference.group_id);
}

/** Which category a reference names, as one key: its provider, and its group or `""` for a whole provider. */
export const categoryKey = (reference: TaskGrantCategoryReference): string => JSON.stringify([reference.provider_id, reference.group_id ?? ""]);

/**
 * A subject's records by the category they stand for now (`categoryKey`), bucketed as `subjectCategories` reads them: a provider's
 * declaration comes from its installation whether or not its actions are in the catalog now. Records of a removed category are under
 * their provider with no group, as `list` names that row (a provider with groups has no whole category, so the key is never another's).
 */
export function recordedCategories(records: readonly McpActionGrant[], views: readonly ActionView[], declarationOf: DeclarationOf): Map<string, McpActionGrant[]> {
  const providers = byProvider(views), held = new Map<string, McpActionGrant[]>();
  for (const grant of records) {
    const group = groupOf(grant.capability_id, declarationOf(providers.get(grant.provider_id)?.[0]?.provider ?? { provider_id: grant.provider_id }));
    const key = JSON.stringify([grant.provider_id, group ?? ""]);
    held.set(key, [...held.get(key) ?? [], grant]);
  }
  return held;
}

const samePermissions = (grant: McpActionGrant, view: ActionView) => grant.permissions.length === new Set(view.action.permissions).size
  && view.action.permissions.every(permission => grant.permissions.includes(permission));

/** The record still says what the action is: same version, provider and accepted permissions, for this project or, for a Home action, the Home. */
function recordMatches(grant: McpActionGrant, view: ActionView, projectId: string): boolean {
  return grant.enabled && grant.capability_id === view.capability_id && grant.version === view.version && grant.provider_id === view.provider.provider_id
    && grant.project_id === (view.action.scope === "home" ? null : projectId) && samePermissions(grant, view);
}

/**
 * The categories a subject's records stand for now, each with its state. `granted`: every readable action of the category has a
 * matching record. `needs_confirmation`: one has none (the provider added it, or changed its version or permissions). `unavailable`:
 * none of the category's actions is in the catalog now (the provider is off or gone), or a recorded one is there but cannot be called
 * now; the records stay and read again when it is back unchanged. `removed`: the provider's declaration gives the recorded actions to
 * no task any more; the row names the provider.
 */
export function subjectCategories(records: readonly McpActionGrant[], views: readonly ActionView[], declarationOf: DeclarationOf, projectId: string): TaskGrantCategoryState[] {
  const providers = byProvider(views), states: TaskGrantCategoryState[] = [];
  const recorded = new Map<string, McpActionGrant[]>();
  for (const grant of records) if (grant.enabled) recorded.set(grant.provider_id, [...recorded.get(grant.provider_id) ?? [], grant]);
  for (const [providerId, grants] of recorded) {
    const present = providers.get(providerId) ?? [], declaration = declarationOf(present[0]?.provider ?? { provider_id: providerId });
    const whole = providerCategory(providerId, present, declaration), readable = taskReadableCatalog(present, () => declaration);
    const buckets = new Map<string | undefined, McpActionGrant[]>();
    for (const grant of grants) { const group = groupOf(grant.capability_id, declaration); buckets.set(group, [...buckets.get(group) ?? [], grant]); }
    for (const [group, held] of buckets) {
      if (group === undefined) { states.push({ ...whole, status: "removed" }); continue; }
      const declared = group ? declaration?.read_groups?.find(entry => entry.group_id === group) : undefined;
      const members = readable.filter(view => groupOf(view.capability_id, declaration) === group);
      const matched = members.filter(view => held.some(grant => recordMatches(grant, view, projectId)));
      const status = !members.length || matched.some(view => !view.availability.available) ? "unavailable"
        : matched.length < members.length ? "needs_confirmation" : "granted";
      states.push({ ...(declared ? groupCategory(whole, declared) : whole), status });
    }
  }
  return states;
}

/** Opaque, from the subject's records as written (with their generations); `""` for a subject without records. */
export function subjectRevision(preference: McpToolPreference, clientId: string): string {
  const rows = preference.action_grants.filter(grant => grant.client_id === clientId)
    .map(grant => JSON.stringify([grant.capability_id, grant.version, grant.provider_id, grant.project_id, grant.enabled, [...grant.permissions].sort(), grant.generation]))
    .sort();
  return rows.length ? createHash("sha256").update(rows.join("\n")).digest("hex").slice(0, 32) : "";
}
