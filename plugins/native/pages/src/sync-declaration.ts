import { pagesCollection } from "./replication.js";
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Folders are structural dependencies of documents, not an independently switchable option. */
export const pagesSyncDeclaration: PluginSyncDeclaration = Object.freeze({
  protocol_version: /* @version sync.protocol */ 1,
  collections: Object.freeze([
    Object.freeze({ id: "documents", title: "文档与文件夹", schema_version: /* @version sync.collection.pages.documents */ 1, requires: Object.freeze([]), tracking: pagesCollection.tracking }),
  ]),
});
