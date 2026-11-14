import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { KNOWLEDGE_CARD_STATES, KNOWLEDGE_CARDS_SUBJECTS_MAX, KNOWLEDGE_PROVIDER_ID, knowledgeActions, knowledgeManageActions, type KnowledgeCardsResponse, type KnowledgeCardState } from "@molis-ai/molis-work-contracts/services/knowledge";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const PAGE = 200;
const RECENT = 50;
/** What this door answers; a path or method outside these is no route here, and reads no directory for the person (N42). */
const GET_ROUTES: ReadonlySet<string> = new Set(["overview", "receipts", "states", "card", "glob", "search"]);
const POST_ROUTES: ReadonlySet<string> = new Set(["states", "edit", "exclude", "organize"]);

/**
 * The workbench's door to project knowledge (specs/project-knowledge §8): the management page in project settings and the side
 * panel's 资料 tab. Every route invokes the shared directory's `knowledge.*` actions as the person, in this project only.
 */
export async function handleKnowledgeHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: { localHost: MolisWorkLocalHost; projectRef: LocalHostProjectReference }): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/knowledge", maxBodyBytes: 200_000,
    async handle({ method, pathname, query, body }) {
      const route = pathname.slice("/api/knowledge/".length);
      // N42: the route decides first; an unknown path, or a card asked for by no key, needs no person context at all.
      if (!(method === "GET" ? GET_ROUTES : POST_ROUTES).has(route)) return null;
      if (method === "GET" && route === "card" && !(query.get("kind") && query.get("id"))) return { status: 200, body: { card: null } };
      const client = ports.localHost.actionClient(ports.projectRef);
      const context = await localWebActionContext(ports.localHost, ports.projectRef, LOCAL_OWNER_PERMISSIONS);
      const call = (definition: { capability_id: string; version: number }, input: unknown) =>
        client.invoke(context, { capability_id: definition.capability_id, version: definition.version, provider_id: KNOWLEDGE_PROVIDER_ID }, input);
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
      // D0234: the side panel consumes explicit pages; a preview selects one subject at its owner.
      if (method === "GET" && route === "states") {
        const page = await call(knowledgeManageActions.cards, { limit: PAGE, offset }) as KnowledgeCardsResponse;
        const states = page.cards.map(card => ({ kind: card.subject.kind, id: card.subject.id, state: card.state, excluded: card.excluded, changed: !!card.suggestion }));
        const next = offset + page.cards.length;
        return { status: 200, body: { states, total: page.total, next_offset: next < page.total ? next : null, model_ready: page.model_ready, listing: page.listing } };
      }
      // One piece's card, by its key: the project's other cards are not read for it.
      if (method === "GET" && route === "card") {
        const named = await call(knowledgeManageActions.cards, { subject: { kind: query.get("kind")!, id: query.get("id")! }, limit: 1 }) as KnowledgeCardsResponse;
        return { status: 200, body: { card: named.cards[0] ?? null } };
      }
      if (method === "GET" && route === "glob") return { status: 200, body: await call(knowledgeActions.glob, { pattern: query.get("pattern") ?? "", limit: PAGE }) };
      if (method === "GET" && route === "search") return { status: 200, body: await call(knowledgeActions.search, { query: query.get("q") ?? "", limit: 30 }) };
      // Where the pieces a list shows stand, by their keys (materials-ui-contract §6): no catch-up and no scan of every card.
      if (route === "states") {
        const named = await call(knowledgeManageActions.cards, { subjects: body?.subjects ?? [], limit: KNOWLEDGE_CARDS_SUBJECTS_MAX }) as KnowledgeCardsResponse;
        return { status: 200, body: { states: named.cards.map(card => ({ kind: card.subject.kind, id: card.subject.id, state: card.state, excluded: card.excluded,
          changed: !!card.suggestion })), model_ready: named.model_ready } };
      }
      if (route === "edit") return { status: 200, body: await call(knowledgeManageActions.edit, body) };
      if (route === "exclude") return { status: 200, body: await call(knowledgeManageActions.exclude, body) };
      if (route === "organize") return { status: 200, body: await call(knowledgeManageActions.organize, body) };
      return null;
    },
  });
}
