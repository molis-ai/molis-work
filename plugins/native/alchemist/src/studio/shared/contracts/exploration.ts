import { z } from "zod";

export const directionUnderstandingSchema = z
  .object({
    summary: z.string().trim().min(1),
    assumptions: z.array(z.string().trim().min(1)),
    unknowns: z.array(z.string().trim().min(1)),
    concreteness: z.enum(["direction", "specific_idea"]),
  })
  .strict();

export const ideaCardDraftSchema = z
  .object({
    title: z.string().trim().min(1),
    highlight: z.string().trim().min(1),
    targetUser: z.string().trim().min(1),
    scenario: z.string().trim().min(1),
    problem: z.string().trim().min(1),
    mechanism: z.string().trim().min(1),
    valueProposition: z.string().trim().min(1),
    whyItMayWork: z.string().trim().min(1),
    assumptions: z.array(z.string().trim().min(1)).min(1),
    unknowns: z.array(z.string().trim().min(1)).min(1),
    mvp: z
      .object({
        inScope: z.array(z.string().trim().min(1)).min(1),
        outOfScope: z.array(z.string().trim().min(1)).min(1),
      })
      .strict(),
  })
  .strict();

export const explorationGenerationSchema = z
  .object({
    understanding: directionUnderstandingSchema,
    cards: z.array(ideaCardDraftSchema),
    // Structured Outputs strict mode requires every property to be required.
    // `null` carries the deliberate "cards were generated" state.
    noCardsReason: z.string().trim().min(1).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.cards.length === 0 && !value.noCardsReason) {
      context.addIssue({
        code: "custom",
        path: ["noCardsReason"],
        message: "没有可用卡牌时必须说明原因",
      });
    }
  });

export type ExplorationGeneration = z.infer<typeof explorationGenerationSchema>;
export type IdeaCardDraft = z.infer<typeof ideaCardDraftSchema>;
