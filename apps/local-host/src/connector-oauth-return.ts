import { contextJourneyId, withContextJourneys } from "./context-onboarding-store.js";

/**
 * Where an OAuth authorization returns the person to (W5-11 §2.4). The entry that starts it writes this into the pending record; the
 * plugin writes nothing of it. Without `onboarding` the person returns to the connection settings.
 */
export interface OAuthReturn { readonly onboarding?: { readonly id: string; readonly desktop: boolean } }

const TTL_MS = 10 * 60_000;

/** A return the start request asks for: the onboarding journey it names must still be choosing sources. */
export function requestedOAuthReturn(home: string, body: { onboarding_id?: unknown; desktop?: unknown }): OAuthReturn | undefined {
  if (typeof body.onboarding_id !== "string") return undefined;
  const onboarding = { id: contextJourneyId(body.onboarding_id), desktop: body.desktop === true };
  withContextJourneys(home, store => { if (store.get(onboarding.id).phase !== "selecting") throw new Error("请从来源清单重新发起连接"); });
  return { onboarding };
}

/** The authorization is under way: the journey waits for this state, and a newer start takes its place. */
export function beginOAuthReturn(home: string, back: OAuthReturn | undefined, state: string): void {
  const onboarding = back?.onboarding;
  if (!onboarding) return;
  withContextJourneys(home, store => {
    const journey = store.get(onboarding.id);
    journey.oauth_status = "pending"; journey.oauth_state = state; journey.oauth_expires_at = Date.now() + TTL_MS; journey.oauth_desktop = onboarding.desktop; journey.error = null;
    store.save(journey);
  });
}

/** The callback's check before any request: this is still the authorization the journey waits for. */
export function assertOAuthReturnPending(home: string, back: OAuthReturn | undefined, state: string): void {
  const onboarding = back?.onboarding;
  if (!onboarding) return;
  withContextJourneys(home, store => {
    const journey = store.get(onboarding.id);
    if (journey.phase !== "selecting" || journey.oauth_status !== "pending" || (journey.oauth_state && journey.oauth_state !== state)) {
      throw new Error("这次授权已结束，请使用最新的连接入口");
    }
  });
}

/** The authorization ended; the journey changes only while it still waits for this state. */
export function finishOAuthReturn(home: string, back: OAuthReturn | undefined, state: string, outcome: { connected: string } | { ended: "cancelled" | "failed" }): void {
  const onboarding = back?.onboarding;
  if (!onboarding) return;
  withContextJourneys(home, store => {
    const journey = store.get(onboarding.id);
    if ((journey.oauth_state && journey.oauth_state !== state) || journey.oauth_status !== "pending") return;
    if ("connected" in outcome) {
      if (journey.phase !== "selecting") return;
      const gmail = journey.sources.find(source => source.kind === "gmail");
      if (gmail) gmail.connection_id = outcome.connected;
      journey.oauth_status = "connected";
    } else { journey.auto_start = false; journey.oauth_status = outcome.ended; }
    store.save(journey);
  });
}

/**
 * A callback whose record is gone, because it waited longer than the record lives: the journey that was waiting for that state (and is
 * itself past its time) ends as failed, and the person returns to it. A state that is unknown or already used ends nothing.
 */
export function expiredOAuthReturn(home: string, state: string): OAuthReturn | undefined {
  return withContextJourneys(home, store => {
    const journey = store.waitingForOAuth(state);
    if (!journey || (journey.oauth_expires_at ?? 0) > Date.now()) return undefined;
    journey.auto_start = false; journey.oauth_status = "failed"; journey.error = "Google 授权已过期，已选材料仍在。请重新连接，或跳过 Gmail。";
    store.save(journey);
    return { onboarding: { id: journey.id, desktop: journey.oauth_desktop === true } };
  });
}

/** The onboarding page the person returns to, `undefined` when the authorization came from the connection settings. */
export function oauthReturnLocation(back: OAuthReturn | undefined, ended: "connected" | "cancelled" | "failed"): string | undefined {
  const onboarding = back?.onboarding;
  return onboarding ? `/onboarding?mode=new-project&journey=${onboarding.id}&oauth=${ended}${onboarding.desktop ? "&desktop=1" : ""}` : undefined;
}
