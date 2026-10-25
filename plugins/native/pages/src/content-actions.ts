import { createHash } from "node:crypto";
import { ActionError, bindWorkflowContentHandlers, defineWorkflowContentActions, type ActionDefinition, type ActionExecutionContext, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { PAGES_PLUGIN_ID } from "./contract.js";
import { pagesActions, PAGES_SUBJECT_KIND } from "./actions.js";
import { nodeFromUnknown } from "./schema.js";
import { nodesToMarkdown } from "./to-markdown.js";
import { blocksFromMarkdown } from "./paste-markdown.js";

export const pagesContentActions = defineWorkflowContentActions({ id: "pages", title: "Pages", icon: "note", create: true, subject_kind: PAGES_SUBJECT_KIND,
  read_permissions: ["pages:read"], write_permissions: ["pages:write"] });

/** The content protocol translates to the same business actions as HTTP and MCP. */
export function createPagesContentHandlers(actions: BoundActionClient) {
  const invoke = async <I, O>(definition: ActionDefinition<I, O>, input: I, caller: ActionExecutionContext): Promise<O> => {
    // The exact provider, as the person's grant names it: a reference without one never matches an MCP client's grant.
    const authority = caller.retainAuthority?.([{ capability_id: definition.capability_id, version: definition.version, provider_id: PAGES_PLUGIN_ID }]);
    if (!authority) throw new ActionError("actions.unredeemed", "宿主未提供内容交接授权检查");
    await authority();
    return actions.invoke(definition, input, { ...caller,
      beforeEffect: async () => { await caller.beforeEffect(); await authority(); },
      assert_authority_current: () => { caller.assert_authority_current?.(); authority.assertCurrent(); },
    });
  };
  const ref = (page: { id: string; title: string }) => ({ plugin: "pages", item_id: page.id, title: page.title });
  return bindWorkflowContentHandlers(pagesContentActions, {
    list: async caller => (await invoke(pagesActions.list, {}, caller)).documents.map(page => ({ item_id: page.id, title: page.title, caption: "Pages", at: page.updated_at })),
    read: async ({ item_id }, caller) => {
      const { document: page } = await invoke(pagesActions.get, { id: item_id }, caller);
      const nodes: Array<Parameters<typeof nodesToMarkdown>[0][number]> = [];
      nodeFromUnknown(page.body).forEach(node => { nodes.push(node); });
      return { title: page.title, body: nodesToMarkdown(nodes).trim(), source: "Pages", feed_item_id: null };
    },
    create: async ({ title }, caller) => ref((await invoke(pagesActions.create, { title }, caller)).document),
    receive: async (input, caller) => {
      const source = input.url && !input.body.includes(input.url) ? `\n来源：${input.source ?? ""} ${input.url}`.replace("： ", "：") : "";
      const markdown = [input.body, source].filter(Boolean).join("\n");
      const blocks = blocksFromMarkdown(markdown);
      const body = { type: "doc", content: blocks ? blocks.map(block => block.toJSON())
        : markdown.split(/\n\n+/).map(text => ({ type: "paragraph", content: [{ type: "text", text }] })) };
      // One delivery is one document: a retried handoff returns the original page and keeps later edits.
      // A long headline is cut to the 80 characters a title holds; refused, the same hand-over could never be delivered.
      const documents = [{ title: input.title.trim().slice(0, 80), body: body as never }];
      const request_hash = createHash("sha256").update(JSON.stringify(documents)).digest("hex");
      const imported = await invoke(pagesActions.importDocuments, { request_id: input.request_id, request_hash, documents }, caller);
      return ref(imported.documents[0]!);
    },
  });
}
