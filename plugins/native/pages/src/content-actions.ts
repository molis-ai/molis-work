import { bindActionClient, bindWorkflowContentHandlers, defineWorkflowContentActions, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions } from "./actions.js";
import { nodeFromUnknown } from "./schema.js";
import { nodesToMarkdown } from "./to-markdown.js";
import { blocksFromMarkdown } from "./paste-markdown.js";

export const pagesContentActions = defineWorkflowContentActions({ id: "pages", title: "Pages", icon: "note", create: true,
  read_permissions: ["pages:read"], write_permissions: ["pages:write"] });

export function createPagesContentHandlers(actions: ActionClient) {
  const ref = (page: { id: string; title: string }) => ({ plugin: "pages", item_id: page.id, title: page.title });
  return bindWorkflowContentHandlers(pagesContentActions, {
    list: async caller => (await bindActionClient(actions, () => caller).invoke(pagesActions.list, {})).documents.map(page => ({ item_id: page.id, title: page.title, caption: "Pages", at: page.updated_at })),
    read: async ({ item_id }, caller) => {
      const { document: page } = await bindActionClient(actions, () => caller).invoke(pagesActions.get, { id: item_id });
      const nodes: Array<Parameters<typeof nodesToMarkdown>[0][number]> = [];
      nodeFromUnknown(page.body).forEach(node => { nodes.push(node); });
      return { title: page.title, body: nodesToMarkdown(nodes).trim(), source: "Pages", feed_item_id: null };
    },
    create: async ({ title }, caller) => ref((await bindActionClient(actions, () => caller).invoke(pagesActions.create, { title })).document),
    receive: async ({ payload }, caller) => {
      const source = payload.url && !payload.body.includes(payload.url) ? `\n来源：${payload.source ?? ""} ${payload.url}`.replace("： ", "：") : "";
      const markdown = [payload.body, source].filter(Boolean).join("\n");
      const blocks = blocksFromMarkdown(markdown);
      const body = { type: "doc", content: blocks ? blocks.map(block => block.toJSON())
        : markdown.split(/\n\n+/).map(text => ({ type: "paragraph", content: [{ type: "text", text }] })) };
      return ref((await bindActionClient(actions, () => caller).invoke(pagesActions.create, { title: payload.title, body: body as never })).document);
    },
  });
}
