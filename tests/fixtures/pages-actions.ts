import { readMaterialUploads } from "../../apps/local-host/dist/material-documents.js";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesErrors, pagesManifest, createPagesActionHandlers, createPagesContentHandlers, ownPagesStores, preparePagesImport, PAGES_ACTION_PERMISSIONS,
  type PagesImportFile, type PagesStore, type PagesActionPorts, type PreparedPagesImport } from "@molis-ai/molis-work-plugin-pages";

/**
 * The Host's reader of uploaded files with Pages' own conversion: what the Runtime's `materials.readDocuments` and the plugin's
 * `prepareImport` do together, for plugin tests that run the handlers without a Runtime.
 */
export async function preparePagesFileImport(files: readonly PagesImportFile[], options: { signal?: AbortSignal } = {}): Promise<PreparedPagesImport> {
  try {
    const materials = await readMaterialUploads(files.map(file => ({ file_name: file.name, data_base64: file.data })), options);
    options.signal?.throwIfAborted();
    return preparePagesImport(materials);
  } catch (error) {
    options.signal?.throwIfAborted();
    // The extractor's own failures are read by their code, as the plugin's `prepareImport` does.
    const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
    if (error instanceof Error && typeof code === "string" && code.startsWith("material.")) throw pagesErrors.invalid(error.message);
    throw error;
  }
}

type CompleteOptions = Parameters<NonNullable<PagesActionPorts["complete"]>>[1];
interface PagesTestOptions extends Pick<PagesActionPorts, "publishArtifact"> {
  /** The model's text; a test that needs the whole result (or its commit guard) passes `complete` instead. */
  readonly completeText?: (prompt: Parameters<NonNullable<PagesActionPorts["complete"]>>[0], options: CompleteOptions) => Promise<string>;
  readonly complete?: PagesActionPorts["complete"];
}

/** Isolated plugin tests still execute the production registry, validators and business handlers. */
export function pagesTestPorts(store: PagesStore, projectId: string, options: PagesTestOptions = {}) {
  const stores = ownPagesStores(run => run(store));
  const { completeText, ...rest } = options;
  const complete = rest.complete ?? (completeText ? async (prompt: Parameters<NonNullable<PagesActionPorts["complete"]>>[0], callOptions: CompleteOptions) =>
    ({ text: await completeText(prompt, callOptions), validateResult: () => {} }) : undefined);
  const service = new ActionService();
  const actions = bindActionClient(service, () => ({ actor_id: "test", project_id: projectId, audience: "user", permissions: PAGES_ACTION_PERMISSIONS }));
  service.registerProvider({ provider: { provider_id: pagesManifest.plugin_id, title: "Pages", kind: "plugin", project_id: projectId },
    definitions: pagesManifest.actions!, handlers: [...createPagesActionHandlers({ ...stores, prepareImport: (files, caller) => preparePagesFileImport(files, { signal: caller.signal }),
      publishArtifact: rest.publishArtifact, ...(complete ? { complete } : {}),
      modelAvailability: () => complete ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型" },
    }), ...createPagesContentHandlers(actions)] });
  return { projectId, actions };
}
