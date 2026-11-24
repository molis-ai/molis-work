import { activeLocale } from "./web-locale.js";
import type { ActionSubject, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { isPresentationValuesReader, presentationFormFields } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { renderPresentationForm, stateRingFamily } from "@molis-ai/molis-work-plugin-sdk/ui";
import { readSurfaceValues, startSurfaceRead } from "@molis-ai/molis-work-service-surfaces";
import type { ProjectPluginHost } from "./project-plugin-ports.js";
import { scopeInstallationsFor } from "./scope-installations.js";

/** Both item surfaces render the same installations that can declare an item source in mainlineHost. */
export async function mainlinePresentations(
  plugins: ProjectPluginHost,
  projectId: string,
  client: BoundActionClient,
  subjects: ActionSubject[],
  signal: AbortSignal,
) {
  const rows = new Map<string, { markup: string; done: boolean }>();
  if (!subjects.length) return rows;
  const [{ installations }, directory] = await Promise.all([
    scopeInstallationsFor(plugins, projectId),
    client.discover(),
  ]);
  const routes = subjects.flatMap((subject) => {
    const candidates = installations.flatMap((install) => {
      const { record, manifest } = install;
      if (record.state !== "running") return [];
      const object = manifest?.presentation?.objects.find((entry) => entry.kind === subject.kind);
      const form = object && presentationFormFields(object, "row");
      if (!object || !form) return [];
      return directory
        .filter(
          (action) =>
            action.provider.plugin_install_id === record.install_id &&
            action.provider.plugin_id === record.plugin_id &&
            isPresentationValuesReader(action) &&
            action.action.subject_kinds.includes(subject.kind) &&
            action.availability.available,
        )
        .map((action) => ({
          install,
          object: { ...object, owner: record.plugin_id },
          subject,
          action,
          fields: form.fields,
        }));
    });
    return candidates.length === 1 ? candidates : [];
  });
  const deadline = startSurfaceRead(signal);
  try {
    const current = () => {
      signal.throwIfAborted();
    };
    const answers = await readSurfaceValues(
      routes,
      {
        values: (action, input, signal) =>
          client.invoke<PresentationValuesInput, PresentationValues>(
            {
              capability_id: action.capability_id,
              version: action.version,
              operation: action.operation,
              action: action.action,
              provider_id: action.provider.provider_id,
            },
            input,
            { signal, query_only: true, beforeEffect: async () => signal.throwIfAborted() },
          ),
      },
      deadline,
      current,
    );
    current();
    for (const { install, object, subject, action } of routes) {
      install.assertCurrent();
      const read = answers.get(JSON.stringify([subject.kind, subject.id]))?.item;
      if (!read || read.state !== "ok") continue;
      const status = object.status,
        raw = status && read.values?.[status.field];
      const ring =
        status && typeof raw === "string" && Object.hasOwn(status.map, raw) ? status.map[raw]?.ring : undefined;
      const markup = renderPresentationForm(object, "row", {
        locale: activeLocale(),
        ownerDisplay: { name: action.provider.title },
        read,
      });
      rows.set(subject.kind + ":" + subject.id, { markup, done: Boolean(ring && stateRingFamily(ring) === "done") });
    }
    return rows;
  } finally {
    deadline.dispose();
  }
}
