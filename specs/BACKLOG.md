# 统一待办清单

这里是仓库里**还没做的事**的唯一来源。2026-10-01 全量梳理 `specs/` 时，从各 spec 正文、`implementation.md`、决策记录和合入 PR 的说明中抽取、归并而来。梳理过程与逐份判定见 [合入后审查 §8](archive/post-merge-review/spec.md#8-spec-梳理)。

用法：

- 新发现的未做事项写在这里，不再写进各自 spec 的「未完成」小节；spec 归档时，剩下的事项移到这里，并在 spec 开头注明条目编号。
- 做完一条就删掉它，在提交说明里写编号。不改编号，不复用编号。
- 只抽取与归并，不重新设计需求。几处说法冲突的，列在「待你决定」。

类型：**待你验收**（做完了、等用户本人试用）、**待你决定**（要用户拍板）、**未实现**、**部分实现**、**明确后续做**（原 spec 写明了留到以后）、**已知缺口**（实现里如实标注的限制）。

优先级：**高**＝影响正在用的功能或对外开放；**中**＝下一轮该做；**低**＝有需要再做。负责人写已知的会话或「未分配」。

## 1. 待你验收

功能已合入 main，工程与真实场景验证记在原 spec；只差用户本人试用。系统助理一线用户已在 2026-09-30 委托由 Claude 验证，本人试用为可选。

| 编号 | 事项 | 来源 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- |
| BL-001 | 系统助理 P1–P14（底栏工作、上下文、动作卡、Coding 委托、角色与方法、主动提醒、记忆、子任务、定时、体验） | [system-assistant/implementation.md §3、§16](archive/system-assistant/implementation.md) | 无 | 中 | 用户（可选） |
| BL-002 | 助理面板与底栏改版（标签页、左右分栏、四块左栏、对话呈现） | [assistant-panel-redesign §8](archive/assistant-panel-redesign/spec.md) | 无 | 中 | 用户 |
| BL-003 | Todo 插件 T1–T6 | [todo-plugin/implementation.md](archive/todo-plugin/implementation.md) | 无 | 中 | 用户 |
| BL-004 | 放在哪里与个人空间（AC1 起） | [work-placement §11](archive/work-placement/spec.md) | 无 | 中 | 用户 |
| BL-005 | 平台记忆系统 M1–M5 | [memory-system §17](archive/memory-system/spec.md) | 无 | 中 | 用户 |
| BL-006 | 情境驱动的动态交互 P0–P4（AC-C01–C14） | [contextual-interaction §13](archive/contextual-interaction/spec.md) | 无 | 中 | 用户 |
| BL-007 | 系统级搜索（⌘K 搜真实内容、打开准确位置） | [system-search §12](archive/system-search/spec.md) | 无 | 中 | 用户 |
| BL-008 | Soft Workbench 全局视觉 | [soft-workbench-rollout](archive/soft-workbench-rollout/spec.md) | 无 | 中 | 用户 |
| BL-009 | 标题栏插件通知铃铛 | [plugin-notification-bell](archive/plugin-notification-bell/spec.md) | 先处理通知入口重复（见合入后审查问题表） | 中 | 用户 |
| BL-010 | 炼金术士完整迁入 | [alchemist-plugin](archive/alchemist-plugin/spec.md) | 无 | 低 | 用户 |
| BL-011 | 研究信息 Feed → Inbox → Pages 闭环 | [feed-inbox-pages-loop](archive/feed-inbox-pages-loop/spec.md) | 无 | 低 | 用户 |
| BL-012 | 来源清单、OAuth 与有内容的项目（Onboarding） | [molis-work-context-onboarding](archive/molis-work-context-onboarding/spec.md) | 无 | 中 | 用户 |
| BL-013 | 项目讨论分屏（群聊与公开 Thread） | [molis-work-im/redesign-v2](archive/molis-work-im/redesign-v2/spec.md) | 无 | 低 | 用户 |
| BL-014 | Shelf 原生手势：真人划选不出轮盘、Finder 拖放、系统文件选择器 | [shelf-drop-wheel-arming](archive/shelf-drop-wheel-arming/spec.md)、[shelf-dropagent-parity](archive/shelf-dropagent-parity/spec.md) | 本机原生环境 | 中 | 用户 |
| BL-015 | 菜单栏胶囊在副屏上的点击 | [macos-secondary-display-tray-click](archive/macos-secondary-display-tray-click/spec.md) | 双屏 | 低 | 用户 |
| BL-016 | 真机中文输入法与 VoiceOver：底栏输入、Todo、侧栏、动态交互的读屏 | [system-assistant/implementation.md §14](archive/system-assistant/implementation.md)、[todo-plugin/implementation.md](archive/todo-plugin/implementation.md)、[side-panel §7.4](archive/side-panel/spec.md)、[contextual-interaction](archive/contextual-interaction/spec.md) | 真机 | 中 | 用户 |
| BL-017 | 平台侧栏 7.3 的 8 步，特别是在侧栏浏览器里登录真实网站（AC05） | [side-panel §7.4](archive/side-panel/spec.md) | 无 | 低 | 用户 |
| BL-105 | 打开 Molis Work 的重做：项目选择页（预选上次项目、右边是项目简介）、开场与 Welcome、新建项目引导、更新页（#159） | [project-arrival-flow](archive/project-arrival-flow/spec.md) | 无 | 中 | 用户 |
| BL-109 | #150 性能修复：完整视觉走查，以及原生窗口里的输入与导航验收 | [performance-preserving-fixes](archive/performance-preserving-fixes/spec.md) | 无 | 中 | 用户 |
| BL-111 | 首页一屏与侧栏间距：首页在一屏内放下、侧栏间距对齐 | [home-one-screen](archive/home-one-screen/spec.md) | 无 | 低 | 用户 |

## 2. 待你决定

| 编号 | 事项 | 来源 | 为什么还没做 | 优先级 |
| --- | --- | --- | --- | --- |
| BL-020 | Coding 下一阶段 Q1–Q8：模型联网与搜索服务、命令沙盒档位与放行规则、用户钩子审批、长期记忆是否逐条确认、语言服务器是否自动下载、多模型对比上限与语音服务、GitHub 账号与推送范围、是否做 VS Code 扩展 | [coding-plugin/next-requirements.md §4](coding-plugin/next-requirements.md) | 影响费用、权限与联网范围，原文要求先拍板 | 中 |
| BL-021 | macOS 公开发布：是否申请 Developer ID 与公证 | [macos-desktop-release](archive/macos-desktop-release/spec.md) | 外部账号与费用 | 低 |
| BL-022 | 多人协作项目里项目记忆的可见性；团队共享记忆 | [memory-system §3、§15](archive/memory-system/spec.md) | 等协作能力定型 | 低 |
| BL-023 | Coding 会话的执行目录（项目偏好）与 Files/Git 浏览目录（项目设置）是否合成一个 | [coding-plugin/spec.md 第 0 节「仍未做到」](coding-plugin/spec.md) | 设计取舍 | 中 |
| BL-024 | 侧栏界面控制与平台记忆的 Prologue 提交（`9fc3b173` 等）是否推到 prologue 远端。W1-20 的方案（#318，[dependencies-and-sdk-plan §4.1](repository-anti-corruption/dependencies-and-sdk-plan.md)）查到来源分支早已推到远端并合入（PR #3，2026-09-30），所以没有要推的了；`vendor/prologue-sdk/README.md` 里「暂未推到」的说法过期，随清理 vendored 的那一片（W1-23）改 | [vendor/prologue-sdk/README.md](../vendor/prologue-sdk/README.md)、[dependencies-and-sdk-plan](repository-anti-corruption/dependencies-and-sdk-plan.md) | 推 Prologue 上游需要用户同意 | 低 |

## 3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-030 | 关闭应用后的持续执行与按时提醒：定时与委托只在服务进程活着时运行，Todo 提醒在关闭期间也不送达 | [system-assistant/implementation.md §4、§16 AC24](archive/system-assistant/implementation.md)、[todo-plugin D09](archive/todo-plugin/implementation.md) | 已知缺口 | 本机单进程的环境边界 | 常驻服务或系统级唤醒 | 低 | 未分配 |
| BL-031 | Prologue：停止时为等待审批的工具补记取消；真正发出后没回执的修改只能显示「结果未确认」 | [system-assistant/implementation.md §4](archive/system-assistant/implementation.md)、[prologue-capability-matrix 缺口 7](archive/system-assistant/prologue-capability-matrix.md) | 已知缺口 | 需改 SDK | Prologue 上游 | 中 | 未分配 |
| BL-032 | 「只说不做」自动续做一次：真实模型下的复现验证 | [system-assistant/implementation.md §4](archive/system-assistant/implementation.md) | 部分实现 | 待真实复现 | 无 | 低 | 未分配 |
| BL-033 | 确认卡与建议卡之间的完整 Tab 顺序走查 | [system-assistant/implementation.md §14](archive/system-assistant/implementation.md) | 未实现 | 走查时未覆盖 | 无 | 中 | 未分配 |
| BL-034 | Prologue 能力未接：界面观察与计算机操作（surfaces）、语音、会话分支与受控导出与会话目标、会话历史检索、SDK Refine、MCP 资源/Prompt/Elicitation、SDK Functions、网页检索与来源摄取 | [prologue-capability-matrix「缺口汇总」](archive/system-assistant/prologue-capability-matrix.md) | 明确后续做 | 按需接入；surfaces 由侧栏线部分接入 | 各项另立需求 | 低 | 未分配 |
| BL-035 | 记忆：Alchemist 内部记忆是否并入平台记忆 | [memory-system §2](archive/memory-system/spec.md) | 明确后续做 | 列为后续评估 | 无 | 低 | 未分配 |
| BL-036 | 记忆：向量检索（槽位已留，先做中文关键词召回） | [memory-system §3](archive/memory-system/spec.md) | 明确后续做 | 非本期目标 | 无 | 低 | 未分配 |
| BL-037 | 记忆：自动写入默认开，若实测误记多改为默认「先问我」；提炼成本单独记账 | [memory-system §15](archive/memory-system/spec.md) | 已知缺口 | 待实测数据 | 无 | 低 | 未分配 |
| BL-038 | 动态交互待定：容器是否原生支持分组；渲染预算 1.5 秒与阈值 τ 用真实 Jev 延迟定；其他插件片段动作的第一批名单 | [contextual-interaction §14](archive/contextual-interaction/spec.md) | 待你决定 | 需真实数据 | 无 | 低 | 未分配 |
| BL-039 | 动态交互：片段级动作只有 Pages、Goals、灵光、Todo 提供，其余插件多数只有对象声明 | [contextual-interaction §13](archive/contextual-interaction/spec.md)、[plugin-e2e-review §5.1](archive/plugin-e2e-review/spec.md) | 部分实现 | Feed、炼金术士方向与实验已补，其余未做 | 各插件 | 中 | 未分配 |
| BL-089 | MiniMax M3.1 把数组参数写成 `{item: …}`（待办的 `sources`、提问工具的 `options` 都碰到过）：网关按合同拒绝，模型有时自己改对，有时连续失败到上限。可以按 schema 把 `{item: X}` 归一成数组，与已有的数字、是否归一同类 | [post-merge-review §5 场景 1](archive/post-merge-review/spec.md) | 已知缺口 | 本步不新增兼容处理 | 无 | 中 | 未分配 |
| BL-090 | 开发者诊断把「输入不合能力合同」的失败记成 `EFFECT_NOT_AUTHORIZED`，看不出真实原因 | [post-merge-review §5 场景 1](archive/post-merge-review/spec.md)（`/api/assistant/diagnostics`） | 已知缺口 | 只影响开发者诊断页 | 无 | 低 | 未分配 |
| BL-091 | 助理过程中的文字会露出内部标识（如 `todo.items.create`、`change-reversible`、分类 id `uncategorized`）；现有防护只检查最后的回复 | [post-merge-review §5 场景 1](archive/post-merge-review/spec.md) | 已知缺口 | 需定过程文字是否也要拦 | 无 | 低 | 未分配 |
| BL-093 | 记忆候选误提炼：一句一次性的「记一下：要把评审会的会议纪要发给全组」被提成项目范围的「以后把评审会的会议纪要发给全组」待确认候选 | [post-merge-review §5 场景 2](archive/post-merge-review/spec.md) | 已知缺口 | 候选需要用户认可，不会直接生效；提炼规则要区分一次性事项与长期偏好 | 无 | 低 | 未分配 |
| BL-101 | 侧栏浏览器：助理点了必应搜索框、等确认约 10 秒后「输入 Molis Work」，框里仍是空的；确认卡写「在当前输入框里输入」，说明那一刻没有获得焦点的输入框（PMR-30）。用户自己点框打字正常 | [post-merge-review §5 场景 4](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 只在真实网站复现一次，原因未查明 | 无 | 中 | 未分配 |
| BL-102 | 窗口约 740px 时，助理面板盖住侧栏浏览器里的确认卡（「允许这一次」只露出一半） | [post-merge-review §5 场景 4](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 窄屏布局 | 无 | 中 | 未分配 |
| BL-103 | 中文对话里，助理的过程文字夹英文句子（「I'll open the page in the sidebar browser.」），结尾还提到会话标识前缀和 `applied: false` | [post-merge-review §5 场景 4](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 模型行为；与 BL-091 同类 | BL-091 | 低 | 未分配 |
| BL-104 | 带清单的一轮：模型更新步骤时用序号「1」「2」「3」，实际编号是 todo-4/5/6，三次都失败，回答仍写「清单已更新为全部完成」（PMR-32） | [post-merge-review §3 PMR-32](archive/post-merge-review/spec.md#3-问题表) | 已知缺口 | 要么在说明里要求照抄编号，要么让工具认序号（后者在 Prologue）；「声称已更新」是否纳入防护要先看误判 | 无 | 中 | 未分配 |

## 4. 搜索、放置与工作流

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-040 | 插件创作台草稿与生成插件的内容不可搜：创作台草稿没有动作层，生成插件不能声明搜索来源与对象读取器 | [system-search §13](archive/system-search/spec.md) | 未实现 | 需创作台组合补动作层 | 创作台 | 中 | 未分配 |
| BL-041 | 项目列表页（无项目时）工作台没有搜索入口 | [system-search §13](archive/system-search/spec.md) | 已知缺口 | 首期范围 | 无 | 低 | 未分配 |
| BL-042 | 真实模型（MiniMax）没有跑过助理搜索场景 | [system-search §13](archive/system-search/spec.md) | 部分实现 | 只用脚本化回复跑通 | 无 | 低 | 未分配 |
| BL-043 | 工作流的动作步骤只提供命令类动作，查询类（搜索、对象读取）不能作步骤；任意输入输出的步骤与字段映射 | [system-search §13](archive/system-search/spec.md)、[action-architecture/migration.md](action-architecture/migration.md) | 未实现 | 工作流步骤模型的范围 | 工作流 | 中 | 未分配 |
| BL-044 | 跨项目库对象的移动（Goals、Feed、Inbox、Artifacts、Schedule、Coding） | [work-placement §9](archive/work-placement/spec.md) | 明确后续做 | 各项目独立库，涉及事件历史与所有权 | 无 | 低 | 未分配 |
| BL-045 | 问卷外网公开链接与托管填写；PPT 富排版（图片、图表、母版） | [work-placement §9](archive/work-placement/spec.md) | 明确后续做 | 与本机优先定位不符 / 非本期 | 无 | 低 | 未分配 |
| BL-046 | 图片插件真实厂商生成未测；图生图、蒙版编辑、多图批处理、厂商异步协议 | [work-placement §13](archive/work-placement/spec.md)、[images-plugin](archive/images-plugin/spec.md) | 明确后续做 | 本机没配图像厂商 | 无 | 低 | 未分配 |
| BL-112 | 全局搜索：工具行先出现，内容结果稍后到达并排在上面，结果在指针下移动，刚瞄准的一行可能被挤开（产品动线用例因此间歇失败，用例已改为等结果稳定） | [post-merge-review §6.1](archive/post-merge-review/spec.md#61-修复合入后的最终回归2026-10-02) | 已知缺口 | 「内容在前」是搜索的设计；可改为给内容预留位置，或已显示的行不再移动，要搜索负责人定 | 无 | 低 | 未分配 |

## 5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-050 | Coding 下一阶段 20 项（A1–E4：仓库说明与 `/init`、斜杠命令、图片输入、代码智能、联网、沙盒与规则、钩子、记忆、多模型对比、VS Code 等） | [coding-plugin/next-requirements.md §5](coding-plugin/next-requirements.md) | 未实现 | 需求已定稿，标「待定」的等 BL-020 | BL-020 | 中 | 未分配 |
| BL-051 | Coding：子任务预算（现在只显示用量）；重试在真实运行中未触发过；派出子任务的标识格式在 SDK 工具参数里加约束 | [coding-plugin/spec.md 第 0 节](coding-plugin/spec.md) | 部分实现 | 见原文各块「还没做 / 未验证」 | Prologue SDK | 低 | 未分配 |
| BL-052 | Characters：五家原生 Agent（含 Cursor、OpenCode）真实启动、规则与技能加载、取消与失败实操 | [characters-local-agent-import](archive/characters-local-agent-import/spec.md) | 部分实现 | 本机缺 CLI，且 AI 验证限定走 Prologue | 本机安装对应 CLI | 低 | 未分配 |
| BL-053 | Shelf：轮盘纸面与字色对齐 DropAgent；面板内 Esc/⌘V/⌘C/⌫ 快捷键 | [shelf-drop-wheel-craft](archive/shelf-drop-wheel-craft/spec.md)、[shelf-plugin](archive/shelf-plugin/spec.md) | 部分实现 | 留后续切片 | 无 | 低 | 未分配 |
| BL-054 | Casebook：规划导出服务与官方 Showcase 接收发布（授权事实与回执接口已有） | [casebook-integration-v1](archive/casebook-integration-v1/spec.md) | 未实现 | V1 合同输入，未排期 | Casebook 仓库 | 低 | 未分配 |
| BL-055 | 插件创作台：真实 Jev 选择的质量与延迟；生成插件自定义代码的运行边界（当前进程内执行器不是任意代码沙箱）；跨项目共享草稿 | [plugin-builder §10](archive/plugin-builder/spec.md) | 已知缺口 | 待实证 | 无 | 中 | 未分配 |
| BL-056 | 规划方法：更多行业按单文件扩充 | [planning-method-markdown-catalog](archive/planning-method-markdown-catalog/spec.md) | 明确后续做 | 首批只为验证机制 | 无 | 低 | 未分配 |
| BL-057 | Cognia：LLM Wiki 专有格式（当前按通用 Markdown Wiki 接入） | [cognia-plugin](archive/cognia-plugin/spec.md) | 明确后续做 | 用户未指定实现 | 无 | 低 | 未分配 |
| BL-058 | 插件市场的上架与审核流程（市场只列本地注册表） | [plugin-platform-v2「不做」](plugin-platform-v2/spec.md) | 明确后续做 | 非本期 | 无 | 低 | 未分配 |
| BL-092 | 从助理结果打开 Jelly 日程时，侧栏「文件」标签写「这个文件所在的插件没有向侧栏提供文件」：日程被叫成文件，Jelly 也没有给侧栏提供预览 | [post-merge-review §5 场景 1](archive/post-merge-review/spec.md) | 已知缺口 | 「在插件中打开」可用（#146 修好后能直接打开到这条日程） | #146 | 低 | 未分配 |
| BL-094 | Feed 的失败提示：来源返回 403 时写「未取得可信终态」；失败卡片带成功图标并露出原码 `protocol_invalid`；同一个错误出现两个提示框；上一个表单的错误带到另一个表单 | [post-merge-review §5 场景 3](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 不是合并引入；Feed 体验整理 | 无 | 中 | 未分配 |
| BL-095 | Feed 添加来源：提交按钮写「创建任务」；来源目录把已知会被网站防火墙拦下的 36氪 当作默认选项 | [post-merge-review §5 场景 3](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 同上 | 无 | 低 | 未分配 |
| BL-096 | Feed 详情与搜索摘要露出内部值：作者写 `exact-1`，标签写 `feed-source:feed-source-<十六进制>` | [post-merge-review §5 场景 3](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 同上 | 无 | 中 | 未分配 |
| BL-097 | 首次打开慢：Feed 第一条详情约 8 秒；从 Inbox「打开待办」后舞台空白约 5 秒才出现待办 | [post-merge-review §5 场景 3](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 要先量插件首次加载的耗时分布 | 第二步性能基线 | 中 | 未分配 |
| BL-098 | 「今天的工作」把同步来的 20 条 Feed 消息都列为「个人」事件（「今天接到 22 件事」），项目里的 Feed 也算作个人 | [post-merge-review §5 场景 3](archive/post-merge-review/spec.md#5-跨功能场景) | 待你决定 | 首页事件应列哪些、怎么归属，属于产品取舍 | 无 | 中 | 未分配 |
| BL-099 | 用 `?openPlugin=market` 打开插件市场时，标签和窗口标题写 `market`（从界面入口打开正常，产品里没有生成这种链接） | [post-merge-review §5 场景 3](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 只在手写地址时出现 | 无 | 低 | 未分配 |
| BL-114 | Dock 的插件切换器把插件创作工作台写成内部 id `plugin-builder`，不是它的显示名 | [artifact-positioning §6](artifact-positioning/spec.md#6-进度)（S4 走查） | 已知缺口 | 从切换器找创作台时看到的是内部名 | 无 | 低 | 未分配 |
| BL-100 | Coding：停止一轮时，还没批准的写文件显示「修改文件 … — 结果未确认」，其实确定没有执行 | [post-merge-review §5 场景 4](archive/post-merge-review/spec.md#5-跨功能场景) | 已知缺口 | 文案与状态映射 | 无 | 低 | 未分配 |
| BL-113 | 插件创作台：界面验收发现「显示问题」时交回设计并重新实现，之后门禁不通过就整次构建失败，没有像普通分支那样交回代码 Agent 修（报名表真实模型复测，PMR-36） | [post-merge-review §3 PMR-36](archive/post-merge-review/spec.md#3-问题表) | 已知缺口 | 显示问题分支在门禁失败时进入相同的修复轮（最多两轮），用离线回放验证 | 无 | 中 | 未分配 |

## 6. 连接、来源与 Onboarding

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-060 | 真实第三方账号验收：Connector 逐服务的真实授权、发布审核与 Feed 的选择→拉取→捕捉组合实操（45 个服务的逐项缺口在 configuration-readiness.md） | [connector-all-methods](archive/connector-all-methods/spec.md)、[connector-experience](archive/connector-experience/spec.md)、[feed-source-workbench](archive/feed-source-workbench/spec.md) | 部分实现 | 缺测试账号与应用配置 | 产品方应用注册与审核 | 中 | 未分配 |
| BL-061 | 来源：浏览器标签页自动捕获、实时 IM Connector、多项目自动归类、持续同步 | [molis-work-context-onboarding](archive/molis-work-context-onboarding/spec.md) | 明确后续做 | 不在现有底座 | 无 | 中 | 未分配 |
| BL-062 | 正式 OAuth 发布配置（产品级客户端） | [molis-work-context-onboarding](archive/molis-work-context-onboarding/spec.md) | 未实现 | 外部条件 | BL-060 | 中 | 未分配 |
| BL-063 | 群聊：手机真机与公网部署 | [molis-work-im](archive/molis-work-im/spec.md) | 明确后续做 | 依赖 Server 与成员身份 | 团队能力 | 低 | 未分配 |
| BL-106 | 选择页项目简介里的材料数、文档数与「助理在做」：设计稿里有，现在按「不猜」不显示（个人空间那一行的「灵光、Shelf、待办」计数同理） | [project-arrival-flow · 与设计稿的差异](archive/project-arrival-flow/spec.md) | 已知缺口 | 没有公开读口，要读各插件私有存储或跨项目汇总 | 各插件的公开读口 | 低 | 未分配 |
| BL-107 | 新建项目引导的「在后台继续」：离开页面后整理仍在继续，回来接着看（现在整理本来就在 Host 后台跑，只是没有登记成后台任务入口） | [project-arrival-flow · 与设计稿的差异](archive/project-arrival-flow/spec.md) | 明确后续做 | 登记成后台任务没有 owner | 无 | 低 | 未分配 |

## 7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-070 | Outbox 的实现与重放验收（目标架构保留，本期只重组现有功能） | [molis-work-architecture-reorganization](molis-work-architecture-reorganization/spec.md) 开头 2026-09-06 范围澄清 | 明确后续做 | 用户 2026-09-06 定为后续 | 无 | 低 | 未分配 |
| BL-071 | 团队空间与多人共享项目（Identity & Space 的团队部分属于 Server） | [work-placement §9](archive/work-placement/spec.md) | 明确后续做 | 未开始 | Server | 低 | 未分配 |
| BL-072 | 构建期装配的 Native 插件不在版本化升级与恢复内 | [plugin-upgrades](archive/plugin-upgrades/spec.md) | 已知缺口 | 随插件装配统一解决 | BL-080 | 中 | 第二步 |
| BL-108 | Runtime 的 MCP 启动器找不到自己 Home 的服务时：①写进 Codex 等配置的环境只有 Home、受众、Runtime，没有 Web 地址，启动器一律去 127.0.0.1:4173，常驻服务不在 4173（如开发用的 4207）就连不上；②4173 上若是另一个 Home 的服务（例如开发时用临时 Home，而 4173 是真实 Home 的常驻服务），发现能力被拒（403），启动器在 tools/list 时抛错退出，Runtime 只看到 MCP 起不来 | [post-merge-review §6.1](archive/post-merge-review/spec.md#61-修复合入后的最终回归2026-10-02) | 已知缺口 | ①要改 Runtime 配置合同（加地址，或让启动器从 Home 读服务地址），属合同变化；②被拒时回 JSON-RPC 错误、说明「4173 上不是这个 Home 的服务」，而不是退出进程 | 无 | 中 | 未分配 |
| BL-110 | 管理项目导航卡死：桌面 Coding 页点「管理项目」后停在原项目。网页与 desktop=1 路径都没复现，原生 WebView 路径没有现场 | [project-management-freeze](archive/project-management-freeze/spec.md) | 已知缺口 | 现场没有复现，要用户再遇到时记下项目与操作 | 无 | 低 | 未分配 |

## 8. 交给第二步（防腐整理）

本轮按「没有旧用户」清除兼容逻辑、统一装配路径。下列是梳理时看到、属于第二步范围的具体对象；第二步的完整清单在 [合入后审查 §12](archive/post-merge-review/spec.md#12-交给第二步的清单)。

| 编号 | 事项 | 来源 | 类型 | 优先级 |
| --- | --- | --- | --- | --- |
| BL-080 | 19 个构建期装配的内置插件迁到 Plugin Runtime（冻结名单在 `tests/builtin-plugin-assembly-gate.test.ts`） | [代码健康报告 R-01](../docs/prompts/code-health-report-2026-09-30.md)、[plugin-platform-v2](plugin-platform-v2/spec.md) | 明确后续做 | 高 |
| BL-081 | 旧动作入口剩余项（2026-10-08 重新清点）：Native MCP 旧名与判断函数旧 MCP 名（#269）、旧场景绑定与 `function_scenes`（#279）、`model:text:api_key`（#239、#246）都已删，`legacyMcp`、`LEGACY_*` 在代码里 0 处。还剩三项：①`/api/plugins/<id>/…` 经 `apps/local-host/src/native-plugin-api.ts` 改写到手写的 `/api/<短名>/…`，随装配统一删（W6-01）；②`/api/functions/by-key/*`（`apps/local-host/src/functions-http/routes.ts:41-42`）按现状是 `functions.describe`、`functions.invoke` 动作的 HTTP 入口（用函数键代替 id），没有已删的旧名可对照；W1-14 的调用链文档（#319）没有裁定它（§10 的两张表里没有这两条路由；它们和同一张路由表里的其他路由同类，路由到动作，不绕开动作路径，3 个用例在用），是否算兼容别名、留不留还没人裁定，要产品判断，和①一起在 HTTP 别名收口时问用户（W6-01）；③`action-architecture/migration.md` 与 spec §3 第 248 行仍把已删的入口写成「保留的兼容入口」「旧名字仍可用」，按代码改正（W1-02）。优先级从高改为中：已删的是对外名字，余下三项是内部改写和文档残留 | [action-architecture/migration.md](action-architecture/migration.md)、[review-2026-09-28](action-architecture/review-2026-09-28.md)、[repository-anti-corruption §3.4](repository-anti-corruption/spec.md#34-第一步交接清单post-merge-review-12) | 明确后续做 | 中 |
| BL-085 | 插件复查遗留：Promote 无 Artifact 口仍写 `goal_id`；Functions 并发锁只覆盖草稿与发布；HTTP 别名、目录面、Workbench 注册手写 | [personal-plugins-review-fixes](archive/personal-plugins-review-fixes/spec.md) | 已知缺口 | 中 |
| BL-086 | 左侧插件栏（`plugin-rail-items`）在统一底栏改版后是否已成死代码。2026-10-08 核对：**不是**死代码——`immersive-shell.ts:194` 仍渲染它，它是插件切换器弹层的列表容器，导航脚本和助理（`assistant-island.ts` 7 处，其中 `surfaceName()` 靠它取插件名）都在读。要做的是让助理改从目录取插件名，再决定容器是否改名（W2-02） | [plugin-rail-selection-align](archive/plugin-rail-selection-align/spec.md)、[repository-anti-corruption §3.4](repository-anti-corruption/spec.md#34-第一步交接清单post-merge-review-12) | 已知缺口 | 低 |
| BL-087 | 端口默认连线按插件名写死（D-04 选 C 短期保留）；有第三方端口插件时改为 Manifest 声明 `default_source` | [repository-systematic-review §9 D-04](archive/repository-systematic-review/spec.md) | 明确后续做 | 中 |
| BL-088 | 个人插件在项目里「移除」即在该项目停用：动作拒绝、搜索来源停用、助理与 MCP 调不到，数据不删、加回即恢复（用户 2026-10-01 决定） | [合入后审查 PMR-15、§9](archive/post-merge-review/spec.md#9-决策记录与待决事项) | 明确后续做 | 高 |
| BL-115 | Home 的备份与清除：没有备份命令、在线备份或统一快照，只有离线备份说明；备份与「卸载并清除数据」没有按同一张登记表覆盖所有库。已定（决定 #20）：`molis-work home snapshot --to <dir>` 经常驻宿主暂停后拍一致快照（带清单、版本核对、完整性检查），清除覆盖所有登记的库；定时在线备份留给 C 端计划。登记表见 `docs/system/HOME-DATA.md` | [repository-anti-corruption §3 R-09](repository-anti-corruption/spec.md#31-附录-a-逐项闭环)、[HOME-DATA](../docs/system/HOME-DATA.md) | 明确后续做 | 中 |
| BL-116 | 空闲负载：单标签空闲时每分钟约 36 个请求（Board 游标、情境候选、通知、后台任务各自轮询），工作台与插件里共 10 处 `setInterval(`；合并成按可见面订阅，并用浏览器用例守住「空闲首页每分钟请求数」预算（W4-09、W4-10） | [合入后审查 §12.2](archive/post-merge-review/spec.md#12-交给第二步的清单)、[repository-anti-corruption §3.4](repository-anti-corruption/spec.md#34-第一步交接清单post-merge-review-12) | 明确后续做 | 中 |
| BL-117 | 版本与发布策略：策略、CHANGELOG 和带各库版本表的发布前检查单已写（W1-22，#321：`docs/releases/POLICY.md`、`CHANGELOG.md`、`CHECKLIST.md`），`scripts/verify-release-versions.mjs` 已进 CI。已定（决定 #23）：一个产品版本、下一版 0.3.0，内置插件 Manifest 跟宿主版本，工作区包保持私有 0.0.0。还没做：根包仍是 0.2.0，「0.2.0」同时指 9 月 23 日与 10 月 7 日两个差别很大的构建；内置插件清单版本仍各自独立（1.0.0 到 1.50.0），清单内容变了而版本没变的情形今天已在发生；`POLICY.md` 起草时补的第 2、3 节细则、官方集成归类和第 7 节的问题等用户确认；清单版本重置与发布 0.3.0 在 W5-15 | [repository-anti-corruption §3 N-19](repository-anti-corruption/spec.md#31-附录-a-逐项闭环)、[发布策略](../docs/releases/POLICY.md) | 明确后续做 | 中 |
| BL-118 | 界面翻译冲突：`apps/workbench/src/i18n/*.ts` 的 5,516 个键里 192 个重复、100 个英文不同（后写的覆盖先写的），`tests/i18n.test.ts` 只查 61 个手写文件、不在 CI。已定（决定 #16）：换成稳定键，先做一个插件样板，词典按主人分，CI 查缺失、无用与冲突（W1-08、W5-03） | [合入后审查 PMR-04、PMR-14](archive/post-merge-review/spec.md#12-交给第二步的清单)、[repository-anti-corruption §3.4](repository-anti-corruption/spec.md#34-第一步交接清单post-merge-review-12) | 明确后续做 | 中 |
| BL-119 | `AGENTS.md` 与 `skills/molis-plugin-dev/host.md` 对「条目」的说法对不上：AGENTS.md 硬约束写「不再往 `builtin-plugins.ts` 加构建期条目」，host.md「必改」第 4 步仍教内置 Runtime 插件在 `BUILTIN_PLUGIN_CATALOG` 加一条——前者指构建期装配名单，后者指目录条目，读的人分不出。统一说法，并说明哪一种条目允许加。W1-15（#317）只改了 `docs/platform/PLUGIN-DEVELOPMENT.md` 与 `LOCAL-HOST.md`，把两种条目分开写清；`host.md` 与 AGENTS.md 没改（[EXTENSION-POINTS §6](../docs/system/EXTENSION-POINTS.md) 第 1 项），留给 W6-03 或单独一次 Skill 改动，用 W1-12 的回放工具验证 | [repository-anti-corruption §3 R-01](repository-anti-corruption/spec.md#31-附录-a-逐项闭环) | 已知缺口 | 中 |
| BL-120 | 内核里的情境策略：`packages/kernel/src/contextual.ts`（候选排序与判断选择）和 `subject-offer-choices.ts` 把产品策略写进内核。基本合同复核已做（W1-14，#319：`action-architecture/spec.md` §3 末尾的「基本合同复核」，缺口 G1–G9）；G4 的结论是按 N-03 代码不搬，改内核 README 与边界规则，所以 W3-04 原先写的「把启发式移到平台产品服务」要重估，内核只留目录、分发、可用性的目标不变 | [repository-anti-corruption §3 N-04](repository-anti-corruption/spec.md#31-附录-a-逐项闭环)、[基本合同复核](action-architecture/spec.md#基本合同复核情境对象撤销后台任务到期提醒效果与作者2026-10-08) | 明确后续做 | 中 |
| BL-121 | 旧名与旧路径残留，随死代码批一起处理（W2-02）：①随根包发布的 `examples/draft-goal.json`、`examples/leaf-goal.json`（`package.json:28-29`）仍写 `"board_id"`；②`?feed-start=1` 并没有断掉入口（`apps/workbench/src/scripts/client/events-secondary.ts:225` 生成、`initialization.ts:279` 读取，`tests/desktop-tui.test.ts:1118` 守着），删之前要产品判断，不能当死代码；③决定回执（`apps/workbench/src/scripts/client/initialization.ts:298-304`、`refresh-decisions.ts:262-318`）由 `plugins/native/goals/src/proposal-client.ts` 调用（`:43` 取上下文，`:75` 在采纳或退回成功后调回执）、`tests/goals-proposal.e2e.test.ts` 断言，同样有入口，W2-02 删之前要产品判断 | [repository-anti-corruption §3 N-15、§3.4](repository-anti-corruption/spec.md#31-附录-a-逐项闭环) | 已知缺口 | 低 |
