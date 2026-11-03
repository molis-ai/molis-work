import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginContribution, PluginManifest, PluginRouteBinding, PluginRouteRequest, PluginRouteResponse } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse, isCodedFailure } from "@molis-ai/molis-work-plugin-sdk";

import { endPluginRoute, runInPluginRoute, type PluginRouteCall } from "./action-scope.js";

/**
 * What each running activation offers, keyed by installation. A route an activation offers runs as a call of its own (BL-403,
 * `runInPluginRoute`): while it is open, what a service refuses it reaches the handler as an error instead of nothing. When the
 * activation is withdrawn (it stops, crashes or is replaced), a request still waiting is answered at once with 403 and its route
 * ends, so what its code calls after the activation stopped does nothing (BL-411); a request that comes later, through a binding
 * someone kept, meets the same 403 and never reaches the handler. A streamed route is not answered early: the router's own watch
 * of the instance cancels the call (`watchInstance`). A route's failure that carries a code of ours is answered by its kind, the
 * way every exit answers one (BL-404), so the plugin writes no catch of its own; any other failure goes on to the Host, which
 * answers it with its generic sentence and keeps the raw message out of the answer.
 */
export class OfferedContributions {
  readonly #offered = new Map<string, Offer>();

  get(installId: string): PluginContribution | undefined {
    return this.#offered.get(installId)?.contribution;
  }

  has(installId: string): boolean {
    return this.#offered.has(installId);
  }

  /** `manifest` is the one the activation was redeemed against: it says which routes stream. */
  set(installId: string, contribution: PluginContribution, manifest: PluginManifest): void {
    this.delete(installId);
    this.#offered.set(installId, offer(contribution, manifest));
  }

  delete(installId: string): void {
    this.#offered.get(installId)?.withdraw();
    this.#offered.delete(installId);
  }
}

interface Offer {
  readonly contribution: PluginContribution;
  withdraw(): void;
}

const stoppedAnswer = () => actionErrorResponse(new ActionError("actions.forbidden", "此插件实例已停止，请重新打开"));

function offer(contribution: PluginContribution, manifest: PluginManifest): Offer {
  if (contribution.kind !== "app" || !contribution.routes?.length) return { contribution, withdraw: () => undefined };
  // The router's own test for a streamed route (`routes.ts`), so a second kind of stream is never raced against the 403 and cut short.
  const streamed = new Set((manifest.routes ?? []).filter(route => route.stream !== undefined).map(route => route.route_id));
  const waiting = new Set<() => void>();
  let withdrawn = false;
  const answer = (binding: PluginRouteBinding, request: PluginRouteRequest): Promise<PluginRouteResponse> => {
    if (withdrawn) return Promise.resolve(stoppedAnswer());
    const route: PluginRouteCall = { route_id: binding.route_id };
    let answerStopped: (response: PluginRouteResponse) => void = () => undefined;
    const ended = new Promise<PluginRouteResponse>(resolve => { answerStopped = resolve; });
    const end = () => { endPluginRoute(route); answerStopped(stoppedAnswer()); };
    waiting.add(end);
    // After a withdrawal the 403 has answered: an uncoded error the handler's tail throws then reaches only the race, and is dropped on
    // purpose. The request was answered and the tail's service calls do nothing (BL-411); no Host log records it yet.
    const handled = new Promise<PluginRouteResponse>(resolve => resolve(runInPluginRoute(route, () => binding.handle(request)))).catch(codedAnswer);
    return (streamed.has(binding.route_id) ? handled : Promise.race([handled, ended])).finally(() => waiting.delete(end));
  };
  return {
    contribution: { ...contribution, routes: contribution.routes.map(binding => ({ ...binding, handle: (request: PluginRouteRequest) => answer(binding, request) })) },
    withdraw() {
      withdrawn = true;
      for (const end of waiting) end();
      waiting.clear();
    },
  };
}

function codedAnswer(error: unknown): PluginRouteResponse {
  if (isCodedFailure(error)) return actionErrorResponse(error);
  throw error;
}
