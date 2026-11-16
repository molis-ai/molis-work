import { bindActionHandler, type ActionCallContext, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAINLINE_PROVIDER_ID, mainlineActions } from "@molis-ai/molis-work-contracts/services/mainline";
import { decideBackgroundTask, openObject, placeTask, readBackgroundTasks, readWaiting, readWorkLine, runBackgroundTaskCommand } from "@molis-ai/molis-work-service-mainline";

/**
 * The mainline service in the Host (specs/work-line §5–§6), registered once as `system.mainline`: every call is answered by
 * `horizontal/mainline` through the caller's own client, so the directory, the grants and the diagnostics are the caller's.
 */
export function mainlineProvider(clientFor: (caller: ActionCallContext) => ActionClient): ActionProviderRegistration {
  return { provider: { provider_id: MAINLINE_PROVIDER_ID, title: "事项线与后台任务", kind: "system" }, definitions: [mainlineActions.line, mainlineActions.waiting, mainlineActions.place, mainlineActions.tasks, mainlineActions.command, mainlineActions.decide, mainlineActions.open],
    handlers: [
      bindActionHandler(mainlineActions.line, (input, caller) => readWorkLine(caller, clientFor(caller), input)),
      bindActionHandler(mainlineActions.waiting, (input, caller) => readWaiting(caller, clientFor(caller), input)),
      bindActionHandler(mainlineActions.place, (input, caller) => placeTask(caller, clientFor(caller), input)),
      bindActionHandler(mainlineActions.tasks, (_input, caller) => readBackgroundTasks(caller, clientFor(caller))),
      bindActionHandler(mainlineActions.command, (input, caller) => runBackgroundTaskCommand(caller, clientFor(caller), input)),
      bindActionHandler(mainlineActions.decide, (input, caller) => decideBackgroundTask(caller, clientFor(caller), input)),
      bindActionHandler(mainlineActions.open, (input, caller) => openObject(caller, clientFor(caller), input)),
    ] };
}
