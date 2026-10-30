import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";

/** One call's fetch: the final authorization wait is followed by a synchronous check and the actual transport with no wait between. */
export function controlledConnectorFetch<Input>(fetchImpl: (input: Input, init?: RequestInit) => Promise<Response>, control: ConnectorCallControl) {
  return async function(this: unknown, input: Input, init?: RequestInit): Promise<Response> {
    const signal = AbortSignal.any([control.signal, ...(init?.signal ? [init.signal] : [])]);
    await control.beforeEffect(); control.current(); signal.throwIfAborted();
    const response = await fetchImpl.call(this, input, { ...init, signal });
    await control.beforeEffect(); control.current(); signal.throwIfAborted();
    return response;
  };
}
