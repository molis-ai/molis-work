import type { McpToolDefinition } from "./protocol.js";
import {
  GOAL_EVENT_ADOPTED_PLANNING,
  GOAL_EVENT_AGREEMENT_CHANGE,
  GOAL_EVENT_DECISION_OPTION,
  GOAL_EVENT_NEW_REQUIREMENT,
  GOAL_EVENT_REPORT_ITEM,
  GOAL_EVENT_REPORT_PROGRESS,
  GOAL_EVENT_REQUIREMENT_REVISION,
  GOAL_EVENT_REQUIREMENT_BINDING,
  GOAL_EVENT_SCOPE,
  GOAL_EVENT_TYPE_DEFINITION,
  V1_COMMON,
  V1_STRING,
  V1_STRING_ARRAY,
} from "./tool-schemas.js";

const EVENT_ACTOR = {
  actor_id: {
    type: "string",
    description: "管理入口的操作者。Runtime 不得填写；宿主会写入可信 runtime 审计身份。",
  },
};

export const EVENT_TOOLS: McpToolDefinition[] = [
  {
    name: "molis_work_v1_goal_intent_create",
    description:
      "用能辨认的标题创建一个事件 Goal，可附带结果、原文、优先级、要求和关系。不造默认规划，不领取角色或创建 Run。创建本身不是完成。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        title: { type: "string", minLength: 1, description: "能辨认的目标标题" },
        outcome: { type: "string", description: "可选的结果说明，不是完整验收" },
        why: V1_STRING,
        business_logic: V1_STRING,
        priority: { type: "number", minimum: 0, maximum: 100 },
        goal_id: V1_STRING,
        parent_goal_id: V1_STRING,
        dependency_goal_ids: V1_STRING_ARRAY,
        requirements: { type: "array", items: GOAL_EVENT_NEW_REQUIREMENT },
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "title", "idempotency_key", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_goal_list",
    description:
      "按当前事件状态列出 Goal：ID、标题、工作状态、能否记录、待办提示和列表分页游标。after_cursor 是列表分页，不是事件日志游标。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        work_status: { type: "string", enum: ["open", "completed", "cancelled"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        after_cursor: V1_STRING,
      },
      required: ["board_id"],
    },
  },
  {
    name: "molis_work_v1_goal_state",
    description:
      "读取当前 Goal 的意图、当前约定、有效要求、最新报告摘要、事件游标和可继续信息。当前结果只在 agreement.outcome。历史正文用 event_read 或 event_list。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        goal_id: V1_STRING,
      },
      required: ["board_id", "goal_id"],
    },
  },
  {
    name: "molis_work_v1_event_configure",
    description:
      "为当前 Goal 登记事件类型、版本、局部要求和采用的规划。采用规划会保存当时的来源版本并把该方法的事件类型登记到 Goal；不会随模板库升级覆写已有约定。adopt_default_requirement_ids 必须显式选择，不会机械开启规划里的全部默认要求。没有模板也可以只登记局部类型。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        expected_version: { type: "integer", minimum: 0 },
        idempotency_key: V1_STRING,
        types: { type: "array", items: GOAL_EVENT_TYPE_DEFINITION },
        adopted_planning: { type: "array", items: GOAL_EVENT_ADOPTED_PLANNING },
        adopt_default_requirement_ids: V1_STRING_ARRAY,
        expected_agreement_version: { type: "integer", minimum: 0 },
        requirement_bindings: { type: "array", items: GOAL_EVENT_REQUIREMENT_BINDING },
      },
      required: ["board_id", "goal_id", "expected_version", "idempotency_key", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_event_note",
    description:
      "保存一条普通笔记。不需要先登记类型。完成后或取消后的无关笔记不会自动重开。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        body: { type: "string", minLength: 1, description: "笔记原文" },
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "goal_id", "body", "idempotency_key", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_event_report",
    description:
      "一次提交多条已登记类型的工作事实，可附带本批进展说明。返回已保存事实和当前工作状态、差距与游标。不表示完成、人工验收或 Host 已连接。不需要 Claim 或 Run。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        events: { type: "array", minItems: 1, items: GOAL_EVENT_REPORT_ITEM },
        progress: GOAL_EVENT_REPORT_PROGRESS,
      },
      required: ["board_id", "goal_id", "idempotency_key", "events", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_event_list",
    description: "按服务器接收顺序分页读取当前 Goal 的配置事件与工作事实。配置 payload 与报告文本字段按 kind 区分。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        goal_id: V1_STRING,
        after_cursor: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["board_id", "goal_id"],
    },
  },
  {
    name: "molis_work_v1_event_read",
    description: "按事件 ID 读取一条历史事件，包括当时类型版本的字段定义。旧配置版本对应的历史正文不随后来的类型修改变化。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        goal_id: V1_STRING,
        event_id: V1_STRING,
      },
      required: ["board_id", "goal_id", "event_id"],
    },
  },
  {
    name: "molis_work_v1_event_progress",
    description:
      "记录当前进展原文、所依据的当前 Goal 事件游标、下一步和责任描述。新事实会使摘要过时但不会删除它。建议某人继续不等于 Host 已开始执行。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        based_on_cursor: { type: "integer", minimum: 0 },
        summary: { type: "string", minLength: 1 },
        next_step: V1_STRING,
        next_actor: V1_STRING,
      },
      required: ["board_id", "goal_id", "idempotency_key", "based_on_cursor", "summary", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_event_concern",
    description:
      "打开、解决、接受或推翻一个有明确作用范围的 Concern。一般观察不会自动变成全局阻塞。接受风险必须引用已保存的可信用户决定。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        action: { type: "string", enum: ["open", "resolve", "accept", "overturn"] },
        concern_id: V1_STRING,
        title: V1_STRING,
        statement: V1_STRING,
        scope: GOAL_EVENT_SCOPE,
        blocks_closure: { type: "boolean" },
        reason: V1_STRING,
        supporting_event_ids: V1_STRING_ARRAY,
        cited_decision_id: V1_STRING,
      },
      required: ["board_id", "goal_id", "idempotency_key", "action", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_event_decision_request",
    description:
      "提出一个具体问题、可区分选项与影响及作用范围，等待可信用户入口作决定。不能通过 actor_kind 或 user_confirmed 自行获得用户批准。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        question: { type: "string", minLength: 1 },
        options: { type: "array", minItems: 2, items: GOAL_EVENT_DECISION_OPTION },
        purpose: {
          type: "string",
          enum: ["suggestion", "requirement_acceptance", "action", "agreement_change"],
        },
        proposed_change: GOAL_EVENT_AGREEMENT_CHANGE,
        scope: GOAL_EVENT_SCOPE,
      },
      required: ["board_id", "goal_id", "idempotency_key", "question", "options", "purpose", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_event_cite_decision",
    description:
      "引用当前 Goal 已持久化的可信决定，在原范围内复用，不必重问。换 Goal、扩大范围或把旧决定套到变化后的承诺会被拒绝。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        decision_id: V1_STRING,
        scope: GOAL_EVENT_SCOPE,
      },
      required: ["board_id", "goal_id", "idempotency_key", "decision_id", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_event_agree",
    description:
      "更新当前结果约定：首次补全结果、追加要求，或在已获针对具体变化的授权后修订/退休要求、替换已有结果。两个 expected 版本都必填，缺一拒绝。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        expected_config_version: { type: "integer", minimum: 0 },
        expected_agreement_version: { type: "integer", minimum: 0 },
        outcome: V1_STRING,
        new_requirements: { type: "array", items: GOAL_EVENT_NEW_REQUIREMENT },
        revise_requirements: { type: "array", items: GOAL_EVENT_REQUIREMENT_REVISION },
        retire_requirement_ids: V1_STRING_ARRAY,
        cited_decision_id: V1_STRING,
      },
      required: [
        "board_id", "goal_id", "idempotency_key", "actor_id",
        "expected_config_version", "expected_agreement_version",
      ],
    },
  },
  {
    name: "molis_work_v1_event_close",
    description:
      "显式提交完成或取消。完成报告总会记录；只有存在具体结果约定、当前要求支持且适用决定/阻塞已处理后，completion_applied 才为 true。取消不要求伪造交付。成功上报本身永不自动完成。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        kind: { type: "string", enum: ["complete", "cancel"] },
        result: V1_STRING,
        reason: { type: "string", minLength: 1 },
        expected_config_version: { type: "integer", minimum: 0 },
        expected_agreement_version: { type: "integer", minimum: 0 },
      },
      required: [
        "board_id", "goal_id", "idempotency_key", "kind", "reason",
        "expected_config_version", "expected_agreement_version", "actor_id",
      ],
    },
  },
  {
    name: "molis_work_v1_event_resume",
    description: "显式继续已经完成或取消的 Goal，必须说明理由。下一条无关观察不会默默重开。已 open 时新请求会说明无须重开。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        reason: { type: "string", minLength: 1 },
      },
      required: ["board_id", "goal_id", "idempotency_key", "reason", "actor_id"],
    },
  },
  {
    name: "molis_work_v1_event_decide",
    description:
      "由受保护的用户/管理入口记录可信决定或验收。Runtime 不能调用本工具；actor_kind=user、user_confirmed 或自填 authority 不能产生用户批准。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        ...EVENT_ACTOR,
        goal_id: V1_STRING,
        idempotency_key: V1_STRING,
        request_id: V1_STRING,
        selected_option_id: V1_STRING,
        conclusion: { type: "string", minLength: 1 },
        accepts_requirements: { type: "boolean" },
        effects: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              kind: {
                type: "string",
                enum: [
                  "accept_requirements",
                  "reject_requirements",
                  "accept_concerns",
                  "reject_concerns",
                  "authorize_action",
                  "deny_action",
                  "authorize_agreement_change",
                ],
              },
              action: V1_STRING,
            },
            required: ["kind"],
          },
        },
        authorized_change: GOAL_EVENT_AGREEMENT_CHANGE,
        scope: GOAL_EVENT_SCOPE,
      },
      required: ["board_id", "goal_id", "idempotency_key", "conclusion", "actor_id"],
    },
  },
];
