# T117 工程候选独立审查

**结论：可采纳为 WAIT 工程书，无必须修订项；本轮审书闭合，不要求再出修订版或新增审查轮次。** 它准确承接既有 T117 / PG-064 的剩余类型与出口工作，没有重开产品方案，也没有把展示类型迁进公共合同来凑清理完成。

核对对象：本目录 `candidate-T117.md`、`NEXT-BOOKS.md`；`/private/tmp/t116-successor-plan/` 中正式裁定 `6541316193` 原文、T116 原方案、T133 原方案与 successor PLAN；现行本地 `origin/main=b0567bf545a74b858e4fdeddd5e66432b1065b21` 的 w5-08-workbench-exports、PG-064、工作台类型消费者、公开合同入口及出口测试。未读在途分支作已采用事实，未 fetch、改 refs、构建、测试、修改仓库/协调文件/GitHub，也未触碰保护分支。以下均为书面与源码核对，不是实施通过证据。

## 范围与 owner：通过

- 正式裁定把 T117 定为 PG-064 的 page-view 类型 import 与旧 goals-actions 对应调用者；T118 承担状态/docs/skills/BACKLOG 小收尾，T402/403 承担 Feed/Inbox 后继。候选保持这个分界，当前不存在的 goals-actions 不复活，Schedule 已迁出的类型不重复做。
- 当前 page-view 仍从 Goals 包根取 BoardSnapshot 及五种展示/适配类型，从 Feed 包根取投影/UI 类型；Inbox summary 也仍在页面模型中。候选先等业务字段随前置迁回 owner，再核剩余真实消费者，符合“类型迁移不能顺带搬渲染或删功能”。
- BoardSnapshot 在 `plugins/native/goals/src/contract/goals.ts`，由现有 `/contract` 导出；GoalPresentationState、GoalsDocumentView、GoalsInputBinding、GoalsPolicyBinding、GoalsDecisionEvent 则确在 tree-order/document-view/policy-ui-model/decision-view。候选禁止机械把它们全改成 `/contract`、禁止新增公共展示合同，判断正确。
- Feed 的 `/contract` 现有事实出口并不意味着当前所有页面投影类型都在那里：例如 FeedSnapshot 定义仍在 `projection.ts`。按候选第 3 节执行即可——先移走无消费者字段；有真正保留的事实需求才取现有合同，找不到就给根具体调用链，不补镜像 DTO 或导出桥。候选已有这个停止条件，不需追加修订。
- `project-settings-pages.ts` 当前部分类型已来自 Goals `/contract`；这些合法事实引用不能仅因点名 Goals 而删除。候选明确“不扩大成禁止所有插件公共合同”，并将最终文件/符号表留到前置采用后冻结，足以约束 RAC2685 的最终清单。`capsule-items.ts` 当前还消费 Goals 展示字段和函数，函数/渲染若未由前置解决，应回父片，不由 T117 强转掩盖。

## 现行 exports 收尾与验收：通过

w5-08 已完成的工作是去插件再导出、去 export-star、收窄无人使用的入口；不是要求把所有工作台类型都删掉。现行 `tests/workbench-entry-exports.test.ts` 的 RAC-710/711/1115 仍明确保留两类待核项：Goals 适配器，以及宿主生成声明需点名的 Capsule 六类型、ChooserArrival、ProjectSettingsFoldId、SideViewDocumentInput。候选要求按实际消费者、声明构建和父片最终 diff 更新清单，不机械重复旧清理，也不把“没有 import”当“可以删除”。这与原片 §2/§3 一致。

候选的验收足够覆盖本单风险：活动包根实现类型引用消失或改取现有事实合同；字段只有在消费者迁走后才删；展示类型没有新增公共出口/镜像 schema；入口与 AST 清单按真实减少同步；构建解析和 API/actions 零差异；行为、身份、授权、未启用插件边界不变。若必须改运行对象或新合同，先交根调整范围，不能当类型改动静默实施。

`workbench-entry-exports` 与前置提供的 `workbench-goals-mentions`，加现存 `capsule.test.ts`、`current-project-settings.test.ts`、`project-settings-stage.test.ts`，作为最终差集的定向验证起点合理。候选明确最终文件变化可调整对应测试，而不重造已删除路径。父片 HTML/浏览器证据只在相同输入与生产路径未变时核抵；无证据仍记未运行，未将类型构建或 CI 绿替代产品路径验收。

乙档及 `full=true` 交根按最终影响核定、本机不 Full、源码类型改动先公共槽整体构建、测试按完整文件和共享槽串行，均保留现有规则。无需新增测试框架、固定矩阵或独立状态系统。

## 前置与 WAIT：通过

完整 T116 PR1 包含 1b 必修及 1c 声明舞台/词典；仅 1a 文件搬迁或某个 PR 通过不能释放 T117。T402 负责 Feed/Inbox 模型迁出，T117 等它采用再收类型尾项，依赖成立。候选没有把 T403 客户端资源交付或 T118 状态核收错误地并入本单。

共享文件锁和单 writer 也合理：page-view、外壳/renderer 的在途占用只能按根领单时 fresh 核对解除；候选里的 PR 号是快照，不是实时放行。最终短表需列精确路径、符号/字段、现有 owner 出口、直接测试与共享锁；这正是依赖尚未落地时应保留的执行条件，不是工程书缺陷，也不要求此刻预先编造最终 diff。

释放条件保持原候选：**T116 完整 PR1 与 T402 实际采用，最终范围表冻结，根安排单 writer 并核共享锁。** 满足后按既有授权实施；本报告不解除 WAIT、不修改任务数量、不签 T117 或 PG-064 已完成。文档状态及保护路径差集仍交根串行处理。

— Codex，T117 独立只读审书，2026-10-31
