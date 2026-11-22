import type { PluginInstanceRecord, PluginLifecycleState, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import { STATE_VOCABULARIES } from "@molis-ai/molis-work-contracts/platform/state-vocabulary";
import { defineStateMachine, stateMachineErrors } from "@molis-ai/molis-work-plugin-sdk/state-machine";

/**
 * The lifecycle of one installation, declared with the same helper plugin authors use (specs/state-machine-platform SMP-20):
 * its states and families are the public vocabulary's, its transitions are the ones the Runtime performs. No state is terminal:
 * an uninstalled installation can be installed again.
 */
export const PLUGIN_LIFECYCLE_MACHINE = defineStateMachine({
  machine_id: "platform.plugin-runtime.lifecycle",
  version: /* @version state-machine.platform.plugin-runtime.lifecycle */ 1,
  states: STATE_VOCABULARIES.pluginLifecycle.states,
  initial: "installed",
  terminal: [],
  transitions: {
    /** A confirmed install over the record an uninstall left behind. */
    install: { from: ["uninstalled"], to: "installed" },
    /** A version change, or a recovery that leaves it ready to start. */
    reset: { from: ["disabled", "crashed"], to: "installed" },
    /** Stopped while it stays enabled (a Host stopping, a restart). */
    pause: { from: ["running"], to: "installed" },
    start: { from: ["installed", "disabled", "crashed"], to: "running" },
    disable: { from: ["installed", "running", "crashed"], to: "disabled" },
    crash: { from: ["installed", "running", "disabled"], to: "crashed" },
    quarantine: { from: ["crashed"], to: "quarantined" },
    release: { from: ["quarantined"], to: "crashed" },
    uninstall: { from: ["installed", "running", "disabled", "crashed", "quarantined"], to: "uninstalled" },
  },
});

const STEPS = new Set(Object.values(PLUGIN_LIFECYCLE_MACHINE.definition.transitions).flatMap(edge => edge.from.map(from => `${from}>${edge.to}`)));

/**
 * Refuses a lifecycle write the machine does not declare: an unknown state, a first record that is not `installed`, or a step
 * between two states no transition connects. Writing the state it already has is not a step.
 */
export function assertLifecycleStep(from: PluginLifecycleState | undefined, to: PluginLifecycleState): void {
  PLUGIN_LIFECYCLE_MACHINE.family(to);
  if (from === to) return;
  if (from === undefined ? to !== PLUGIN_LIFECYCLE_MACHINE.definition.initial : !STEPS.has(`${from}>${to}`)) {
    throw stateMachineErrors.transition_invalid(`状态机 ${PLUGIN_LIFECYCLE_MACHINE.definition.machine_id} 不允许从 ${from ?? "未安装"} 到 ${to}`);
  }
}

/** The Runtime's own view of its repository: every record it saves is a declared lifecycle step from the record it replaces. */
export function lifecycleGuarded(repository: PluginRuntimeRepository): PluginRuntimeRepository {
  return {
    get: installId => repository.get(installId),
    list: () => repository.list(),
    save(record: PluginInstanceRecord) {
      assertLifecycleStep(repository.get(record.install_id)?.state, record.state);
      repository.save(record);
    },
  };
}
