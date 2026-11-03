import { FEED_PLUGIN_ID } from "./identity.js";
import type { FeedAttentionPort } from "./store/items/types.js";

/**
 * The host's Attention Module keeps the owner each call names, and takes none to mean "unassigned". The Inbox lists the entries that have an
 * owner, so Feed names itself as the owner of every entry it makes and looks only at the entries it owns: an item's entry, a source's fault.
 * The platform's `services.attention` does the same by itself (`createFeedRuntimePorts`); this is the same rule over the Module.
 */
export function feedOwnedAttention(attention: FeedAttentionPort): FeedAttentionPort {
  return {
    query: {
      list: projectId => attention.query.list(projectId),
      get: (projectId, entryId) => attention.query.get(projectId, entryId),
      findForSubject: (projectId, subjectType, subjectId, owner = FEED_PLUGIN_ID) => attention.query.findForSubject(projectId, subjectType, subjectId, owner),
    },
    commands: {
      create: input => attention.commands.create({ owner_plugin_id: FEED_PLUGIN_ID, ...input }),
      ensureFeedItem: (projectId, itemId, reason, detail) => attention.commands.create({ project_id: projectId, owner_plugin_id: FEED_PLUGIN_ID,
        subject_type: "feed_item", subject_id: itemId, reason, detail }),
      setStatus: (projectId, entryId, status, expectedRevision) => attention.commands.setStatus(projectId, entryId, status, expectedRevision),
      deleteSubject: (projectId, subjectType, subjectId, owner = FEED_PLUGIN_ID) => attention.commands.deleteSubject(projectId, subjectType, subjectId, owner),
    },
  };
}
