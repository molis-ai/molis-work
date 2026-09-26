import { createTypeSafeProvider, TYPESAFE_SYSTEMONE_URL } from "@molis-ai/molis-work-module-functions";
import { resolvePrologueInference } from "./prologue-inference-host.js";

export interface TypeSafeInferenceAuthority {
  resolveCredential(): string | null | Promise<string | null>;
  /** Current selected connection identity/revision, without a plaintext secret. */
  configuration?(): unknown;
}
/** Native questions and probability outputs pass through unchanged; no prompt emulation. */
export function createPrologueTypeSafeProvider(homeDirectory: string | undefined, authority: TypeSafeInferenceAuthority, resolveInference = resolvePrologueInference) {
  return createTypeSafeProvider(async ({ api_key, signal, ...request }) => {
    const configuration = JSON.stringify(authority.configuration?.());
    const current = async () => {
      signal?.throwIfAborted();
      if (JSON.stringify(authority.configuration?.()) !== configuration || await authority.resolveCredential() !== api_key) throw new Error("判断服务连接已变化");
      signal?.throwIfAborted();
      return api_key;
    };
    await current();
    const inference = await resolveInference(homeDirectory);
    await current();
    const credential_ref = "typesafe:inference";
    const result = await inference.evaluateTypeSafe({ ...request, endpoint: TYPESAFE_SYSTEMONE_URL,
      credential_ref, resolveCredential: ref => ref === credential_ref ? current() : null,
      signal, timeout_ms: 30_000 });
    await current();
    return result;
  });
}
