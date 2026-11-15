import { bindActionHandler, type ActionDefinition, type ActionHandlerBinding, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { SESSIONS_PROVIDER_ID, sessionsActions } from "@molis-ai/molis-work-contracts/services/sessions";
import { SessionsService } from "@molis-ai/molis-work-service-sessions";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { EXTERNAL_SESSIONS_OWNER } from "./project-deleted-owners.js";
import { setLiveSessions } from "./sessions-live.js";
import { createHostSessionsPorts, type HostSessionsOptions } from "./sessions-ports.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

export interface HostSessions {
  readonly service: SessionsService;
  readonly provider: ActionProviderRegistration;
  close(): void;
}

/**
 * Registers the `system.sessions` Home provider and owns the Home's `external-sessions.db` handle while the Host runs.
 * Note (`contract-design` §10.2): `sessions.search.entries@1` and `sessions.subject.read@1` stay unregistered until S-4
 * closes the Search, Knowledge, and Assistant guardrails.
 */
export function createHostSessions(
  homeDirectory: string,
  catalogRunner: () => LocalWebCatalogRunner | undefined,
  onSearchChanged: () => void,
  options: HostSessionsOptions = {},
): HostSessions {
  const ports = createHostSessionsPorts(homeDirectory, catalogRunner, onSearchChanged, options);
  const service = new SessionsService(homeDirectory, ports);

  const definitions: ActionDefinition<unknown, unknown>[] = [
    sessionsActions.list as ActionDefinition<unknown, unknown>,
    sessionsActions.historyRead as ActionDefinition<unknown, unknown>,
    sessionsActions.scopeRead as ActionDefinition<unknown, unknown>,
    sessionsActions.scopeSet as ActionDefinition<unknown, unknown>,
    sessionsActions.projectAiReadSet as ActionDefinition<unknown, unknown>,
    sessionsActions.discoveryRun as ActionDefinition<unknown, unknown>,
    sessionsActions.attributionSet as ActionDefinition<unknown, unknown>,
    sessionsActions.attributionSuggest as ActionDefinition<unknown, unknown>,
    sessionsActions.toolSearch as ActionDefinition<unknown, unknown>,
    sessionsActions.connectorUsages as ActionDefinition<unknown, unknown>,
  ];

  const handlers: ActionHandlerBinding[] = [
    bindActionHandler(sessionsActions.list, (input, caller) => service.list(input, caller)),
    bindActionHandler(sessionsActions.historyRead, (input, caller) => service.historyRead(input, caller)),
    bindActionHandler(sessionsActions.scopeRead, (input, caller) => service.scopeRead(input, caller)),
    bindActionHandler(sessionsActions.scopeSet, (input, caller) => service.scopeSet(input, caller)),
    bindActionHandler(sessionsActions.projectAiReadSet, (input, caller) => service.projectAiReadSet(input, caller)),
    bindActionHandler(sessionsActions.discoveryRun, (input, caller) => service.discoveryRun(input, caller)),
    bindActionHandler(sessionsActions.attributionSet, (input, caller) => service.attributionSet(input, caller)),
    bindActionHandler(sessionsActions.attributionSuggest, (input, caller) => service.attributionSuggest(input, caller)),
    bindActionHandler(sessionsActions.toolSearch, (input, caller) => service.toolSearch(input, caller)),
    bindActionHandler(sessionsActions.connectorUsages, (input, caller) => service.connectorUsages(input, caller)),
  ];

  let closed = false;
  let stepDown = () => {};
  const disposeOwner = projectDeletedHooksFor(homeDirectory).register({
    ...EXTERNAL_SESSIONS_OWNER,
    survivesRebuild: false,
    alive: () => !closed,
    clear: projectId => {
      service.purgeProject(projectId);
    },
  });

  const host: HostSessions = {
    service,
    provider: {
      provider: { provider_id: SESSIONS_PROVIDER_ID, title: "外部会话", kind: "system" },
      definitions,
      handlers,
    },
    close: () => {
      if (closed) return;
      closed = true;
      stepDown();
      disposeOwner();
      service.close();
    },
  };

  stepDown = setLiveSessions(homeDirectory, host);
  return host;
}
