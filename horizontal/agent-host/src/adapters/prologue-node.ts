import { BUILT_IN_ADAPTERS, createAdapterRegistry, createRuntime } from "@prologue/sdk";
import { createNodeHost } from "@prologue/sdk/node";

import {
  PrologueAgentAdapter,
  type PrologueAdapterPorts,
  type PrologueRuntimePort,
  type PrologueStartInput,
} from "./prologue.js";
import type { PrologueEvent } from "./prologue-stream.js";

/**
 * The one file that imports the Prologue SDK.
 *
 * It adapts the SDK's shapes to the narrow port the adapter needs, so the
 * adapter's behavior stays testable without a model, a network or a disk.
 *
 * **Not verified against a live model.** The argument assembly below is checked
 * by the compiler against the SDK's own types, and the adapter logic it feeds
 * is covered by tests through the port; an end-to-end Run with a real provider
 * has not been performed.
 */

/**
 * What Prologue's own adapter table says: which protocol keys exist, and which
 * of them lets us set a cache breakpoint.
 *
 * Read from the SDK rather than copied into a list of our own, so a rename over
 * there reaches our tests instead of quietly diverging. It lives in this file
 * because this is the one file allowed to import the SDK — that boundary is
 * what keeps the rest of the adapter testable without a model, a network or a
 * disk, and it is worth more than the convenience of importing twice.
 */
export function prologueProtocolFacts(): ReadonlyArray<{
  readonly protocol: string;
  readonly prompt_cache: boolean;
}> {
  return BUILT_IN_ADAPTERS.map((adapter) => ({
    protocol: adapter.protocol,
    prompt_cache: adapter.supportsPromptCache === true,
  }));
}

/** Whether Prologue would accept this protocol name. Throwing is its own answer. */
export function prologueAcceptsProtocol(protocol: string): boolean {
  const select = createAdapterRegistry(BUILT_IN_ADAPTERS);
  try {
    select(protocol);
    return true;
  } catch {
    return false;
  }
}

export interface PrologueNodeAdapterOptions extends PrologueAdapterPorts {
  /** App identity Prologue records against this Runtime's work. */
  app: { readonly appId: string; readonly appVersion: string };
  /** Where the Node host keeps its own storage. A Host fact, never surfaced to Plugins. */
  storageRoot?: string;
  /**
   * Turns a Molis Work credential reference into the actual key.
   *
   * The two systems keep separate credential stores, so a reference minted by
   * Molis Work means nothing to Prologue. The key crosses here, once per
   * reference, and is handed straight to Prologue's own store in exchange for a
   * reference it can resolve. Without this, a Run reaches the provider with a
   * reference that resolves to nothing.
   */
  resolveCredential?: (credentialRef: string) => string | null | Promise<string | null>;
}

/**
 * Build a read-only Prologue Runtime on the Node host.
 *
 * The posture is deliberately `read-only` with `on-request` approval: writes
 * and commands stay off until the effect-approval bridge is attached to this
 * Runtime. Opening them here would let a Run write without a recorded approval.
 */
export async function createPrologueNodeAdapter(
  options: PrologueNodeAdapterOptions,
): Promise<PrologueAgentAdapter> {
  const host = createNodeHost(
    options.storageRoot === undefined ? {} : { storageRoot: options.storageRoot },
  );
  const runtime = await createRuntime({
    app: options.app,
    host,
    preset: "local-agent",
    network: { model: true },
    posture: { sandbox: "read-only", approval: "on-request" },
    require: ["secrets", "network", "clock", "workspace.read", "storage"],
  });

  const sdk = runtime as unknown as PrologueSdkSurface;
  const credentials = new PrologueCredentialBridge({
    host: host as unknown as PrologueCredentialHost,
    resolve: options.resolveCredential,
  });
  const port: PrologueRuntimePort = {
    sessions: {
      create: () => sdk.sessions.create(),
    },
    async startAgentRun(input: PrologueStartInput) {
      const session = await sdk.sessions.open({ id: input.session_id });
      if (session === undefined) throw new Error("agent.session_unknown");
      const root = await sdk.workspace.authorize({ path: input.root_path });
      // Long instructions travel as a resource reference, not inline in the profile.
      const instructions = await stageInstructions(sdk, input.character.instructions);
      const created = sdk.characters.create({
        id: input.character.id,
        version: input.character.version,
        name: input.character.name,
        role: input.character.name,
        ...(instructions === undefined ? {} : { instructionsRef: instructions }),
        model: { protocol: input.model.protocol, model: input.model.model },
        tools: input.character.tools,
      });
      const character = sdk.characters.publish(created.ref);

      // Exchange our reference for one Prologue can resolve, before the Run
      // is started rather than when it first calls out.
      const credentialId = await credentials.prologueRefFor(input.model.credential_ref);
      const started = await sdk.startAgentRun({
        session,
        rootRef: root.ref,
        start: {
          protocol: input.model.protocol,
          endpoint: input.model.endpoint,
          model: input.model.model,
          credentialRef: { id: credentialId },
          messages: [{ role: "user", text: input.task }],
          // `off` sends no field, so a Run with caching turned off is byte for
          // byte the request it would have been before caching existed.
          ...(input.model.prompt_cache === undefined || input.model.prompt_cache === "off"
            ? {}
            : { promptCache: input.model.prompt_cache }),
        },
        agent: {
          idempotencyKey: `molis-work-${input.session_id}-${Date.now()}`,
          mode: input.mode,
          toolNames: input.character.tools,
          characterRef: character.ref,
        },
      });
      return {
        run: {
          ref: { id: started.run.ref.id },
          subscribe: (listener: (event: PrologueEvent) => void) =>
            started.run.subscribe((event: unknown) => listener(event as PrologueEvent)),
          cancel: () => started.run.cancel(),
        },
        control: started.control,
      };
    },
    shutdown: () => sdk.shutdown(),
  };

  return new PrologueAgentAdapter({
    runtime: port,
    modelConfiguration: options.modelConfiguration,
  });
}

/** Prologue's own credential store, as much of it as this bridge needs. */
export interface PrologueCredentialHost {
  writeCredential(input: {
    label: string;
    secret: { plaintext: Uint8Array };
  }): Promise<{ ref: { id: string } }>;
}

/**
 * Hands a key across from Molis Work's secret store to Prologue's.
 *
 * Each reference crosses at most once per process: the exchange is cached by
 * the Molis Work reference, so a key is not rewritten on every Run. The
 * plaintext bytes are zeroed right after the handover — the string itself
 * cannot be scrubbed in JavaScript, but the buffer that reached Prologue can.
 */
export class PrologueCredentialBridge {
  readonly #host: PrologueCredentialHost;
  readonly #resolve: PrologueNodeAdapterOptions["resolveCredential"];
  readonly #exchanged = new Map<string, string>();

  constructor(input: {
    host: PrologueCredentialHost;
    resolve: PrologueNodeAdapterOptions["resolveCredential"];
  }) {
    this.#host = input.host;
    this.#resolve = input.resolve;
  }

  async prologueRefFor(credentialRef: string): Promise<string> {
    const cached = this.#exchanged.get(credentialRef);
    if (cached !== undefined) return cached;
    if (this.#resolve === undefined) {
      throw new Error(
        `没有配置凭据解析，${credentialRef} 在 Prologue 那边解析不了：`
        + "两边的密钥库是分开的，密钥必须交接一次",
      );
    }
    const plaintext = await this.#resolve(credentialRef);
    if (plaintext === null || plaintext.trim() === "") {
      throw new Error(`密钥库里没有 ${credentialRef} 对应的密钥`);
    }
    const bytes = new TextEncoder().encode(plaintext);
    try {
      const snapshot = await this.#host.writeCredential({
        label: credentialRef,
        secret: { plaintext: bytes },
      });
      this.#exchanged.set(credentialRef, snapshot.ref.id);
      return snapshot.ref.id;
    } finally {
      bytes.fill(0);
    }
  }
}

/**
 * The SDK surface this composition touches. Declared here rather than imported
 * wholesale so the seam stays visible: widening it is a deliberate edit.
 */
interface PrologueSdkSurface {
  sessions: {
    create(): Promise<{ ref: { id: string } }>;
    open(ref: { id: string }): Promise<unknown | undefined>;
  };
  workspace: {
    authorize(input: { path: string }): Promise<{ ref: unknown }>;
  };
  characters: {
    create(input: unknown): { ref: unknown };
    publish(ref: unknown): { ref: unknown };
  };
  resources?: {
    stage(input: { mediaKind: string; byteLength: number; label: string }): unknown;
  };
  startAgentRun(input: unknown): Promise<{
    run: {
      ref: { id: string };
      subscribe(listener: (event: unknown) => void): () => void;
      cancel(): Promise<void>;
    };
    control: never;
  }>;
  shutdown(): Promise<unknown>;
}

/**
 * Stage the composed prompts as a text resource.
 *
 * Returns undefined when this Runtime has no resource store: a character
 * without instructions is a real, visible degradation, and pretending the
 * prompt was applied would be worse.
 */
async function stageInstructions(
  sdk: PrologueSdkSurface,
  instructions: string,
): Promise<{ id: string } | undefined> {
  if (instructions.trim() === "" || sdk.resources === undefined) return undefined;
  const staged = sdk.resources.stage({
    mediaKind: "text",
    byteLength: Buffer.byteLength(instructions, "utf8"),
    label: "role-instructions",
  }) as { ref?: { id: string } } | undefined;
  return staged?.ref;
}
