import type { ActionCallContext, ActionClient, ActionHandlerBinding, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_PROVIDER_ID, knowledgeActions, type KnowledgeGrepRequest, type KnowledgeOutlineRequest, type KnowledgeReadRequest, type KnowledgeSearchRequest } from "@molis-ai/molis-work-contracts/services/knowledge";
import { KnowledgeService, type KnowledgeAccess } from "@molis-ai/molis-work-service-knowledge";
import type { SearchService } from "@molis-ai/molis-work-service-search";

/**
 * Host wiring for project knowledge (specs/project-knowledge): the provider `system.knowledge` over the system search it rides
 * on. It is registered and closed together with search (search-actions.ts), since every card comes from search's index.
 */
export function knowledgeProvider(search: Pick<SearchService, "query">, clientFor: (caller: ActionCallContext) => ActionClient): ActionProviderRegistration {
  const service = new KnowledgeService({ search: (access, input) => search.query(access, input) });
  const access = (caller: ActionCallContext): KnowledgeAccess => ({ client: clientFor(caller), caller });
  const handlers: ActionHandlerBinding[] = [
    { ...knowledgeActions.search, handle: (caller, input) => service.search(access(caller), input as KnowledgeSearchRequest) },
    { ...knowledgeActions.outline, handle: (caller, input) => service.outline(access(caller), input as KnowledgeOutlineRequest) },
    { ...knowledgeActions.read, handle: (caller, input) => service.read(access(caller), input as KnowledgeReadRequest) },
    { ...knowledgeActions.grep, handle: (caller, input) => service.grep(access(caller), input as KnowledgeGrepRequest) },
  ];
  return { provider: { provider_id: KNOWLEDGE_PROVIDER_ID, title: "项目资料", kind: "system" }, definitions: Object.values(knowledgeActions), handlers };
}
