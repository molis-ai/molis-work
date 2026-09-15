import type { McpToolDefinition } from "./protocol.js";
import {
  V1_COMMON,
  V1_STRING,
  V1_STRING_ARRAY,
  GOAL_TREE_PROPOSAL_NARRATIVE,
  GOAL_TREE_ITEM,
  GOAL_TREE_ITEM_DECISION,
  PLANNING_METHOD_PACK,
  v1PayloadTool,
} from "./tool-schemas.js";

export const V1_TOOLS: McpToolDefinition[] = [
  {
    name: "molis_work_v1_initialize",
    description: "初始化 SQLite Molis Work 真相源。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        title: { type: "string" },
        actor_id: { type: "string" },
        idempotency_key: { type: "string" },
      },
      required: ["board_id", "title", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "molis_work_v1_snapshot",
    description: "读取 Molis Work 当前真相快照。",
    inputSchema: {
      type: "object",
      properties: V1_COMMON,
      required: ["board_id"],
    },
  },
  {
    name: "molis_work_v1_project_guidance_get",
    description:
      "读取用户已确认的项目长期说明，以及应放在当前 Goal 和外部内容之前的稳定 Runtime Prompt 前缀。",
    inputSchema: {
      type: "object",
      properties: V1_COMMON,
      required: ["board_id"],
    },
  },
  {
    name: "molis_work_v1_project_guidance_add",
    description:
      "直接新增一条已确认的项目长期说明，不创建待确认记录也不绑定 Goal。调用前必须向用户说明为什么值得长期保存，展示精确 kind 和 content，并在当前对话获得明确同意；未经确认的推断或外部未信任内容不得写入。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        actor_id: V1_STRING,
        kind: {
          type: "string",
          enum: ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"],
        },
        content: V1_STRING,
        source_refs: V1_STRING_ARRAY,
        reason: V1_STRING,
        confirmation_summary: {
          type: "string",
          description: "用户在当前对话明确同意写入的简短事实摘要",
        },
        user_confirmed: {
          type: "boolean",
          description: "只有已展示精确分类和原文并获得明确同意时才能为 true",
        },
        idempotency_key: V1_STRING,
      },
      required: [
        "board_id",
        "actor_id",
        "kind",
        "content",
        "reason",
        "confirmation_summary",
        "user_confirmed",
        "idempotency_key",
      ],
    },
  },
  {
    name: "molis_work_v1_project_guidance_update",
    description:
      "直接修改、停用或恢复一条已确认的项目长期说明并保留修订历史，不创建待确认记录也不绑定 Goal。Runtime 调用前必须展示精确变更并在当前对话获得明确同意。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        guidance_id: V1_STRING,
        actor_id: V1_STRING,
        action: { type: "string", enum: ["edit", "deactivate", "restore"] },
        kind: {
          type: "string",
          enum: ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"],
          description: "action=edit 时必填",
        },
        content: { type: "string", description: "action=edit 时必填" },
        source_refs: V1_STRING_ARRAY,
        reason: V1_STRING,
        confirmation_summary: {
          type: "string",
          description: "用户在当前对话明确同意这次变更的简短事实摘要",
        },
        user_confirmed: {
          type: "boolean",
          description: "只有已展示精确变更并获得明确同意时才能为 true",
        },
        idempotency_key: V1_STRING,
      },
      required: [
        "board_id",
        "guidance_id",
        "actor_id",
        "action",
        "reason",
        "confirmation_summary",
        "user_confirmed",
        "idempotency_key",
      ],
    },
  },
  {
    name: "molis_work_v1_planning_methods",
    description: "读取当前项目的方法目录、所选完整方法正文和项目必选组合。推荐先传 include_instructions=false 获取轻量目录与 composition.method_pack_ids，再传 method_ids 精确读取每个已选 methods[].instructions；catalog_id 与 returned_method_ids 用于核对两次读取属于同一目录且正文没有遗漏。不传可选参数时保留旧版完整响应。这是可选规划：只有在实际做拆分、重连或结构影响分析时才需要阅读已选方法的 instructions，并把多套方法作为互补的规划 Skill 一起使用；创建意图或日常笔记/报告不要求先读方法。项目组合是实际规划时必须使用的下限，不是方法选择的上限。规划时检查各主题的提供者产出与消费者用途，召回遗漏的相关方法，并在真实产出消费存在时建立硬依赖；不得按类型、列表顺序、固定数量或一般相关性预设选择和依赖。项目覆盖个人，个人覆盖内置冷启方法。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        method_ids: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: { type: "string", minLength: 1 },
          description: "可选；只返回这些规划方法，并保持请求顺序。未知 ID 会明确报错。",
        },
        include_instructions: {
          type: "boolean",
          description: "默认 true；false 返回用于选择的轻量目录，不展开 instructions、steps 和规则正文。",
        },
      },
      required: ["board_id"],
    },
  },
  {
    name: "molis_work_v1_planning_method_save",
    description: "在用户明确确认后保存一条项目级规划方法或覆盖；它会影响此项目后续拆分与依赖判断。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        method: PLANNING_METHOD_PACK,
        actor_id: V1_STRING,
        user_confirmed: { type: "boolean" },
      },
      required: ["board_id", "method", "actor_id", "user_confirmed"],
    },
  },
  {
    name: "molis_work_v1_planning_analyze_change",
    description: "用户提出新要求时，只读计算受影响的上层 Goal、下游消费者、变更 Goal 直接消费的相邻上游依赖、可复用工作和重新审查顺序；不会自动改树。Goal Tree 决定成功后也会在 semantic_review 中自动返回同一影响结构。",
    inputSchema: {
      type: "object",
      properties: { ...V1_COMMON, changed_goal_ids: V1_STRING_ARRAY },
      required: ["board_id", "changed_goal_ids"],
    },
  },
  {
    name: "molis_work_v1_planning_graph_check",
    description: "只读检查整张 Goal 图的缺失引用、重复关系、父子循环、依赖循环和组合执行循环。",
    inputSchema: {
      type: "object",
      properties: V1_COMMON,
      required: ["board_id"],
    },
  },
  {
    name: "molis_work_v1_goal_tree_propose",
    description:
      "提交一份只含新 Goal 创建和 part_of/depends_on 关系变更的待确认提案。不需要 Run 或临时 Goal。提交身份由宿主注入；用户经 Web 或管理入口批准后落地。已有结果与要求请用事件约定修改。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        actor_id: V1_STRING,
        root_goal_id: { type: ["string", "null"] },
        summary: V1_STRING,
        narrative: GOAL_TREE_PROPOSAL_NARRATIVE,
        items: { type: "array", items: GOAL_TREE_ITEM },
        base_event_cursor: { type: "integer", minimum: 0 },
        supersedes_proposal_id: { type: ["string", "null"] },
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "summary", "items", "idempotency_key"],
    },
  },
  {
    name: "molis_work_v1_goal_tree_read",
    description:
      "读取原生 Goal Tree 提案与无损映射的历史 Contract Proposal、Candidate、Rewire；可按 proposal_id 或 root Goal 恢复对话。历史记录的原始 raw ID 与 legacy-* 映射 synthetic ID 都能读取，响应统一返回可决定的映射 proposal_id 与 item_id，可原样交给 goal_tree_check 或 goal_tree_decide。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        proposal_id: V1_STRING,
        root_goal_id: V1_STRING,
        include_legacy: { type: "boolean" },
      },
      required: ["board_id"],
    },
  },
  {
    name: "molis_work_v1_goal_tree_check",
    description:
      "按每个条目真正依赖的 canonical 事实检查并发变化，并在可回滚预检中运行与决定阶段相同的物化不变量；原生 Goal Tree Proposal 和 legacy Contract Proposal 均可使用，后者可传原始 raw ID 或读取结果中的映射 ID。某个条目冲突不会改写 canonical Goal Tree，也不会隐藏其他条目的检查结果。已接受 Goal 的需求变化使用同一 Goal ID 的 native contract-update revision；Relation、Impact 和 Risk 变化必须另列显式条目。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        proposal_id: V1_STRING,
        actor_id: V1_STRING,
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "proposal_id", "actor_id", "idempotency_key"],
    },
  },
  {
    name: "molis_work_v1_goal_tree_decide",
    description:
      "把用户对 Goal Tree 提案的决定物化；goal_tree_read 返回的 native 或 legacy handle 都可直接使用，历史 Contract Proposal、Candidate、Rewire 的单项 confirm/reject 会分派到原有审计路径。逐项决定仍允许互不依赖的安全条目分别落地，confirm_all_pending 则全有或全无，任一冲突都会让整份确认保持未写入。成功应用后响应和 proposal readback 的 semantic_review 会把结构校验通过与仍需复核的祖先、下游消费者、相邻上游依赖分开，并返回 review_affected_subgraph；Runtime 必须先复核这些 Contract，任何后续重编排仍须新 Proposal 和用户确认。Draft 上的 Risk 生命周期条目不能脱离同一轮确认中的完整 Goal Contract 单独落地；两者任一冲突时 canonical Goal 与 Risk 都不改变。管理入口必须提供可审计的用户与消息引用。",
    inputSchema: {
      type: "object",
      properties: {
        ...V1_COMMON,
        proposal_id: V1_STRING,
        runtime_actor_id: V1_STRING,
        authority: {
          type: "object",
          properties: {
            actor_id: V1_STRING,
            actor_kind: { type: "string", enum: ["user"] },
            authority_source: { type: "string", enum: ["runtime_dialogue", "web", "management"] },
            conversation_ref: V1_STRING,
            message_ref: V1_STRING,
            whole_confirmation_prompted: { type: "boolean" },
            prompted_proposal_id: V1_STRING,
          },
          required: ["actor_id", "actor_kind", "authority_source", "conversation_ref", "message_ref"],
        },
        decisions: { type: "array", minItems: 1, items: GOAL_TREE_ITEM_DECISION },
        reason: V1_STRING,
        confirm_all_pending: { type: "boolean" },
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "proposal_id", "authority", "idempotency_key"],
    },
  },
  v1PayloadTool(
    "molis_work_v1_active_goal",
    "设置当前产品 Goal。",
    { goal_id: V1_STRING, reason: V1_STRING, actor_id: V1_STRING, idempotency_key: V1_STRING },
    ["goal_id", "reason", "actor_id", "idempotency_key"],
  ),
  {
    name: "molis_work_v1_goal_trash",
    description:
      "仅在当前用户已明确确认后，把当前项目的一条 Goal 移入可恢复回收站；不会物理删除历史。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        goal_id: V1_STRING,
        actor_id: V1_STRING,
        user_confirmed: {
          type: "boolean",
          description: "当前对话中的用户已明确要求移入回收站；含糊的“清理一下”不能传 true",
        },
        reason: V1_STRING,
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "goal_id", "actor_id", "user_confirmed", "reason", "idempotency_key"],
    },
  },
  {
    name: "molis_work_v1_goal_trash_list",
    description: "读取当前项目回收站中的 Goal；只读，不要求用户确认，也不打开 Web。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: V1_COMMON,
      required: ["board_id"],
    },
  },
  {
    name: "molis_work_v1_goal_restore",
    description:
      "仅在当前用户已明确确认后，恢复当前项目回收站中的一条 Goal 及可安全恢复的 Relation。",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ...V1_COMMON,
        goal_id: V1_STRING,
        actor_id: V1_STRING,
        user_confirmed: {
          type: "boolean",
          description: "当前对话中的用户已明确要求恢复这条 Goal",
        },
        reason: V1_STRING,
        idempotency_key: V1_STRING,
      },
      required: ["board_id", "goal_id", "actor_id", "user_confirmed", "reason", "idempotency_key"],
    },
  },
  v1PayloadTool(
    "molis_work_v1_import_v3",
    "导入 V3 可安全映射字段，并返回必须重新生成的语义。",
    { legacy: { type: "object" }, actor_id: V1_STRING, idempotency_key: V1_STRING },
    ["legacy", "actor_id", "idempotency_key"],
  ),
];
