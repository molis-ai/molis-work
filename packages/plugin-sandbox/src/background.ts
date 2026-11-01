import type { PluginBackgroundClient } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxCallControl, SandboxLimits, SandboxRunner } from './runner.js';
import { assertMatches, SandboxError } from './schema.js';

// Background work of a sandboxed package (`sdk.background`, PG-017 P3). The Host's `background.start(work)` takes a callback, which a sandbox does not
// have, so the package names one of its own commands and the broker hands the Host a callback that runs it. The sandbox process runs one
// operation at a time, so a run that lasts minutes would hold up every read and save of the package: the runs get a second process of the same
// package (the lane), started when the first run is accepted and used for nothing else.

/** Executions one sandbox may have accepted and not yet ended: the lane runs them one at a time, so the rest wait behind the first. */
export const BACKGROUND_EXECUTIONS = 4;

/** What a lane's process is given to run an operation: far longer than a read or a save, and still bounded. */
export const SANDBOX_BACKGROUND_LIMITS: Partial<SandboxLimits> = Object.freeze({ operationTimeoutMs: 10 * 60_000, serviceTimeoutMs: 60_000 });

/** The Host's client reduced to what a channel can carry (`start` only: the keeping of Manifest jobs is the definition's, not the package's), and the lane its runs go to. */
export interface SandboxBackground {
  readonly client: Pick<PluginBackgroundClient, 'start'>;
  readonly lane: SandboxBackgroundLane;
}

export interface SandboxBackgroundLane {
  /** Refuses, before the Host accepts anything, an operation the contract does not have or an input it does not take. */
  check(operationId: string, input: SandboxJson): void;
  /** One run in the lane's process, under the execution's own signal and `beforeEffect`; a dead process is replaced for the next run, and the run it killed is not replayed. */
  run(operationId: string, input: SandboxJson, control: SandboxCallControl): Promise<SandboxJson>;
  stop(): Promise<void>;
}

/** The codes after which the process is gone (the runner shuts it down for each of them): the next run starts a new one. */
const PROCESS_GONE = new Set(['sandbox.process_exit', 'sandbox.stopped', 'sandbox.memory_limit', 'sandbox.cpu_limit', 'sandbox.channel_error', 'sandbox.channel_limit',
  'sandbox.protocol_error', 'sandbox.start_failed', 'sandbox.start_timeout', 'sandbox.operation_timeout', 'sandbox.cancelled']);

/**
 * The lane of one installation. `create` starts the runner of the package for background runs (the same bundle, contract and grants as the first,
 * with `SANDBOX_BACKGROUND_LIMITS` and no `background` service, so a run cannot start more runs); it is called when the first run is accepted.
 * Cancelling a run that is already executing ends the process, since the sandbox cannot interrupt a running function, and the runs queued
 * behind it end with it.
 */
export function createBackgroundLane(options: { contract: SandboxPluginContract; create(): Promise<SandboxRunner> }): SandboxBackgroundLane {
  const operations = new Map(options.contract.operations.map(operation => [operation.id, operation]));
  let live: Promise<SandboxRunner> | undefined, stopped = false;
  const discard = (gone: Promise<SandboxRunner>) => { if (live === gone) live = undefined; void gone.then(runner => runner.stop(), () => undefined); };
  return {
    check(operationId, input) {
      const operation = operations.get(operationId);
      if (!operation || operation.kind !== 'command') throw new SandboxError('sandbox.invalid_request', `${operationId} is not a command of this package`);
      assertMatches(operation.input, input);
    },
    async run(operationId, input, control) {
      if (stopped) throw new SandboxError('sandbox.stopped', 'The background lane is stopped');
      const process = live ??= options.create();
      let runner: SandboxRunner;
      try { runner = await process; } catch (error) { discard(process); throw error; }
      if (stopped) { await runner.stop(); throw new SandboxError('sandbox.stopped', 'The background lane stopped while opening its process'); }
      control.signal?.throwIfAborted();
      try { return await runner.call(operationId, input, control); }
      catch (error) { if (error instanceof SandboxError && PROCESS_GONE.has(error.code)) discard(process); throw error; }
    },
    async stop() { stopped = true; const gone = live; live = undefined; if (gone) await (await gone.catch(() => undefined))?.stop(); },
  };
}
