import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "@molis-ai/molis-work-app-workbench";
import { ActionError, findSubjectReader, isSubjectReader, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceDescription, SurfaceGroup, SurfaceItem } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { isPresentationValuesReader, presentationFormFields } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { readSurfaceValues } from "@molis-ai/molis-work-service-surfaces";
import type { HomeDirectoryEntry } from "./surface-home-directory.js";
import type { withSurfaceSample } from "./surface-read-sample.js";

export type HomeReadSample = Awaited<ReturnType<typeof withSurfaceSample<SurfaceDescription>>>;
type ReadValues = (view: ActionView, input: PresentationValuesInput, signal: AbortSignal) => Promise<PresentationValues>;
const key = ({ kind, id }: ActionSubject) => JSON.stringify([kind, id]);
export const homeReference = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
export const homeChanged = () => new ActionError("actions.provider_changed", "原首页内容已变化，请重新读取");

export function homeOwnsView(entry: HomeDirectoryEntry, view: ActionView) {
  return view.provider.kind === "plugin" && view.provider.plugin_id === entry.plugin.plugin_id
    && view.provider.plugin_install_id === entry.installation.install_id && view.action.scope === entry.installation.scope
    && (entry.installation.scope === "project") === (view.provider.project_id !== undefined);
}

export function ownerReader(sample: HomeReadSample, entry: HomeDirectoryEntry, subject: ActionSubject) {
  const matches = sample.directory.filter(view => view.availability.available && homeOwnsView(entry, view)
    && isSubjectReader(view.action) && view.action.subject_kinds.includes(subject.kind));
  return matches.length === 1 ? matches[0] : undefined;
}

export function displayedRoute(sample: HomeReadSample, item: SurfaceItem) {
  const reader = findSubjectReader([...sample.views], item.subject.kind);
  if (reader.found !== "one") return undefined;
  const entry = sample.catalog.entries.find(entry => item.owner_plugin_id === entry.plugin.plugin_id && homeOwnsView(entry, reader.view));
  const object = entry?.plugin.presentation?.objects.find(object => object.kind === item.subject.kind);
  if (!entry || !object) return undefined;
  const values = [...sample.views].filter(view => homeOwnsView(entry, view) && isPresentationValuesReader(view)
    && view.action.subject_kinds.includes(item.subject.kind) && view.availability.available);
  return values.length === 1 ? { entry, reader: reader.view, action: values[0]!, object } : undefined;
}

export function surfaceRow({ entry, subject, object, fields, form }: NonNullable<ReturnType<typeof displayedRoute>> & {
  subject: ActionSubject; fields: readonly string[]; form: SurfaceItem["form"];
}, read: PresentationValues["items"][number] | undefined): SurfaceHomeRowDisplay {
  const values = read?.values && (read.state === "ok" || read.state === "stale")
    ? Object.fromEntries(Object.entries(read.values).filter(([field]) => fields.includes(field))) : undefined;
  return { owner: entry.plugin.plugin_id, subject, installation: entry.installation, declaration: { owner: entry.plugin.plugin_id, kind: object.kind,
    fields: object.fields.filter(field => fields.includes(field.key)), forms: { [form]: { fields } },
    ...(object.status && fields.includes(object.status.field) ? { status: object.status } : {}) },
    read: read ? { revision: read.revision, state: read.state, ...(values ? { values } : {}), ...(read.read_at ? { read_at: read.read_at } : {}) } : { state: "unreadable" } };
}

async function displayRows(sample: HomeReadSample, items: readonly SurfaceItem[], signal: AbortSignal, invoke: ReadValues, peek = false) {
  const routes = items.flatMap(item => {
    const route = displayedRoute(sample, item);
    const form = route && presentationFormFields(route.object, peek ? "peek" : item.form);
    return route && form ? [{ ...route, subject: item.subject, fields: form.fields, form: form.form }] : [];
  });
  if (!routes.length) return [];
  const deadline = sample.deadline;
  if (!deadline) throw homeChanged();
  const current = () => { signal.throwIfAborted(); sample.assertCurrent(); };
  const answers = await readSurfaceValues(routes, { values: invoke }, deadline, current);
  return routes.map(route => {
    const result = answers.get(key(route.subject));
    if (result?.denied || result?.item?.state === "forbidden" || result?.item?.state === "deleted") throw homeChanged();
    return surfaceRow(route, result?.item);
  });
}

export async function projectHomeDisplay(sample: HomeReadSample, signal: AbortSignal, invoke: ReadValues): Promise<SurfaceHomeDisplay> {
  const { description, catalog } = sample;
  const ids = new Set(description.groups.flatMap(group => [...(group.owner_plugin_id ? [group.owner_plugin_id] : []),
    ...group.items.map(item => item.owner_plugin_id)]));
  const owners = Object.fromEntries(catalog.entries.filter(entry => ids.has(entry.plugin.plugin_id))
    .map(entry => [entry.plugin.plugin_id, entry.display]));
  const rows = await displayRows(sample, description.groups.flatMap(group => group.items), signal, invoke);
  return { ...description, display: { owners, rows } };
}

/** Keep private unreadable subjects out of the response, including disabled counts and stale handles. */
export async function projectPositionDisplay(sample: HomeReadSample, groups: readonly SurfaceGroup[], signal: AbortSignal, invoke: ReadValues): Promise<SurfaceHomeDisplay> {
  const shown = groups.map(({ excluded: _excluded, ...group }) => ({ ...group,
    items: group.items.filter(item => item.state === "ok" || item.state === "stale" && item.read_at !== undefined) }));
  const unique = [...new Map(shown.flatMap(group => group.items).map(item => [key(item.subject), item])).values()];
  const rows = (await displayRows(sample, unique, signal, invoke)).filter(row => row.read.state === "ok" || row.read.state === "stale" && row.read.read_at !== undefined);
  const available = new Set(rows.map(row => key(row.subject)));
  const ids = new Set(shown.flatMap(group => group.items.filter(item => available.has(key(item.subject)))
    .flatMap(item => [item.owner_plugin_id, ...item.merged?.map(merge => merge.owner_plugin_id) ?? []])));
  const owners = Object.fromEntries(sample.catalog.entries.filter(entry => ids.has(entry.plugin.plugin_id))
    .map(entry => [entry.plugin.plugin_id, entry.display]));
  return { ...sample.description, groups: shown.map(group => ({ ...group, items: group.items.filter(item => available.has(key(item.subject))) })),
    display: { owners, rows } };
}

export async function projectHomePeek(sample: HomeReadSample, item: SurfaceItem, signal: AbortSignal, invoke: ReadValues) {
  const [row] = await displayRows(sample, [item], signal, invoke, true);
  if (!row) throw homeChanged();
  return row;
}
