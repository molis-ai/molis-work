# 统一待办清单

这里是仓库里**还没做的事**的唯一来源。2026-10-01 全量梳理 `specs/` 时，从各 spec 正文、`implementation.md`、决策记录和合入 PR 的说明中抽取、归并而来。梳理过程与逐份判定见 [合入后审查 §8](post-merge-review/spec.md#8-spec-梳理)。

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

## 2. 待你决定

| 编号 | 事项 | 来源 | 为什么还没做 | 优先级 |
| --- | --- | --- | --- | --- |
| BL-020 | Coding 下一阶段 Q1–Q8：模型联网与搜索服务、命令沙盒档位与放行规则、用户钩子审批、长期记忆是否逐条确认、语言服务器是否自动下载、多模型对比上限与语音服务、GitHub 账号与推送范围、是否做 VS Code 扩展 | [coding-plugin/next-requirements.md §4](coding-plugin/next-requirements.md) | 影响费用、权限与联网范围，原文要求先拍板 | 中 |
| BL-021 | macOS 公开发布：是否申请 Developer ID 与公证 | [macos-desktop-release](archive/macos-desktop-release/spec.md) | 外部账号与费用 | 低 |
| BL-022 | 多人协作项目里项目记忆的可见性；团队共享记忆 | [memory-system §3、§15](archive/memory-system/spec.md) | 等协作能力定型 | 低 |
| BL-023 | Coding 会话的执行目录（项目偏好）与 Files/Git 浏览目录（项目设置）是否合成一个 | [coding-plugin/spec.md 第 0 节「仍未做到」](coding-plugin/spec.md) | 设计取舍 | 中 |
| BL-024 | 侧栏界面控制与平台记忆的 Prologue 提交（`9fc3b173` 等）是否推到 prologue 远端 | [vendor/prologue-sdk/README.md](../vendor/prologue-sdk/README.md) | 推 Prologue 上游需要用户同意 | 低 |

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
| BL-039 | 动态交互：Goals、Inbox 没有对象声明；除 Pages 外的插件没有片段级动作 | [contextual-interaction §13](archive/contextual-interaction/spec.md)、[plugin-e2e-review §5.1](archive/plugin-e2e-review/spec.md) | 部分实现 | Feed、炼金术士方向与实验已补，其余未做 | 各插件 | 中 | 未分配 |

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

## 6. 连接、来源与 Onboarding

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-060 | 真实第三方账号验收：Connector 逐服务的真实授权、发布审核与 Feed 的选择→拉取→捕捉组合实操（45 个服务的逐项缺口在 configuration-readiness.md） | [connector-all-methods](archive/connector-all-methods/spec.md)、[connector-experience](archive/connector-experience/spec.md)、[feed-source-workbench](archive/feed-source-workbench/spec.md) | 部分实现 | 缺测试账号与应用配置 | 产品方应用注册与审核 | 中 | 未分配 |
| BL-061 | 来源：浏览器标签页自动捕获、实时 IM Connector、多项目自动归类、持续同步 | [molis-work-context-onboarding](archive/molis-work-context-onboarding/spec.md) | 明确后续做 | 不在现有底座 | 无 | 中 | 未分配 |
| BL-062 | 正式 OAuth 发布配置（产品级客户端） | [molis-work-context-onboarding](archive/molis-work-context-onboarding/spec.md) | 未实现 | 外部条件 | BL-060 | 中 | 未分配 |
| BL-063 | 群聊：手机真机与公网部署 | [molis-work-im](archive/molis-work-im/spec.md) | 明确后续做 | 依赖 Server 与成员身份 | 团队能力 | 低 | 未分配 |

## 7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-070 | Outbox 的实现与重放验收（目标架构保留，本期只重组现有功能） | [molis-work-architecture-reorganization](molis-work-architecture-reorganization/spec.md) 开头 2026-09-06 范围澄清 | 明确后续做 | 用户 2026-09-06 定为后续 | 无 | 低 | 未分配 |
| BL-071 | 团队空间与多人共享项目（Identity & Space 的团队部分属于 Server） | [work-placement §9](archive/work-placement/spec.md) | 明确后续做 | 未开始 | Server | 低 | 未分配 |
| BL-072 | 构建期装配的 Native 插件不在版本化升级与恢复内 | [plugin-upgrades](archive/plugin-upgrades/spec.md) | 已知缺口 | 随插件装配统一解决 | BL-080 | 中 | 第二步 |

## 8. 交给第二步（防腐整理）

本轮按「没有旧用户」清除兼容逻辑、统一装配路径。下列是梳理时看到、属于第二步范围的具体对象；第二步的完整清单在 [合入后审查 §12](post-merge-review/spec.md#12-交给第二步的清单)。

| 编号 | 事项 | 来源 | 类型 | 优先级 |
| --- | --- | --- | --- | --- |
| BL-080 | 19 个构建期装配的内置插件迁到 Plugin Runtime（冻结名单在 `tests/builtin-plugin-assembly-gate.test.ts`） | [代码健康报告 R-01](../docs/prompts/code-health-report-2026-09-30.md)、[plugin-platform-v2](plugin-platform-v2/spec.md) | 明确后续做 | 高 |
| BL-081 | 旧动作入口：旧 Functions 场景与开关、六组 Native MCP 旧名、判断函数旧 MCP 名、旧函数键 HTTP 别名等「兼容入口薄转发」 | [action-architecture/migration.md](action-architecture/migration.md)、[review-2026-09-28](action-architecture/review-2026-09-28.md) | 明确后续做 | 高 |
| BL-082 | 文字补全仍读旧凭据 `model:text:api_key`（`apps/local-host/src/host-complete-text.ts`、`web-connector-connections.ts`） | [action-architecture/migration.md](action-architecture/migration.md) | 已知缺口 | 中 |
| BL-083 | V3 一次性导入入口（CLI `importV3Capability`） | [standalone-repository/legacy-boundary.md](archive/standalone-repository/legacy-boundary.md) | 明确后续做 | 中 |
| BL-084 | `AssistantSurfaceContext.starters` 读取兼容但已废弃 | [contextual-interaction 决策记录](archive/contextual-interaction/spec.md) | 明确后续做 | 低 |
| BL-085 | 插件复查遗留：Promote 无 Artifact 口仍写 `goal_id`；Functions 并发锁只覆盖草稿与发布；HTTP 别名、目录面、Workbench 注册手写 | [personal-plugins-review-fixes](archive/personal-plugins-review-fixes/spec.md) | 已知缺口 | 中 |
| BL-086 | 左侧插件栏（`plugin-rail-items`）在统一底栏改版后是否已成死代码 | [plugin-rail-selection-align](archive/plugin-rail-selection-align/spec.md) | 已知缺口 | 低 |
| BL-087 | 端口默认连线按插件名写死（D-04 选 C 短期保留）；有第三方端口插件时改为 Manifest 声明 `default_source` | [repository-systematic-review §9 D-04](archive/repository-systematic-review/spec.md) | 明确后续做 | 中 |
| BL-088 | 个人插件在项目里「移除」即在该项目停用：动作拒绝、搜索来源停用、助理与 MCP 调不到，数据不删、加回即恢复（用户 2026-10-01 决定） | [合入后审查 PMR-15、§9](post-merge-review/spec.md#9-决策记录与待决事项) | 明确后续做 | 高 |
