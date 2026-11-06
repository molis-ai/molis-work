import { V_SYNC_COLLECTION_PAGES_DOCUMENTS, V_SYNC_PROTOCOL } from "./versions.generated.js";
import { pagesCollection } from "./replication.js";
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Folders are structural dependencies of documents, not an independently switchable option. */
export const pagesSyncDeclaration: PluginSyncDeclaration = Object.freeze({
  protocol_version: V_SYNC_PROTOCOL,
  collections: Object.freeze([
    Object.freeze({ id: "documents", title: "文档与文件夹", schema_version: V_SYNC_COLLECTION_PAGES_DOCUMENTS, requires: Object.freeze([]), tracking: pagesCollection.tracking }),
  ]),
});
