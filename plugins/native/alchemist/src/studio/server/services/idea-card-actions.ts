import type { IdeaCard } from "../../domain/discovery/idea-card.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type {
  CandidateBriefResponse,
  IdeaBriefContent,
  IdeaBriefModel,
} from "../../shared/contracts/idea.js";
import type { SqliteDirectionRepository } from "../db/direction-repository.js";
import type { SqliteIdeaRepository } from "../db/idea-repository.js";

export class IdeaActionError extends Error {
  readonly name = "IdeaActionError";

  constructor(
    readonly code:
      | "IDEA_CARD_NOT_FOUND"
      | "IDEA_CARD_ALREADY_KEPT"
      | "IDEA_CARD_NOT_CANDIDATE"
      | "IDEA_CARD_NOT_DISCARDED"
      | "IDEA_VERSION_NOT_FOUND",
    readonly ideaId?: string,
  ) {
    super(code);
  }
}

interface IdeaCardActionDependencies {
  actorId: string;
  clock: Clock;
  idFactory: IdFactory;
  directions: SqliteDirectionRepository;
  ideas: SqliteIdeaRepository;
}

export function createIdeaCardActions(dependencies: IdeaCardActionDependencies) {
  const getIdeaVersionView = (ideaId: string, versionNumber: number) => {
    const idea = dependencies.ideas.getIdea(ideaId);
    const version = dependencies.ideas.getVersion(ideaId, versionNumber);
    if (!idea || !version) throw new IdeaActionError("IDEA_VERSION_NOT_FOUND");
    const sourceCard = requireCard(dependencies.ideas, version.sourceCardId);
    const model: IdeaBriefModel = {
      kind: "idea",
      ideaId: idea.id,
      version: version.revision.version,
      currentVersion: idea.currentVersion,
      sourceLabel: `来自候选牌 · ${sourceCard.title}`,
      title: version.content.title,
      highlight: version.content.highlight,
      targetUser: version.content.targetUser,
      scenario: version.content.scenario,
      problem: version.content.coreProblem,
      mechanism: version.content.coreMechanism,
      valueProposition: version.content.valueProposition,
      whyItMayWork: version.content.whyItMayWork,
      assumptions: version.content.assumptions,
      unknowns: version.content.unknowns,
      mvp: version.content.mvp,
    };
    return { idea, version, model };
  };

  return {
    getCandidateBrief(cardId: string): CandidateBriefResponse {
      const card = requireCard(dependencies.ideas, cardId);
      if (card.status === "kept") {
        return { kind: "idea_redirect", ideaId: card.keptIdeaId, version: 1 };
      }
      const direction = dependencies.directions.get(card.directionId);
      if (!direction) throw new IdeaActionError("IDEA_CARD_NOT_FOUND");
      return {
        kind: "candidate",
        model: {
          kind: "candidate",
          cardId: card.id,
          status: card.status,
          sourceLabel: `来自 Direction · ${direction.title}`,
          ...contentFromCard(card),
        },
      };
    },

    keep(cardId: string) {
      const card = requireCard(dependencies.ideas, cardId);
      if (card.status === "kept") {
        throw new IdeaActionError("IDEA_CARD_ALREADY_KEPT", card.keptIdeaId);
      }
      if (card.status !== "candidate") throw new IdeaActionError("IDEA_CARD_NOT_CANDIDATE");
      const now = dependencies.clock.now();
      const kept = dependencies.ideas.keepCard({
        cardId,
        ideaId: dependencies.idFactory.next("idea"),
        ideaVersionId: dependencies.idFactory.next("idea_version"),
        actorId: dependencies.actorId,
        now,
      });
      return { ...kept, card: dependencies.ideas.getCard(cardId) as IdeaCard };
    },

    discard(cardId: string) {
      return dependencies.ideas.discardCard({
        cardId,
        activityId: dependencies.idFactory.next("activity"),
        now: dependencies.clock.now(),
      });
    },

    restore(cardId: string) {
      return dependencies.ideas.restoreCard({
        cardId,
        activityId: dependencies.idFactory.next("activity"),
        now: dependencies.clock.now(),
      });
    },

    getIdeaVersionView,
  };
}

export type IdeaCardActions = ReturnType<typeof createIdeaCardActions>;

function requireCard(ideas: SqliteIdeaRepository, cardId: string): IdeaCard {
  const card = ideas.getCard(cardId);
  if (!card) throw new IdeaActionError("IDEA_CARD_NOT_FOUND");
  return card;
}

function contentFromCard(card: IdeaCard): Omit<IdeaBriefContent, "sourceLabel"> {
  return {
    title: card.title,
    highlight: card.highlight,
    targetUser: card.targetUser,
    scenario: card.scenario,
    problem: card.problem,
    mechanism: card.mechanism,
    valueProposition: card.valueProposition,
    whyItMayWork: card.whyItMayWork,
    assumptions: card.assumptions,
    unknowns: card.unknowns,
    mvp: card.mvp,
  };
}
