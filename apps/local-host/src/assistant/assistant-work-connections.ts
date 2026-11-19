import { isDeepStrictEqual } from "node:util";
import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentQuestion, AgentQuestionAnswer } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { SKILLS_PROVIDER_ID, skillCatalogActions } from "@molis-ai/molis-work-contracts/services/skills";
import { CONNECTOR_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/connector-host";
import { connectorRecordActions } from "../connector-record-actions.js";
import { accountQuestion, homeCategoryAccounts, isAccountQuestionId, withWorkSkillConnections } from "../agent-definitions/skill-connector-categories.js";
import { assistantErrors } from "./assistant-errors.js";
import type { AssistantStore, StoredWork } from "./assistant-store.js";

export const workConnectionsKey = (workId: string) => `connection-choice:${workId}`;
type Choices = Pick<AssistantStore, "setting" | "setSetting">;

function choicesOf(store: Choices, work: StoredWork): Record<string, string> {
  return JSON.parse(store.setting(work.actor_id, workConnectionsKey(work.work_id)) ?? "{}");
}

export function readWorkSkills<T>(store: Choices, work: StoredWork, categories: Set<string>, read: () => T): T {
  const chosen = choicesOf(store, work);
  return withWorkSkillConnections({ chosen: category => chosen[category] ?? null, used: category => { categories.add(category); } }, read);
}

/** The round sees the work's actual choices, and its account reads obey them. The user's other works have their own choices. */
export function assistantWorkConnections(home: string, store: Choices, work: StoredWork, named: ReadonlySet<string> | undefined) {
  const categories = new Set(named);
  return async (action: ActionReference, input: unknown, invoke: () => Promise<unknown>): Promise<unknown> => {
    if (action.provider_id === SKILLS_PROVIDER_ID && action.capability_id === skillCatalogActions.readBodies.capability_id)
      return readWorkSkills(store, work, categories, invoke);
    if (action.provider_id === CONNECTOR_PROVIDER_ID && action.capability_id === connectorRecordActions.read.capability_id
      && input && typeof input === "object" && "connection_id" in input) {
      const chosen = choicesOf(store, work);
      const active = new Set([...categories, ...Object.keys(chosen)]);
      if (!active.size) return invoke();
      const accounts = await homeCategoryAccounts(home);
      const requested = "connector_category" in input ? input.connector_category : undefined;
      const matching = [...active].filter(category => accounts.get(category)?.some(account => account.connection_id === input.connection_id));
      if (requested !== undefined && !matching.includes(String(requested)))
        throw assistantErrors.action_revoked("所选账号当前不能用于这个技能需要的连接类别");
      for (const category of requested === undefined ? matching : [String(requested)]) {
        const candidates = accounts.get(category)!;
        const selected = chosen[category];
        if (selected === input.connection_id || !selected && candidates.length === 1) continue;
        if (selected && candidates.some(account => account.connection_id === selected))
          throw assistantErrors.action_revoked(`本工作已选这个类别的账号，按原选择调用。连接 ID：${selected}`);
        const question = accountQuestion(category, candidates);
        throw assistantErrors.action_revoked(`请先用 ask-user 单选本工作要用的账号。问题 id：${question.id}，选项依次为 ${JSON.stringify(question.choices.map(option => option.label))}。`);
      }
    }
    return invoke();
  };
}

/** A model can ask the question. The original answer's commit binds one current account to this work. */
export async function prepareWorkConnectionAnswer(home: string, store: Choices, work: StoredWork, questions: readonly AgentQuestion[],
  answers: readonly AgentQuestionAnswer[] | undefined): Promise<() => void> {
  const [question] = questions, [answer] = answers ?? [];
  if (questions.length !== 1 || answers?.length !== 1 || !question || !isAccountQuestionId(question.id)
    || question.type !== "choice" || !question.required || question.multiple || question.allow_other
    || answer?.question !== question.index || answer.indexes?.length !== 1 || answer.other !== undefined || answer.value !== undefined) {
    throw assistantErrors.invalid("请用本工作的账号单选题选择一个账号");
  }
  const accounts = await homeCategoryAccounts(home);
  const matched = [...accounts].map(([category, candidates]) => ({ category, current: accountQuestion(category, candidates) }))
    .find(row => row.current.id === question.id);
  if (!matched) throw assistantErrors.stale("账号候选已变化，请从当前目录重新选择");
  const { category, current } = matched;
  const option = question.options.find(row => row.index === answer.indexes![0]);
  const choice = current.choices.find(row => row.label === option?.label);
  if (!choice || !isDeepStrictEqual(current.choices.map(row => row.label), question.options.map(row => row.label))) {
    throw assistantErrors.stale("账号候选已变化，请从当前目录重新选择");
  }
  return () => {
    const chosen = choicesOf(store, work), prior = chosen[category];
    if (prior === choice.connection_id) return;
    if (prior && current.choices.some(row => row.connection_id === prior))
      throw assistantErrors.conflict("本工作已经选定这个类别的账号");
    store.setSetting(work.actor_id, workConnectionsKey(work.work_id), JSON.stringify({ ...chosen, [category]: choice.connection_id }));
  };
}
