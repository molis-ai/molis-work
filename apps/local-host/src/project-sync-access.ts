import type { LocalHost } from './local-host.js';
import type { MolisWorkProjectRuntime } from './project-host.js';
import type { LocalHostProjectReference } from '@molis-ai/molis-work-contracts/platform/app-host';

/** Synchronization observes only already-open project instances and never starts or activates a stopped one. */
export function projectSyncAccess(host: LocalHost<MolisWorkProjectRuntime>) {
  return Object.freeze({
    withExistingProject<Result>(reference: LocalHostProjectReference, operation: (runtime: MolisWorkProjectRuntime) => Result | Promise<Result>): Promise<Result | null> {
      return host.withExistingRuntime(reference, operation);
    },
    isProjectBusy(storageKey: string): boolean { return host.isProjectBusy(storageKey); },
  });
}
