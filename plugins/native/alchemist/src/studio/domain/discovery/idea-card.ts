import type { Idea, IdeaVersion } from "../ideas/idea.js";

interface IdeaCardBase {
  id: string;
  explorationRunId: string;
  directionId: string;
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
  mvp: {
    inScope: readonly string[];
    outOfScope: readonly string[];
  };
  createdAt: string;
}

export type IdeaCard = IdeaCardBase &
  (
    | { status: "candidate" }
    | { status: "discarded"; discardedAt: string }
    | { status: "kept"; keptAt: string; keptIdeaId: string }
  );

export class IdeaCardTransitionError extends Error {
  readonly name = "IdeaCardTransitionError";

  constructor(readonly code: "IDEA_CARD_NOT_CANDIDATE" | "IDEA_CARD_NOT_DISCARDED") {
    super(code);
  }
}

export function discardCard(card: IdeaCard, discardedAt: string): IdeaCard {
  if (card.status !== "candidate") {
    throw new IdeaCardTransitionError("IDEA_CARD_NOT_CANDIDATE");
  }
  return { ...card, status: "discarded", discardedAt };
}

export function restoreCard(card: IdeaCard): IdeaCard {
  if (card.status !== "discarded") {
    throw new IdeaCardTransitionError("IDEA_CARD_NOT_DISCARDED");
  }
  const { discardedAt: _discardedAt, ...candidate } = card;
  return { ...candidate, status: "candidate" };
}

export interface KeepCardInput {
  ideaId: string;
  ideaVersionId: string;
  actorId: string;
  now: string;
}

export interface KeepCardResult {
  card: IdeaCard;
  idea: Idea;
  version: IdeaVersion;
}

export function keepCard(card: IdeaCard, input: KeepCardInput): KeepCardResult {
  if (card.status !== "candidate") {
    throw new IdeaCardTransitionError("IDEA_CARD_NOT_CANDIDATE");
  }

  return {
    card: {
      ...card,
      status: "kept",
      keptAt: input.now,
      keptIdeaId: input.ideaId,
    },
    idea: {
      id: input.ideaId,
      directionId: card.directionId,
      lifecycle: "exploring",
      currentVersion: 1,
      createdAt: input.now,
      updatedAt: input.now,
    },
    version: {
      id: input.ideaVersionId,
      ideaId: input.ideaId,
      sourceCardId: card.id,
      sourceExplorationRunId: card.explorationRunId,
      revision: {
        version: 1,
        actorId: input.actorId,
        reason: "kept_idea_card",
        createdAt: input.now,
      },
      content: {
        title: card.title,
        highlight: card.highlight,
        targetUser: card.targetUser,
        scenario: card.scenario,
        coreProblem: card.problem,
        coreMechanism: card.mechanism,
        valueProposition: card.valueProposition,
        whyItMayWork: card.whyItMayWork,
        assumptions: card.assumptions,
        unknowns: card.unknowns,
        mvp: card.mvp,
      },
    },
  };
}
