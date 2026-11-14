import type { ContractDescriptor } from "./package.js";
import type { StateRingFamily } from "./ui-state-rings.js";

export const stateVocabularyContract = {
  contractId: /* @version contract.io.molis.work.platform.state-vocabulary "io.molis.work.platform.state-vocabulary.v{version}" */ "io.molis.work.platform.state-vocabulary.v1",
  kind: "platform",
  schemaVersion: /* @version contract.io.molis.work.platform.state-vocabulary */ 1,
  maturity: "partial",
  ssot: "specs/state-machine-platform/spec.md",
} as const satisfies ContractDescriptor;

export interface PlatformStateVocabulary {
  readonly owner: string;
  readonly public: boolean;
  readonly states: Readonly<Record<string, StateRingFamily>>;
  readonly consumer: string;
}

/** Public spellings come from the services' existing contracts. This table records their families. */
export const STATE_VOCABULARIES = {
  pluginLifecycle: {
    owner: "plugin-runtime", public: true, consumer: "platform/plugin",
    states: { installed: "idle", running: "running", disabled: "paused", crashed: "failed", quarantined: "blocked", uninstalled: "archived" },
  },
  connectorConnection: {
    owner: "connector-host", public: true, consumer: "services/connector-host",
    states: { connected: "connected", reauth_required: "answer", disconnected: "disconnected" },
  },
  agentRun: {
    owner: "agent-host", public: true, consumer: "services/agent-host",
    states: {
      starting: "running", running: "running", "awaiting-review": "answer", "awaiting-input": "answer",
      paused: "paused", compacting: "running", completed: "done", failed: "failed", cancelled: "paused",
      stopped: "paused", "reconcile-required": "verify",
    },
  },
  knowledgeCard: {
    owner: "knowledge", public: true, consumer: "services/knowledge",
    states: { pending: "waiting", ready: "connected", listed: "done", failed: "failed", over_quota: "blocked", missing: "disconnected" },
  },
  placementObject: {
    owner: "placement", public: true, consumer: "services/placement",
    states: { ok: "connected", missing: "disconnected", unavailable: "blocked" },
  },
} as const satisfies Readonly<Record<string, PlatformStateVocabulary>>;
