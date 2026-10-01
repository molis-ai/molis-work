# Session 与工作目录工作台内部完整验收

## 完成等级

本 Goal 达到 **内部完整（Level 4）**：真实数据、首次使用、主链路、能力降级、异常恢复和关键交互可供内部顺畅试用。本轮不宣称公开发布、安装包或外部升级已经验证。

## 目标与问题证据

此前各 Work Item 已分别交付 Session Registry、项目内 Sessions 目录、项目内工作目录、按需内容读取和 Handoff，但分模块通过不能证明完整工作流没有以下断点：

- Molis Work `session_id`、Runtime 原生 Session ID、panel、legacy work-context、workspace 与 Goal 被错误混用；
- Codex 原生能力和弱能力 Runtime 的 fallback 被 UI 或服务层夸大；
- 手动创建的 Runtime Session、Goal TUI Session 和晚到原生 ID 无法稳定绑定到同一条 Session；
- 列表或日志泄露正文，Handoff 未经确认发送，跨项目可以读取内容；
- 迁移、归档恢复、路径修复或进程重启后关系丢失；
- 空、错、慢、不可读取及窄屏/键盘路径无法实际操作。

## 范围

### 本轮检查并修复

1. 身份与关联：审计所有 Session 相关 ID 的生产者、持久化、消费者和兼容边界；以 `session_id` 作为 Molis Work 业务入口，保留但隔离仍有回退价值的旧信号。
2. 状态：对齐 Session、内容、Handoff、workspace 与页面展示状态，禁止把 unknown/unsupported/failed 显示成成功或空结果。
3. Runtime 绑定：验证 Codex 原生路径，以及 Claude Code、Grok Build、generic 等未注册原生适配器时的诚实 fallback；业务层只按 capability 路由。
4. 用户流程：验证项目入口、Session 显式关联、Goal TUI 捕获、详情按需读取、原 Runtime 恢复或明确降级、Handoff、归档恢复、路径修复和重启恢复。
5. 隐私：正文不进入目录/搜索/普通日志；跨项目详情拒绝；Handoff 必须先生成并审阅草稿，再由用户确认发送；不删除 Runtime 原数据或真实目录。
6. 体验：检查真实、首次、空、错、慢、不可发现/读取/恢复、窄屏和键盘路径；修复阻塞高效使用的真实问题。
7. 清理：删除已经失去消费者的原型数据、旧分支和重复字段；不为未来可能性增加未被当前路径消费的实现。

### 非目标

- 为每个未来 Runtime 猜测或实现未验证的原生 Session API。
- 删除 legacy catalog、panel 或环境变量兼容回退。
- 删除原 Runtime Session、Session 正文或真实工作目录。
- 增加跨 Session 全文索引、批量操作或公开发布流程。
- 为了让全套测试变绿而修改与本 Goal 无关的 Feed 行为。

## 身份边界与唯一调用链

| 身份 | 生产者 | 允许的用途 | 禁止用途 |
| --- | --- | --- | --- |
| `session_id` | Molis Work Session Registry | 目录、详情、关联、事件、Handoff 的业务主键 | 冒充 Runtime 原生 ID |
| `runtime_id` | Adapter Registry / 启动配置 | 选择命名空间和 capability | 单独标识一条 Session |
| `native_runtime_session_id` | Runtime | 原生 discover/read/resume/handoff | 跨 Runtime 比较；从 panel/workspace 推导 |
| `surface_id` / `panel_id` | Molis Work UI | 连接显示入口与同一次启动 | 代表内容或 Runtime Session |
| `correlation_token` / legacy work-context | Molis Work 启动与兼容层 | 原生 ID 返回前的短期对账、旧数据迁移 | 长期业务主键 |
| `project_id` | Project Catalog + 用户确认 | 限定目录和内容授权范围 | 从 cwd/最近项目静默写入 |
| `current_goal_id` / history | Session Registry + 用户确认 | 当前焦点与历史追溯 | 打开页面时自动改写 |
| `workspace_id` / path | Project Catalog | 工作目录关系与启动位置 | Session 身份或隐式持久默认 |

主链固定为：

1. UI、MCP 或桌面宿主提供 Runtime 信号与用户选择；
2. compatibility 只负责把旧信号规范化和对账到 Registry；
3. Registry 返回 Molis Work `session_id` 及已确认关系；
4. Runtime Adapter Router 依据 capability 选择 native、registry fallback 或 unsupported；
5. directory/content/resume/handoff 服务只消费统一 Session 记录；
6. Web API 按 URL 中的 project scope 再校验 Session/Workspace 关系；
7. UI 展示真实结果或明确降级，不制造示例记录和假状态。

## 状态契约

- Session：`discovered` 只代表发现但未确认项目关系；`active` 代表已关联且可管理；`closed` 仅代表 Molis Work 归档。目录不得把“没有活动进程”误写成 Runtime 执行结束。
- 内容：`native | fallback | unavailable | failed`；native 失败且有 Molis Work 事件时可显示 fallback，并保留原生错误；没有事件时必须区分 unavailable 和 failed。
- Handoff：`draft -> sending -> sent`；确定未受理的失败可进入可重试 `failed`，受理结果不确定或已创建目标 Session 的失败不可自动重试；可从 draft/failed 取消。
- 工作目录：路径有效性与“是否有关联 Session”是两件事；修复只改 Molis Work 关系，不移动/删除目录。
- 页面：loading、empty、unsupported、failed、archived 必须各自可辨，不能用空数组掩盖请求失败。

## 端到端场景

`tests/session-workspace.e2e.test.ts` 至少覆盖：

1. Codex 原生：发现但不自动绑定 → 用户确认关联项目/Goal/workspace → 四个入口可查询 → 按需读取 → 原生恢复 → Handoff 新 Session → 归档/恢复 → Registry 重启后保持。
2. 弱能力 Runtime：显式创建 Molis Work Session → 目录可查 → Molis Work TUI 内容 fallback → read/resume/handoff 明确降级或走已确认的 Molis Work fallback → 归档/恢复 → 重启保持。
3. 身份隔离：同一目录两个 Session、多 Runtime 使用相同 native ID、晚到 native ID、跨项目内容请求都不串联。
4. 迁移恢复：旧 binding/panel 重复迁移不增行，失败回滚，旧事实保留。
5. 隐私与破坏性边界：列表、搜索、错误及日志不含正文/凭据；Handoff 未确认不发送；归档和路径移除不删除 Runtime 数据或文件夹。

## 验收标准

1. `tests/session-migration.test.ts` 与迁移文档证明旧绑定无静默丢失、迁移幂等、失败可恢复、同目录 Session 隔离。
2. `tests/session-workspace.e2e.test.ts` 的 Codex native 与 fallback 两条主链都通过，并覆盖用户确认、四个入口、详情、加载/降级、Handoff、归档恢复、路径修复和重启。
3. 现有 Session、MCP、Desktop 与 Web 定向回归通过；若全套存在无关基线失败，必须给出精确证据且不得借机修改无关行为。
4. 真实浏览器完成项目入口、Sessions、工作目录、详情、对话框、窄屏和键盘检查；无横向溢出、双层状态框、假记录或未经验证的可用能力。
5. `session-content-disclosure` 与 `session-identity-misbinding` 均有可复现证据后才解除；否则 Goal 不完成。

## 验证命令

```bash
pnpm typecheck
node --import tsx --test tests/session-workspace.e2e.test.ts tests/session-migration.test.ts tests/session-registry.test.ts tests/session-adapters.test.ts tests/session-project-binding-router.test.ts tests/session-content.test.ts tests/session-content-privacy.test.ts tests/session-resume.test.ts tests/session-handoff.test.ts tests/session-handoff-recovery.test.ts tests/session-tui-capture.test.ts tests/session-directory.test.ts tests/workspace-directory.test.ts tests/session-project-actions.test.ts tests/workspace-project-actions.test.ts tests/session-web.test.ts
node --import tsx --test tests/mcp.test.ts tests/desktop-tui.test.ts tests/runtime-integration.test.ts tests/project-catalog.test.ts
node --import tsx --test tests/web.test.ts
pnpm build
git diff --check
```

## 开放项

- 完整审计后若发现旧字段仍被 compatibility、panel 连接或迁移消费，则保留并在本文记录边界；只有确认无消费者才删除。
- 其他 Runtime 只有在存在已验证 Adapter 时显示原生能力；否则保留 registry fallback，不把 CLI 参数推测成可读取、可恢复或可 Handoff 的事实。
- 本文在执行阶段追加实际审计表、测试结果、浏览器证据、风险解除依据与未运行项，作为 `inspection://session-workspace-internal-qa` 的可复现载体。

## 实际审计结果

### ID 生产、持久化与消费

| ID | 实际生产者与持久化 | 实际消费者 | 结论 |
| --- | --- | --- | --- |
| Molis Work `session_id` | Registry 创建并保存在 `sessions.db` | Web 路由、目录、内容、恢复、关系、事件、Handoff | 保留为唯一业务入口；UI 和服务不再拿 panel/work-context 代替它 |
| `runtime_id + native_runtime_session_id` | Runtime / Adapter；Registry 以 Runtime 命名空间唯一索引保存 | Adapter 的 discover/read/resume/handoff | 保留为原生能力地址；相同 native ID 可在不同 Runtime 中共存 |
| `MOLIS_WORK_SESSION_ID` | Desktop/Molis Work 启动边界 | `sessions/compatibility.ts` | 保留为新 Session 信号；与 Runtime 原生 ID 冲突时不会覆盖原生匹配 |
| `surface_id` / `MOLIS_WORK_PANEL_ID` | Desktop panel / PTY | compatibility、legacy migration、panel 所有权 | 保留兼容；只做 surface 对账，原生 ID 冲突时拒绝复用旧 surface |
| `MOLIS_WORK_GOAL_ID` | Desktop/PTY 启动入口 | compatibility 产生当前 Goal 候选 | 保留；不直接创建、改写或标识 Session |
| `correlation_token` / `MOLIS_WORK_WORK_CONTEXT_ID` | native ID 返回前的启动链和旧 panel/binding | compatibility 与幂等迁移 | 保留兜底；只在匹配、未过期且没有矛盾原生 ID 时参与对账 |
| `workspace_id` / path | Project Catalog、用户显式选择、Runtime cwd | 启动、筛选、路径修复和 Handoff 目标 | 保留为位置与关系；不作为 Project 默认、不作为 Session 身份 |

直接消费旧环境变量的生产代码只剩 `src/sessions/compatibility.ts`；`src/desktop/launch.ts` 与 `src/web/pty-client.ts` 是兼容信号生产者。MCP 单次调用上下文已经把内部字段明确命名为 `runtimeSessionId` / `runtimeSessionIdSource`，避免和 Registry `session_id` 混淆。

### 状态与能力

| 对象 | 权威状态 | 审计结果 |
| --- | --- | --- |
| Session | `discovered / active / closed` | Runtime 返回的 `status` 只保存为 `metadata.native_status`；重新发现不会把用户已归档记录静默恢复 |
| 目录展示 | `idle / archived` | 只表达可查看或已归档；已删除不存在的 `running / failed` 静态选项和 CSS 分支 |
| 内容 | `native / fallback / unavailable / failed` | 页面静态能力只显示前三类；请求时原生读失败仍返回动态 `failed` 和原错误。未知返回结构不再伪装成空原生内容 |
| 恢复 | `native / registry / unsupported` capability | “加载原 Session”只看 resume capability，不再用 read capability 代替；不支持时明确引导创建 Handoff |
| Handoff | `draft / sending / failed / sent / cancelled` | 草稿 workspace 字段省略时保持原身份；只有路径真的改变且没有新 ID 时才清除旧 ID |
| 工作目录 | `healthy / missing / conflict` | 路径健康与 Session 数量分离；修复、移除只改 Molis Work 记录，不移动或删除真实目录 |

### Runtime 支持矩阵

| Runtime | 目录记录 | 原生发现/正文/恢复/Handoff | 当前真实行为 |
| --- | --- | --- | --- |
| Codex | 支持 | 已验证 | 通过 app-server 原生方法读取、恢复和新建 Handoff Session；失败保留原错误与可证明的 Molis Work 事件 |
| Claude Code | 支持 | 未注册原生 Session Adapter | 用户可粘贴原生 ID 或创建 Molis Work 托管记录；TUI 记录可回看；恢复与 Handoff 使用明确 fallback |
| OpenCode | 支持 | 未注册原生 Session Adapter | 与 Claude Code 相同，不根据 CLI 名称猜测 Session API |
| Pi Agent | 支持 | 未注册原生 Session Adapter | 与 Claude Code 相同；安装层支持 MCP/Skill，不等于 Session 正文 API 已验证 |
| Grok Build | 支持 | 未注册原生 Session Adapter | 与 Claude Code 相同；可由工作目录启动，跨 Runtime 续跑生成 Molis Work fallback Session |
| 其他 Runtime | 支持 registry fallback | 未声明即 unsupported | Router 统一返回诚实 fallback，不增加 Runtime 名称分支 |

## 执行中发现并修复的问题

1. 修正旧 Molis Work Session ID、surface 与当前原生 Runtime ID 冲突时仍可能错误复用旧 Session 的身份串线风险。
2. 把 Runtime 原生执行状态与 Molis Work 的发现/关联/归档状态分开，避免 Runtime 同步覆盖用户归档决定。
3. 把内容读取与 Session 恢复 capability 分开，避免“能读取”被错误显示成“能原生续跑”。
4. 原生读取返回未知结构时改为可见失败，并继续保留已证明的 Molis Work TUI 事件，不再显示假空结果。
5. 修复 Web 更新/发送 Handoff 草稿时清空既有 `workspace_id` 的问题，使目标 Session 继续参与路径修复与统计。
6. Session 和工作目录列表复用 Goal/Feed 的目录行语法；状态文字只有一层边框。窄屏 Session 顺序调整为 Hero → Goal 历史 → 执行内容 → 关系/兼容信息。
7. 修复动态加载状态没有图标时仍落入 28px 图标列、导致中文一字一行的问题。
8. 修复依赖变更后 `needs_revalidation` Goal 的 Risk 收口死锁：revalidator 现在只能为自己正在复核的同一 Goal 提交带证据的 Risk 生命周期提案，仍须用户确认，不能修改 Contract、关系或其他 Goal。
9. 修正 Runtime 接入完成后的 onboarding 仍提示用户设置“目录默认项目”的旧文案；现在明确每个新 Session 都重新确认 Project，存量 default 字段只用于兼容读取与拒绝旧写入，不再参与路由。
10. 删除全局设置中已经失去 UI 消费者的 Session connection、workspace membership 读取与写入 API；Session 关系和工作目录关系只从对应 Project 的两个平级目录管理。

## 验证证据

### 自动化

- Session、workspace、MCP、Desktop、Runtime 集成与项目 catalog 定向回归：`137 / 137` 通过（使用 `--test-concurrency=1`，并允许测试进程监听本机回环端口）。
- `tests/session-workspace.e2e.test.ts`：Codex native 与 fallback 两条完整旅程 `2 / 2` 通过。
- `tests/session-web.test.ts`：真实 Registry、项目隔离、响应式层级和动态加载布局 `2 / 2` 通过。
- Runtime onboarding、Project Catalog、Session/workspace 与 Web 串行回归：除下述既有 Decision Center 断言外 `89 / 90` 通过；本轮新增的“全局设置无 Session/workspace 管理 API”与五类 Runtime 接入提示均通过。
- `tests/v1.test.ts`：完整串行回归通过；其中 revalidator 仅能为当前复核 Goal 提交 Risk 生命周期提案、不能创建或修改其他 Goal 的新边界测试通过。
- `tests/mcp.test.ts` 串行完整回归：`32 / 32` 通过；Runtime 工具面描述已包含 revalidator 的同 Goal Risk 收口权限。
- 本轮收尾定向回归：i18n 与五类 Runtime 接入 `19 / 19` 通过；项目内 Session 隔离与“全局设置不再管理 Session/workspace”两条 Web 主链 `2 / 2` 通过。
- `pnpm typecheck`：通过。
- `pnpm build`：通过。
- `git diff --check`：通过。
- `tests/web.test.ts`：`50 / 51` 通过；唯一失败是既有 Decision Center 用正则锁定旧 Feed 窄屏 `padding: 22px 16px 28px`，与本 Goal 的 Session/workspace 改动无关，本轮未修改 Feed CSS 迎合旧断言。
- 沙箱内测试曾因禁止监听 `127.0.0.1` 产生 `EPERM`，以及 Node 24 SQLite 测试子进程退出时的原生断言；在允许本机回环端口的串行重跑中，137 条目标回归全部通过，未把环境失败计作产品通过证据。

### 真实浏览器

- 桌面有效视口 `1152×720`：Sessions 目录 6 条真实记录、工作目录 1 条真实记录；目录与详情均无横向溢出；状态节点子元素数均为 0，证明没有嵌套双层框。
- Session 内容按需读取成功，真实记录超过 5,000 段；加载态文案宽度 420px，不再竖排；原生与 Molis Work TUI 来源逐段标记。
- 窄屏有效视口 `312×675`：Session 目录、工作目录、两类详情均无横向溢出；44px 操作目标可用；Session 第一屏后依次出现 Goal 历史与执行内容。
- Session 添加、工作目录添加/启动、关系管理均需要显式确认；不支持原生发现/创建时文案明确说明 fallback。Handoff 的可编辑草稿、确认后发送由 Web 集成测试验证，真实项目验收时未制造额外草稿数据。
- 最新源码的全局设置不再渲染 Session connection 或 workspace 管理，也没有对应隐藏管理 API；Codex 接入修复已由用户明确确认并应用，Skill 链接与 Molis Work 所有权收据均指向 `molis-work-0.1.8`，刷新后设置页显示“已接入”。接入说明明确每个新 Session 都重新确认 Project。Claude Code、OpenCode、Pi Agent 与 Grok Build 使用同一接入规则；未检测到或未接入时不会伪装为已可用。后续实测也确认“Runtime 已接入”只证明稳定 launcher、配置指纹和 Skill 链接正确，不等于同版本 release 内容一定已刷新；本轮通过本地安装器的 content digest 另行验证并修复了该差异。
- 截图：`.impeccable/review/project-operations-redo-sessions-dark-final.png`、`.impeccable/review/project-operations-redo-sessions-narrow-final.png`、`.impeccable/review/project-operations-redo-session-detail-narrow-final.png`、`.impeccable/review/project-operations-redo-workspace-detail-narrow-final.png`。

## 风险解除依据

### `session-content-disclosure`

- `tests/session-content-privacy.test.ts` 证明事件正文加密、敏感 metadata 不持久化。
- `tests/session-web.test.ts` 与 `tests/session-workspace.e2e.test.ts` 证明正文只经项目限定的详情 API 按需返回，跨项目请求拒绝，目录/搜索不带正文。
- Handoff 只有明确创建的可编辑草稿含必要内容，发送需要用户再次确认；取消、失败和归档不删除 Runtime 原数据。

结论：当前 Contract 中“目录、搜索、普通日志不泄露正文，正文与 Handoff 受项目范围和确认约束”的风险已经有可复现通过证据，可解除阻塞。

### `session-identity-misbinding`

- `tests/session-registry.test.ts` 证明 Molis Work、Runtime、surface、workspace 身份分离；相同 native ID 跨 Runtime 隔离；旧 Molis Work/surface ID 与新原生 ID 冲突时不复用。
- `tests/session-migration.test.ts` 与 `migration.md` 证明旧 panel/binding 迁移幂等、失败整批回滚、同目录多 Session 不合并。
- `tests/session-workspace.e2e.test.ts` 证明发现不自动绑定、用户确认后才关联、重启后身份稳定、Handoff 创建新的目标 Session。

结论：旧信号只留在 compatibility 边界，Registry `session_id` 与 Runtime 原生 ID 已各自有唯一职责和冲突保护；身份误绑定风险已有可复现通过证据，可解除阻塞。

## Molis Work 收口状态

源码已经补齐 revalidator 的受限 Risk 收口调用链。此前当前对话连接的 Molis Work MCP 来自旧构建，拒绝 revalidator 提交上述两项 Risk 的解决提案；相关 blocked Run 均已如实记录并释放 Claim。用户随后明确确认并应用 Codex 接入修复，Skill 链接与接入收据指向 `molis-work-0.1.8`，但重启后新 Session 仍复现旧权限。最终根因是：已安装 release 与工作区同为 `0.1.8`，但前者是修复前内容；Codex 的稳定 launcher 正确加载了该过期 release。用户再次明确确认后已执行 `pnpm install:local`，安装器返回“同版本内容已刷新”；安装 release 与工作区的 `dist/v1/coordinator.js`、`dist/mcp/server.js` SHA-256 逐一一致，installation 与 release manifest 的 content digest 也一致。

刷新后新建的 Codex Session `01a055c0-c95c-75a0-bbd1-45dec0a979c3` 已验证新 MCP 调用链：两项 Risk 的解决提案由用户确认并原子应用，内部 QA Goal 完成 revalidate、Evidence、Review 与 complete。父级历史 Contract 因不可变而保留，并由正式 successor Goal `交付项目内 Session 与工作目录工作台` 接替；用户确认的父 GoalTree 收口提案 `goal-tree-proposal-194a47f5-987a-417d-aa09-821e5d06f673` 已 `12 / 12` 应用。最终新父 Goal 为 `accepted / closed_compound / valid / satisfied`，旧父 Goal 为 `replaced`，8 个有效子 Goal 均在新主链中，内部 QA Goal 为 `satisfied`，两项 Risk 均为 `resolved`。Goal graph 检查为 0 个问题，且没有待处理 Proposal、Claim 或执行动作。
