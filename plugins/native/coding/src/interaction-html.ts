import type { AgentSubagentConversation } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInteractionClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { isTerminalAgentPhase, type AgentRunPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { actionCardView, type ActionCard } from "@molis-ai/molis-work-plugin-sdk";
import { codingFollowUps, type CodingFollowUpRun } from "./next-steps.js";
import { codingText } from "./words.js";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { SkillPick } from "@molis-ai/molis-work-contracts/services/skills";
import { skillRefKey } from "@molis-ai/molis-work-plugin-sdk/skill-ref";
import { renderSkillLine } from "@molis-ai/molis-work-plugin-sdk/ui";

type SkillFacts = { ref?: { run_id?: string }; frozen?: { skills?: Array<{ ref: SkillRef; name: string; origin: string; named: boolean }> }; skill_reads?: Array<{ ref: SkillRef; name: string }> };

/**
 * The Skills one round used (SKL-11): the catalog Skills it was started with (the person's choice for it), then those it read of its
 * own choice, from the Agent Host's record of its catalog reads. The role's own Skills are part of the role, not a pick.
 */
export function roundSkillPicks(run: SkillFacts): SkillPick[] {
  const named = (run.frozen?.skills ?? []).filter(skill => skill.origin === "catalog").map(skill => ({ ref: skill.ref, name: skill.name, picked: "named" as const }));
  const keys = new Set(named.map(pick => skillRefKey(pick.ref)));
  return [...named, ...(run.skill_reads ?? []).filter(read => !keys.has(skillRefKey(read.ref))).map(read => ({ ref: read.ref, name: read.name, picked: "auto" as const }))];
}

type RoundsBody = { runs?: Array<CodingFollowUpRun & SkillFacts & { turns?: unknown; awaiting_input?: AgentPendingQuestion[]; cards?: Array<ActionCard & { run_id?: string }> }> };

/**
 * A round's question cards, its suggestions' cards (D25) and the row beside the composer (AC-25, AC-06), drawn by the platform
 * as the Assistant draws them (`services.interaction`, PG-062). Only a route's answer gets them, as it gets the drawn words
 * (`rich-html.ts`). Every round the page receives in full is drawn, so a round it keeps unchanged keeps its row; the page shows
 * the latest one's. The row is the round's questions and cards, then, once the round is over, the result of its card that ran
 * last, then the round card's own follow-ups; every step presses a control already on screen.
 */
export async function codingInteractionHtml<T>(body: T, interaction: PluginInteractionClient | undefined, _locale: ActionLocale | undefined): Promise<T> {
  const child = body as AgentSubagentConversation | undefined;
  if (interaction && child?.child && Array.isArray(child.questions)) await Promise.all(child.questions.map(async question => {
    Object.assign(question, { html: await interaction.questionHtml(question) });
  }));
  const page = body as RoundsBody | undefined;
  if (!interaction || !Array.isArray(page?.runs)) return body;
  const say = codingText;
  await Promise.all(page.runs.map(async run => {
    // Recovery reports also list runs, but carry receipt facts rather than turns.
    if (!Array.isArray(run.turns) || !Array.isArray(run.awaiting_input)) return;
    const questions = run.awaiting_input, cards = run.cards ?? [], views = cards.map(card => actionCardView(card));
    const [questionHtml, cardHtml, next] = await Promise.all([
      // The same question card the Assistant shows; Coding's page restores its own drafts into it.
      Promise.all(questions.map(question => interaction.questionHtml(question, { reask: true }))),
      // Coding keeps its cards and runs them; the platform only draws them.
      Promise.all(views.map(view => interaction.cardHtml(view))),
      interaction.nextStepsHtml({ questions, cards: views, finished: isTerminalAgentPhase(run.phase as AgentRunPhase), follow_ups: codingFollowUps(run, say) }),
    ]);
    questions.forEach((question, index) => Object.assign(question, { html: questionHtml[index] }));
    cards.forEach((card, index) => Object.assign(card, { html: cardHtml[index] }));
    Object.assign(run, { next_html: next });
    const picks = roundSkillPicks(run);
    // The Skills the round used, one line above its reply (SKL-11). 「这一轮没用技能」 is said only of a round that is over.
    if (picks.length || isTerminalAgentPhase(run.phase as AgentRunPhase)) Object.assign(run, { skills_html: renderSkillLine({ picks, round: run.ref?.run_id ?? "", words: {
      used: say("coding.skills.used"), auto: say("coding.skills.auto"), named: say("coding.skills.named"), none: say("coding.skills.none"), choose: say("coding.skills.choose") } }) });
  }));
  return body;
}
