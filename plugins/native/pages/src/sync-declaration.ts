import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Folders are structural dependencies of documents, not an independently switchable option. */
export const pagesSyncDeclaration: PluginSyncDeclaration = Object.freeze({
  protocol_version: 1,
  collections: Object.freeze([
    Object.freeze({ id: "documents", title: "文档与文件夹", schema_version: 1, requires: Object.freeze([]) }),
  ]),
});
