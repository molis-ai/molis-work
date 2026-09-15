import fs from "node:fs";
import path from "node:path";
import { GoalProjectApplication } from "./goal-project-application.js";
import { LocalProjectDatabase } from "./project-database.js";

export const DEMO_BOARD_ID = "goalboard-v1-demo";

export function seedDemoBoard(databasePath: string): void {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const store = new LocalProjectDatabase(databasePath);
  const coordinator = new GoalProjectApplication(store);
  try {
    const exists = store.goalsQuery.getBoard(DEMO_BOARD_ID);
    if (exists) return;
    coordinator.initializeBoard({
      board_id: DEMO_BOARD_ID,
      title: "让第一次使用 Molis Work 的人顺利完成一次目标协作",
      actor_id: "demo-user",
      idempotency_key: "demo-board",
    });
    const goals = [
      {
        goal_id: "V1",
        title: "让第一次使用的人顺利完成一轮目标协作",
        outcome: "用户能把一个模糊想法变成清楚的目标树，并知道下一步、阻塞和完成依据",
        why: "AI 对话结束后容易丢失目标、决定和进度，新用户尤其难判断该从哪里继续",
        business_logic: "用户先在当前对话说明想做什么，Runtime 通过提问整理目标并请用户确认；确认后，当前或后续 Runtime 从可做项中选择工作，提交结果和证据，Molis Work 持续保存共同进度。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_compound" as const,
        priority: 100,
        acceptance_criteria: [
          {
            criterion_id: "V1-C1",
            statement: "第一次使用的人能从首屏看懂目标、下一步和阻塞",
            decision_method: "inspection" as const,
            pass_condition: "首次使用者无需阅读协议即可正确复述",
          },
        ],
      },
      {
        goal_id: "PLATFORM",
        title: "让项目事实成为不同 Runtime 的共同底座",
        outcome: "不同 AI、会话和工具读取同一份 Goal、关系、决定、进度与完成依据",
        why: "长程任务最容易在切换对话和 Runtime 后失去共同上下文",
        business_logic: "Molis Work 保存项目事实；Runtime 只负责读取可做项、执行工作并提交结果，不在各自会话里维护另一套项目记忆。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_compound" as const,
        priority: 96,
        acceptance_criteria: [
          {
            criterion_id: "PLATFORM-C1",
            statement: "不同 Runtime 读取到一致的 Goal 状态与完成依据",
            decision_method: "automated_check" as const,
            pass_condition: "跨入口一致性测试通过",
          },
        ],
      },
      {
        goal_id: "WORKSPACE",
        title: "让人能在同一工作台看清并推进 Goal",
        outcome: "用户在一个窗口里查看 Goal Tree、Focus、Graph 和 Goal-bound Runtime",
        why: "频繁切换页面、终端和 AI 对话会打断判断，也让 Goal 与执行 Session 脱节",
        business_logic: "桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面；网页保留同一份项目事实与独立访问方式。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_compound" as const,
        priority: 94,
        acceptance_criteria: [
          {
            criterion_id: "WORKSPACE-C1",
            statement: "用户不切窗口即可从 Goal 进入对应 Runtime",
            decision_method: "inspection" as const,
            pass_condition: "桌面主工作流可完成并保持 Goal 绑定",
          },
        ],
      },
      {
        goal_id: "ADOPTION",
        title: "让第一次接入从安装走到真实推进",
        outcome: "新用户从 README、安装和首次打开一路走到推进第一条 Goal",
        why: "只把程序装上不等于用户已经理解产品，更不等于完成第一次有效使用",
        business_logic: "公开文档先解释适用场景，再引导安装、连接 Runtime、选择项目并推进一条可执行 Goal。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_compound" as const,
        priority: 92,
        acceptance_criteria: [
          {
            criterion_id: "ADOPTION-C1",
            statement: "首次用户能独立完成一次从安装到推进的闭环",
            decision_method: "inspection" as const,
            pass_condition: "首次使用走查无阻断步骤",
          },
        ],
      },
      {
        goal_id: "CORE",
        title: "让每项工作都有可信的完成依据",
        outcome: "用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成",
        why: "只有进度标签而没有结果、证据和复核，用户仍然无法相信工作真的完成了",
        business_logic: "Runtime 选择一项已经准备好的工作并标记开始；完成后提交对应验收条件的证据，必要复核通过后，这项工作才会显示为已完成。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 90,
        acceptance_criteria: [
          {
            criterion_id: "CORE-C1",
            statement: "工作从开始到证据和复核形成完整记录",
            decision_method: "automated_check" as const,
            pass_condition: "生命周期自动化测试通过",
          },
        ],
      },
      {
        goal_id: "INTERFACES",
        title: "让不同 AI 对话看到同一项目进度",
        outcome: "用户换一个 Runtime 或新开对话后，仍能找到同一个项目的目标、进度和未完成工作",
        why: "如果每个入口各自记录状态，用户换一次对话就要重新解释整个项目",
        business_logic: "用户在当前对话明确选择项目后继续推进；其他 Runtime 也通过 Molis Work 读取和更新同一份项目事实，不会各自维护一套进度。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 80,
        acceptance_criteria: [
          {
            criterion_id: "INTERFACES-C1",
            statement: "不同入口读取到一致的可做工作和占用状态",
            decision_method: "automated_check" as const,
            pass_condition: "跨入口自动化测试通过",
          },
        ],
      },
      {
        goal_id: "WEB",
        title: "让用户打开页面就看懂目标和下一步",
        outcome: "用户不用理解内部协议，也能看出项目要解决什么、当前进展、谁该做什么和为什么被阻塞",
        why: "底层规则正确并不代表产品容易理解；信息组织混乱会让用户放弃继续使用",
        business_logic: "用户打开项目后先看到目标树和当前目标，再按结果、完成标准、推进情况、风险和历史阅读；搜索、状态筛选和待决定事项都放在统一导航中。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 70,
        acceptance_criteria: [
          {
            criterion_id: "WEB-C1",
            statement: "桌面和移动端关键信息清楚可用",
            decision_method: "inspection" as const,
            pass_condition: "视觉、响应式和可访问性 QA 通过",
          },
        ],
      },
      {
        goal_id: "GRAPH",
        title: "让复杂 Goal 关系仍然一眼可读",
        outcome: "父子层级、前置依赖和当前焦点在复杂网络中仍有清楚的方向与落点",
        why: "列表适合顺序浏览，但复杂 Goal 的多层结构和跨分支依赖会在列表里变得难以判断",
        business_logic: "用户在 List 与 Graph 之间切换；Graph 只读取真实父子和依赖关系，以节点、分区和有向连线呈现。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 76,
        acceptance_criteria: [
          {
            criterion_id: "GRAPH-C1",
            statement: "复杂网络中的关系方向和阻塞节点可以直接辨认",
            decision_method: "inspection" as const,
            pass_condition: "12 Goal 演示网络在桌面宽度下可读",
          },
        ],
      },
      {
        goal_id: "DESKTOP",
        title: "把 Molis Work 作为不切窗口的主工作站",
        outcome: "用户在桌面端同时看到 Goal、下一步、完成要求和强绑定的 Runtime",
        why: "工作在 AI 对话里推进、状态在另一个页面查看，会增加切换成本并削弱人的掌控感",
        business_logic: "桌面端复用网页事实和 Runtime 能力，将全局控制放进 TitleBar，并为 List、Focus 与 Runtime 保留连续三栏。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 74,
        acceptance_criteria: [
          {
            criterion_id: "DESKTOP-C1",
            statement: "桌面端三栏在宽屏下形成完整工作闭环",
            decision_method: "inspection" as const,
            pass_condition: "Goal 选择、Focus 与 Runtime 归属保持同步",
          },
        ],
      },
      {
        goal_id: "RELEASE",
        title: "让新用户安装后知道下一步怎么开始",
        outcome: "用户完成安装后知道如何启动页面、连接正在使用的 Runtime，以及为什么需要新开会话",
        why: "安装成功但不知道服务是否常驻、工具何时生效或下一步说什么，仍然会被理解成产品不可用",
        business_logic: "安装只放置 Molis Work 自己的程序，不偷偷修改项目或 Runtime；用户随后显式启用常驻服务、预览并确认 Runtime 接入，再在新会话中选择或创建项目开始使用。",
        definition_state: "draft" as const,
        decomposition_state: "abstract" as const,
        priority: 60,
        acceptance_criteria: [
          {
            criterion_id: "RELEASE-C1",
            statement: "安装、接入和重启提示可以按公开步骤重复完成",
            decision_method: "automated_check" as const,
            pass_condition: "全新安装端到端验证通过",
          },
        ],
      },
      {
        goal_id: "ONBOARDING",
        title: "让用户第一次打开就完成有效操作",
        outcome: "用户首次进入后能选择项目、找到可做 Goal，并理解 Runtime 为什么绑定到它",
        why: "展示很多功能不等于用户知道第一步做什么，首屏需要直接引向一次有效推进",
        business_logic: "首次体验使用一份明确标记的 Mock 项目，沿着可做 Goal、下一步与 Runtime 归属完成一轮引导。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 58,
        acceptance_criteria: [
          {
            criterion_id: "ONBOARDING-C1",
            statement: "首次用户无需外部讲解即可推进第一条 Goal",
            decision_method: "inspection" as const,
            pass_condition: "首次体验测试完成一条可执行 Goal",
          },
        ],
      },
      {
        goal_id: "DOCS",
        title: "让用户从 README 进入正确的使用方式",
        outcome: "用户先理解长程任务为何会跑偏，再看到 Molis Work 的闭环、桌面端和 Runtime 伴随方式",
        why: "功能清单无法建立需求感，也无法解释 Molis Work 与 Agent Orchestration 的边界",
        business_logic: "README 用痛点、核心思路和完整演示组织内容；截图来自 Mock 项目的真实网页与桌面页面。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 56,
        acceptance_criteria: [
          {
            criterion_id: "DOCS-C1",
            statement: "README 清楚表达痛点、边界、闭环与多种使用方式",
            decision_method: "inspection" as const,
            pass_condition: "目标用户能准确复述产品独特机制",
          },
        ],
      },
      {
        goal_id: "AUTO-CONNECT",
        title: "自动替用户选择最近使用的项目",
        outcome: "新对话少做一次项目确认",
        why: "早期方案希望用历史目录记录缩短首次连接步骤",
        business_logic: "新对话进入一个以前使用过的目录时，系统直接连接最近的项目，不再询问用户。这个方案可能选错项目，因此已经移入回收站，当前产品只展示候选并让用户决定。",
        definition_state: "accepted" as const,
        decomposition_state: "closed_leaf" as const,
        priority: 10,
        acceptance_criteria: [
          {
            criterion_id: "AUTO-CONNECT-C1",
            statement: "新对话无需确认就进入历史项目",
            decision_method: "inspection" as const,
            pass_condition: "进入历史目录后直接显示最近项目",
          },
        ],
      },
    ];
    const parents: Record<string, string> = {
      PLATFORM: "V1", WORKSPACE: "V1", ADOPTION: "V1",
      CORE: "PLATFORM", INTERFACES: "PLATFORM",
      WEB: "WORKSPACE", GRAPH: "WORKSPACE", DESKTOP: "WORKSPACE",
      RELEASE: "ADOPTION", ONBOARDING: "ADOPTION", DOCS: "ADOPTION",
    };
    const dependencies: Record<string, string[]> = {
      INTERFACES: ["CORE"],
      WEB: ["INTERFACES"],
      GRAPH: ["INTERFACES"],
      DESKTOP: ["CORE"],
      ONBOARDING: ["RELEASE"],
      DOCS: ["ONBOARDING"],
    };
    for (const goal of goals) {
      coordinator.goalEvents.createIntent({
        board_id: DEMO_BOARD_ID,
        goal_id: goal.goal_id,
        title: goal.title,
        outcome: goal.outcome,
        why: goal.why,
        business_logic: goal.business_logic,
        priority: goal.priority,
        parent_goal_id: parents[goal.goal_id],
        dependency_goal_ids: dependencies[goal.goal_id] ?? [],
        requirements: goal.goal_id === "CORE"
          ? []
          : goal.acceptance_criteria.map((item) => ({
              requirement_id: item.criterion_id,
              statement: item.statement,
            })),
        actor_id: "demo-user",
        actor_kind: "user",
        source_kind: "onboarding",
        idempotency_key: `demo-goal-${goal.goal_id}`,
      });
    }

    coordinator.goalEvents.recordNote({
      board_id: DEMO_BOARD_ID,
      goal_id: "RELEASE",
      actor_id: "demo-user",
      actor_kind: "user",
      body: "接入 Runtime 后必须新开会话；继续使用接入前的会话会让人误以为安装失败。",
      idempotency_key: "demo-release-note",
    });

    coordinator.goals.lifecycle.setTrashed(
      DEMO_BOARD_ID,
      {
        goal_id: "AUTO-CONNECT",
        trashed: true,
        reason: "这会替用户猜项目；当前方案只展示历史候选，并再次询问用户",
      },
      { actor_id: "demo-user", idempotency_key: "demo-trash-auto-connect" },
    );

    coordinator.goalEvents.configure({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      actor_id: "demo-user",
      actor_kind: "user",
      expected_version: 0,
      types: [{
        type_id: "lifecycle",
        version: 1,
        name: "生命周期交付",
        purpose: "可核对的工作结果",
        semantic_family: "delivery",
        source: { kind: "local", label: "演示项目" },
        fields: [
          { field_id: "result", name: "结果", purpose: "当前交付", format: "text", required: true },
        ],
      }],
      idempotency_key: "demo-core-configure",
    });
    const configured = coordinator.goalEvents.readState(DEMO_BOARD_ID, "CORE");
    coordinator.goalEvents.setAgreement({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      actor_id: "demo-user",
      actor_kind: "user",
      expected_config_version: configured.config.version,
      expected_agreement_version: configured.agreement.version,
      outcome: "用户能看到一项工作何时开始、做出了什么，以及为什么可以算完成",
      new_requirements: [{
        requirement_id: "CORE-C1",
        statement: "工作从开始到证据和复核形成完整记录",
        bound_type_id: "lifecycle",
      }],
      idempotency_key: "demo-core-agree",
    });
    coordinator.goalEvents.report({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      actor_id: "demo-user",
      actor_kind: "user",
      events: [{
        type_id: "lifecycle",
        type_version: 1,
        title: "生命周期记录已接通",
        fields: { result: "从约定、报告到收尾形成完整记录" },
        judgments: [{ requirement_id: "CORE-C1", verdict: "supports" }],
      }],
      progress: {
        summary: "完成依据已经写进当前事件记录。",
        next_step: "明确收尾",
        next_actor: "当前用户",
      },
      idempotency_key: "demo-core-report",
    });
    coordinator.goalEvents.recordNote({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      actor_id: "demo-user",
      actor_kind: "user",
      body: "演示项目用当前事件记录说明这项工作为什么可以算完成，不再领取角色或提交旧 Evidence。",
      idempotency_key: "demo-core-note",
    });
    const readyToClose = coordinator.goalEvents.readState(DEMO_BOARD_ID, "CORE");
    coordinator.goalEvents.submitClosure({
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      actor_id: "demo-user",
      actor_kind: "user",
      kind: "complete",
      result: "可用的生命周期记录",
      reason: "约定要求已有支持事实，演示收尾",
      expected_config_version: readyToClose.config.version,
      expected_agreement_version: readyToClose.agreement.version,
      idempotency_key: "demo-core-close",
    });
    coordinator.goalEvents.recordNote({
      board_id: DEMO_BOARD_ID,
      goal_id: "INTERFACES",
      actor_id: "demo-user",
      actor_kind: "user",
      body: "升级前应先看到安全说明：能保留的旧数据明确列出，不能可靠迁移的内容提示重新整理。",
      idempotency_key: "demo-interfaces-note",
    });
    store.db
      .prepare("UPDATE boards SET active_goal_id = ?, updated_at = ? WHERE board_id = ?")
      .run("V1", new Date().toISOString(), DEMO_BOARD_ID);
  } finally {
    store.close();
  }
}
