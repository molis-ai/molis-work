import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { StepNode, StepReportAuthor } from "./shapes.js";
import type { Translate } from "./types.js";

/** Page words for a holder or report author; a subtask keeps its actual title, never the Host's label. */
export function stepActorText(_L: Translate, value: NonNullable<StepNode["owner"]> | StepReportAuthor): string {
  if (value.kind === "handover") return uiText.text("coding.board.reassigned");
  if (value.kind === "subtask") return value.title ? uiText.text("coding.board.holder-subtask", { title: value.title }) : uiText.text("coding.board.subtask");
  return value.kind === "session" ? uiText.text("coding.board.this-session") : value.kind === "person" ? uiText.text("coding.board.you") : value.kind === "none" ? uiText.text("coding.board.unclaimed") : uiText.text("coding.board.holder-other");
}
