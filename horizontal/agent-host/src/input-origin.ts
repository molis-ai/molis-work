import type { AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "./errors.js";

/**
 * The supplement a person's new step is for (specs/ai-input-receipts D2, stages 3d-3 and 3d-5): one input of this very
 * round, as the round's own record has it, and not one taken back. A forged id, one of another session or round, or a
 * withdrawn one is refused before anything is written: by the Host's action once the call is current, and again by the
 * runtime right before the board takes the step.
 */
export function checkOrigin(inputId: string, turns: readonly AgentTurnView[]): void {
  const steer = turns.find(turn => turn.steer?.id === inputId)?.steer;
  if (!steer) throw agentErrors.input_not_origin("这条补充不是这一轮的输入，不能作为新步骤的来源");
  if (steer.state === "withdrawn") throw agentErrors.input_not_origin("这条补充已经撤回，不能作为新步骤的来源");
}
