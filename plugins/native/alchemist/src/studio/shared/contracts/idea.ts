import { z } from "zod";

export interface IdeaBriefContent {
  sourceLabel: string;
  title: string;
  highlight: string;
  targetUser: string;
  scenario: string;
  problem: string;
  mechanism: string;
  valueProposition: string;
  whyItMayWork: string;
  assumptions: readonly string[];
  unknowns: readonly string[];
  mvp: { inScope: readonly string[]; outOfScope: readonly string[] };
}

export type IdeaBriefModel =
  | (IdeaBriefContent & {
      kind: "candidate";
      cardId: string;
      status: "candidate" | "discarded";
    })
  | (IdeaBriefContent & {
      kind: "idea";
      ideaId: string;
      version: number;
      currentVersion: number;
    });

export type CandidateBriefResponse =
  | { kind: "candidate"; model: Extract<IdeaBriefModel, { kind: "candidate" }> }
  | { kind: "idea_redirect"; ideaId: string; version: number };

export interface KeepIdeaResponse {
  idea: { id: string; directionId: string; currentVersion: number };
  version: { revision: { version: number }; sourceCardId: string };
}

export const ideaCardParamsSchema = z.object({ id: z.string().min(1) }).strict();
export const ideaVersionParamsSchema = z
  .object({ id: z.string().min(1), version: z.coerce.number().int().positive() })
  .strict();
