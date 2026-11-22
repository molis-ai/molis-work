import { GOALS_PLUGIN_API } from "../plugin-api.js";
import { messageOf } from "./dom.js";
import type { Route, ShowToast } from "./types.js";

export interface LifecycleHost {
  readonly route: Route;
  readonly showToast: ShowToast;
  readonly navigate: (url: string) => void;
}

/** Archiving and restoring a Goal from its page. */
export function lifecycleClient(host: LifecycleHost) {
  const { route, showToast, navigate } = host;
  const handleMatchedLifecycleClick = async (target: Element) => {
    const archiveAction = target.closest<HTMLButtonElement>("[data-goal-archive]");
    if (!archiveAction) return;
    archiveAction.disabled = true;
    const archived = archiveAction.dataset.goalArchive === "true";
    const goalId = archiveAction.dataset.goalId || "";
    try {
      await molisWorkRequest(route(GOALS_PLUGIN_API + "/goals/" + encodeURIComponent(goalId) + "/archive"), {
        method: "POST",
        body: {
          archived,
          reason: archived ? "用户在 Molis Work 手动归档已完成 Goal" : "用户在 Molis Work 恢复归档 Goal",
        },
        fallback: "操作失败",
      });
      navigate(route((archived ? "/archive/goals/" : "/goals/") + encodeURIComponent(goalId)));
    } catch (error) {
      archiveAction.disabled = false;
      showToast(messageOf(error) || "操作失败", true);
    }
  };
  const handleGoalLifecycleClick = (target: Element) => target.closest("[data-goal-archive]")
    ? handleMatchedLifecycleClick(target) : null;
  return { handleGoalLifecycleClick };
}
