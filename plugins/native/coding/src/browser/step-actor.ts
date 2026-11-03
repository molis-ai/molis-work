import type { StepNode, StepReportAuthor } from "./shapes.js";
import type { Translate } from "./types.js";

/** Page words for a holder or report author; a subtask keeps its actual title, never the Host's label. */
export function stepActorText(L: Translate, value: NonNullable<StepNode["owner"]> | StepReportAuthor): string {
  if (value.kind === "handover") return L("coding.board.reassigned");
  if (value.kind === "subtask") return value.title ? L("coding.board.holder-subtask", { title: value.title }) : L("coding.board.subtask");
  return value.kind === "session" ? L("coding.board.this-session") : value.kind === "person" ? L("coding.board.you") : value.kind === "none" ? L("coding.board.unclaimed") : L("coding.board.holder-other");
}
