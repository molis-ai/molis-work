import type { PrologueCredentialInput } from "../inference.js";
import { createHash } from "node:crypto";
import type { ExactRef } from "@prologue/sdk";
import type { PrologueNodeAdapterOptions } from "./prologue-node-kit.js";

/** Prologue's own credential store, as much of it as this bridge needs. */
export interface PrologueCredentialHost {
  writeCredential(input: {
    label: string;
    secret: { plaintext: Uint8Array };
  }): Promise<{ ref: ExactRef<"credential"> }>;
}

/**
 * Hands a key across from Molis Work's secret store to Prologue's.
 *
 * Each Run resolves the current secret so rotation and removal take effect.
 * Equal secrets share one in-flight exchange; only a digest is kept in memory.
 * The plaintext bytes are zeroed right after the handover — the string itself
 * cannot be scrubbed in JavaScript, but the buffer that reached Prologue can.
 */
export class PrologueCredentialBridge {
  readonly #host: PrologueCredentialHost;
  readonly #resolve: PrologueNodeAdapterOptions["resolveCredential"];
  readonly #exchanged = new Map<string, { digest: string; result: Promise<ExactRef<"credential">> }>();

  constructor(input: {
    host: PrologueCredentialHost;
    resolve: PrologueNodeAdapterOptions["resolveCredential"];
  }) {
    this.#host = input.host;
    this.#resolve = input.resolve;
  }

  async prologueRefFor(credentialRef: string, resolve = this.#resolve, signal?: AbortSignal): Promise<ExactRef<"credential">> {
    if (resolve === undefined) {
      throw new Error(
        `没有配置凭据解析，${credentialRef} 在 Prologue 那边解析不了：`
        + "两边的密钥库是分开的，密钥必须交接一次",
      );
    }
    signal?.throwIfAborted();
    const plaintext = await resolve(credentialRef);
    signal?.throwIfAborted();
    if (plaintext === null || plaintext.trim() === "") {
      throw new Error(`密钥库里没有 ${credentialRef} 对应的密钥`);
    }
    const digest = createHash("sha256").update(plaintext).digest("hex");
    const cached = this.#exchanged.get(credentialRef);
    if (cached?.digest === digest) {
      const ref = await cached.result;
      signal?.throwIfAborted();
      if (await resolve(credentialRef) !== plaintext) throw new Error("模型凭据在交接期间已改变");
      signal?.throwIfAborted();
      return ref;
    }
    const bytes = new TextEncoder().encode(plaintext);
    const result = this.#host.writeCredential({ label: credentialRef, secret: { plaintext: bytes } })
      .then((snapshot) => snapshot.ref)
      .finally(() => bytes.fill(0));
    this.#exchanged.set(credentialRef, { digest, result });
    try {
      const ref = await result;
      signal?.throwIfAborted();
      if (await resolve(credentialRef) !== plaintext) throw new Error("模型凭据在交接期间已改变");
      signal?.throwIfAborted();
      return ref;
    } catch (error) {
      if (this.#exchanged.get(credentialRef)?.result === result) this.#exchanged.delete(credentialRef);
      throw error;
    }
  }
}


/** One prepared credential and its rotation/cancellation check for a bounded inference. */
export function prepareInferenceCredential(credentials: PrologueCredentialBridge) {
  return async (input: PrologueCredentialInput, signal: AbortSignal, optional?: boolean) => {
    const normalize = (value: string | null) => value?.trim() ? value : null;
    signal.throwIfAborted();
    await input.beforeDispatch?.();
    const snapshot = normalize(await input.resolveCredential(input.credential_ref));
    signal.throwIfAborted();
    const assertCurrent = async () => {
      signal.throwIfAborted();
      if (normalize(await input.resolveCredential(input.credential_ref)) !== snapshot) throw new Error("模型凭据或配置已改变");
      signal.throwIfAborted();
    };
    if (optional && snapshot === null) return { assertCurrent };
    if (snapshot === null) throw new Error("模型凭据不可用");
    const ref = await credentials.prologueRefFor(input.credential_ref, async () => { await assertCurrent(); return snapshot; }, signal);
    return { ref, assertCurrent };
  };
}
