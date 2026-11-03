import { errorMessage } from "../dom.js";
import type { ClickRule } from "./click-types.js";
import { controls } from "./controls.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { readCheckpoints, readRecovery } from "./recovery.js";
import { api, sessionPath, status } from "./request.js";

/** Ends an interrupted round the Host listed (it checks the version the person saw). */
async function recover(page: Page, target: HTMLButtonElement) {
  const { L, q, s } = page;
  if (s.recoveryBusy || target.disabled) return;
  const id = s.current, ticket = s.generation;
  s.recoveryBusy = true;
  q("[data-coding-recovery]").querySelectorAll("button").forEach(button => { button.disabled = true; });
  try {
    await api(page, sessionPath(id, target.dataset.codingRecover) + "/recover", "POST", { expected_version: Number(target.dataset.version) });
    if (s.current === id && s.generation === ticket) {
      status(page, L("coding.recovery.ended"));
      await readCurrent(page);
    }
  } catch (error) {
    if (s.current === id && s.generation === ticket) status(page, L("coding.recovery.end-failed", { reason: errorMessage(error) }), true);
  } finally {
    if (s.current === id && s.generation === ticket) {
      s.recoveryBusy = false;
      if (s.recovery) await readRecovery(page);
      controls(page);
    }
  }
}

/** Previews rewinding to a checkpoint: a rewind is the person's own reviewed file change, not a round. */
async function rewind(page: Page, target: HTMLButtonElement) {
  const { L, lifetime, q, s } = page, id = s.current, ticket = s.generation;
  s.checkpointBusy = true;
  controls(page);
  try {
    const chosen = q<HTMLSelectElement>("[data-coding-intent]").value, intent = ["edit", "execute"].includes(chosen) ? chosen : "edit";
    await api(page, sessionPath(id) + "/checkpoints/" + encodeURIComponent(target.dataset.codingRewind || "") + "/rewind", "POST", { intent });
    if (s.current === id && s.generation === ticket) {
      status(page, L("coding.checkpoints.preview-ready"));
      await readCurrent(page);
    }
  } catch (error) {
    if (!lifetime.alive) return;
    if (s.current === id && s.generation === ticket) {
      s.checkpointBusy = false;
      throw error;
    }
  } finally {
    controls(page);
  }
}

export const RECOVERY_CLICKS: readonly ClickRule[] = [
  ["[data-coding-recovery-refresh]", page => readRecovery(page)],
  ["[data-coding-recover]", recover],
  ["[data-coding-checkpoints-refresh]", page => readCheckpoints(page)],
  ["[data-coding-rewind]", rewind],
];
