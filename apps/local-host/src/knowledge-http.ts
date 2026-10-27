import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { KNOWLEDGE_CARD_STATES, KNOWLEDGE_PROVIDER_ID, knowledgeActions, knowledgeManageActions, type KnowledgeCardRecord, type KnowledgeCardsResponse, type KnowledgeCardState } from "@molis-ai/molis-work-contracts/services/knowledge";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const PAGE = 200;
const RECENT = 50;

/**
 * The workbench's door to project knowledge (specs/project-knowledge §8): the management page in project settings and the side
 * panel's 资料 tab. Every route invokes the shared directory's `knowledge.*` actions as the person, in this project only.
 */
export async function handleKnowledgeHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: { localHost: MolisWorkLocalHost; projectRef: LocalHostProjectReference }): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/knowledge", maxBodyBytes: 200_000,
    async handle({ method, pathname, query, body }) {
      const client = ports.localHost.actionClient(ports.projectRef);
      const context = await localWebActionContext(ports.localHost, ports.projectRef, LOCAL_OWNER_PERMISSIONS);
      const call = (definition: { capability_id: string; version: number }, input: unknown) =>
        client.invoke(context, { capability_id: definition.capability_id, version: definition.version, provider_id: KNOWLEDGE_PROVIDER_ID }, input);
      const route = pathname.slice("/api/knowledge/".length);
      const offset = Math.max(0, Number.parseInt(query.get("offset") ?? "0", 10) || 0);
      // One read for the page: a page of cards with today's allowance, and the latest receipts.
      if (method === "GET" && route === "overview") {
        const states = (query.get("state") ?? "").split(",").filter((value): value is KnowledgeCardState => (KNOWLEDGE_CARD_STATES as readonly string[]).includes(value));
        const [cards, receipts] = await Promise.all([call(knowledgeManageActions.cards, { ...(states.length ? { states } : {}), limit: PAGE, offset }),
          call(knowledgeManageActions.receipts, { limit: RECENT })]);
        return { status: 200, body: { ...(cards as object), recent: receipts } };
      }
      if (method === "GET" && route === "receipts") {
        const kind = query.get("kind"), id = query.get("id");
        return { status: 200, body: await call(knowledgeManageActions.receipts, { ...(kind && id ? { subject: { kind, id } } : {}), limit: RECENT, offset }) };
      }
      // Every card (up to 2000 pieces), for the side panel: where each stands for its rows, and one piece's card for its preview.
      let modelReady = true, listing = false;
      const allCards = async () => {
        const cards: KnowledgeCardRecord[] = [];
        for (let at = 0; at < 2_000;) {
          const page = await call(knowledgeManageActions.cards, { limit: PAGE, offset: at }) as KnowledgeCardsResponse;
          cards.push(...page.cards);
          modelReady = page.model_ready;
          listing ||= page.listing;
          at += page.cards.length;
          if (!page.cards.length || at >= page.total) break;
        }
        return cards;
      };
      if (method === "GET" && route === "states") {
        const states = (await allCards()).map(card => ({ kind: card.subject.kind, id: card.subject.id, state: card.state, excluded: card.excluded, changed: !!card.suggestion }));
        return { status: 200, body: { states, model_ready: modelReady, listing } };
      }
      if (method === "GET" && route === "card") {
        const kind = query.get("kind"), id = query.get("id");
        return { status: 200, body: { card: (await allCards()).find(card => card.subject.kind === kind && card.subject.id === id) ?? null } };
      }
      if (method === "GET" && route === "glob") return { status: 200, body: await call(knowledgeActions.glob, { pattern: query.get("pattern") ?? "", limit: PAGE }) };
      if (method === "GET" && route === "search") return { status: 200, body: await call(knowledgeActions.search, { query: query.get("q") ?? "", limit: 30 }) };
      if (method !== "POST") return null;
      if (route === "bind-preview") return { status: 200, body: await call(knowledgeManageActions.bindPreview, body) };
      if (route === "bind") return { status: 200, body: await call(knowledgeManageActions.bind, body) };
      if (route === "edit") return { status: 200, body: await call(knowledgeManageActions.edit, body) };
      if (route === "exclude") return { status: 200, body: await call(knowledgeManageActions.exclude, body) };
      if (route === "organize") return { status: 200, body: await call(knowledgeManageActions.organize, body) };
      return null;
    },
  });
}
