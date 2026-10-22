import { createHash } from "node:crypto";
import type { HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";

/** Steps whose repetition with no visible change means the interface is stuck. */
function repeatsUntilStuck(action: HostSurfaceAction): boolean {
  return action.what === "pointer" || action.what === "scroll" || action.what === "drag";
}

/** Steps that normally change what the accessibility tree can read. Saving or copying may not, so they only get a note. */
function visibleChangeExpected(action: HostSurfaceAction): boolean {
  return action.what === "pointer" || action.what === "scroll" || action.what === "drag" || action.what === "text" || action.what === "key";
}

/** The same step, in a stable order, so a retry is recognized even when the action object's keys differ. */
function actionSignature(action: HostSurfaceAction): string {
  switch (action.what) {
    case "pointer": return ["pointer", action.x, action.y, action.button, action.clicks, action.node ?? ""].join("\u0000");
    case "scroll": return ["scroll", action.x, action.y, action.dx, action.dy].join("\u0000");
    case "drag": return ["drag", action.x, action.y, action.to_x, action.to_y].join("\u0000");
    default: return JSON.stringify(action);
  }
}

export function treeHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface StepBefore {
  readonly signature: string;
  /** The tree as the model last saw it, or null before any look or after an app switch. */
  readonly beforeHash: string | null;
  /** Why this step is refused before it is sent, or null when it may run. */
  readonly stuck: string | null;
}

interface StepAfter {
  readonly action: HostSurfaceAction;
  readonly signature: string;
  readonly beforeHash: string | null;
  readonly afterHash: string;
}

/**
 * What the model last saw and what the last step left (specs/computer-use §9, CU-G07): a step that changes nothing is
 * told so, and a third identical repeat is refused instead of burning the round. One per driver; reset when the round
 * or the app changes. The tree is the same text the model reads, so a note is about what it can actually check.
 */
export class StepProgress {
  private lastTreeHash: string | null = null;
  private lastAction: { readonly signature: string; readonly treeHash: string } | null = null;
  private unchangedAttempts = 0;

  reset(): void {
    this.lastTreeHash = null;
    this.lastAction = null;
    this.unchangedAttempts = 0;
  }

  /** A look: the tree the model now sees is the baseline for the next step. A different tree clears an old repeat. */
  seen(text: string): void {
    const hash = treeHash(text);
    if (this.lastTreeHash !== null && this.lastTreeHash !== hash) {
      this.lastAction = null;
      this.unchangedAttempts = 0;
    }
    this.lastTreeHash = hash;
  }

  before(action: HostSurfaceAction): StepBefore {
    const signature = actionSignature(action);
    const beforeHash = this.lastTreeHash;
    const last = this.lastAction;
    const stuck = repeatsUntilStuck(action) && beforeHash !== null && last !== null && last.signature === signature
      && last.treeHash === beforeHash && this.unchangedAttempts >= 3
      ? "同一个动作已经按原样试了 3 次，窗口没有变化；换一个办法（菜单、快捷键、先重新观察或滚动），或者问用户。" : null;
    return { signature, beforeHash, stuck };
  }

  /** The note for the step's receipt, and the state the next step compares against. */
  after(step: StepAfter): string {
    const unchanged = step.beforeHash !== null && step.beforeHash === step.afterHash;
    if (repeatsUntilStuck(step.action)) {
      const last = this.lastAction;
      const same = last !== null && last.signature === step.signature && last.treeHash === step.beforeHash;
      this.unchangedAttempts = unchanged ? (same ? this.unchangedAttempts + 1 : 1) : 0;
      this.lastAction = { signature: step.signature, treeHash: step.afterHash };
    } else {
      this.lastAction = null;
      this.unchangedAttempts = 0;
    }
    this.lastTreeHash = step.afterHash;
    return unchanged && visibleChangeExpected(step.action)
      ? "\n\n（这一步之后窗口的辅助功能树没有变化：可能没有生效、点在空白处，或界面还没更新；如果这是保存、复制这类不改可读元素的操作，可以按结果核对。先确认，再决定是否重试或换办法。）"
      : "";
  }
}
