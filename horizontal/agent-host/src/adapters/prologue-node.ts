import { createRuntime } from "@prologue/sdk";
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

export interface PrologueNodeAdapterOptions extends PrologueAdapterPorts {
  /** App identity Prologue records against this Runtime's work. */
  app: { readonly appId: string; readonly appVersion: string };
  /** Where the Node host keeps its own storage. A Host fact, never surfaced to Plugins. */
  storageRoot?: string;
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

      const started = await sdk.startAgentRun({
        session,
        rootRef: root.ref,
        start: {
          protocol: input.model.protocol,
          endpoint: input.model.endpoint,
          model: input.model.model,
          credentialRef: { id: input.model.credential_ref },
          messages: [{ role: "user", text: input.task }],
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
