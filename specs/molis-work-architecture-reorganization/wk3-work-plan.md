# WK3 — Work Native Plugin 执行计划

基于已确认 `goal-reorg-wk3` Contract revision 1 与总 spec。保持创建、恢复、交接、终端、内容隐私和失败恢复的用户行为；不新增 Runtime 功能、不改数据布局。

## 当前问题与归属

WK1 已迁 Session 事实存储，WK2 已迁 Runtime/PTY 技术实现。当前 `src/sessions` 仍编排读取、创建和交接，`src/web/server.ts` 混有产品路由判断，`project-session-workspaces.ts` 与 `pty-client.ts` 集中页面、样式、交互和重连。Work Plugin 仍是空声明，没有承接这些真实职责。

## 顺序与修改边界

1. Work application：将 Session directory/content/resume、handoff 和 TUI recorder 迁入 `plugins/native/work`。通过 Private Work Context 的公开 Query/Command API 保存事实，通过 RuntimeHostApi 调用 Runtime。Handoff package 文本组装与发送/恢复分开；补齐现有生命周期方法的 Contract，不复制 Store。切换生产与测试 caller，清零后删除旧实现。
2. Work UI：Session 目录、详情、操作对话框、终端与浏览器行为归 Work Plugin；按渲染、样式、内容交互、交接、终端连接职责拆分，不把旧大文件整体换名字。通过 UI Host contribution 挂进 Workbench，沿用现有 DOM 行为、语言和布局。
3. HTTP 与 composition：`server.ts` 保留传输鉴权、请求分派和 Host 装配，Work Plugin 承接 Session/terminal/handoff 产品判断；Project/Goal/Session 事实仍通过原 owner API 访问。Work surface 接新入口，移除旧 routes/Facade 对应职责。
4. 更新包构建、依赖约束、开发说明及 huge-class 清单。跑定向场景、全量回归和工作区验证，记录各 criterion 证据后复核 WK3。

## 输入输出与验收

- 输入：Project/Goal 已验证上下文、用户确认、Session 与 Handoff 公开记录、Runtime 能力与调用结果；输出：现有 API 返回、Session/交接状态更新和同样可操作的 UI。
- Private Work Context 是 Session/内容/交接事实唯一 owner；Work Plugin 不导入 Repository/Store、SQL 或旧 src 实现。Runtime Host 不接管业务事实。
- 创建/发现、native/fallback 读取、resume、handoff 草稿/发送/失败/安全重试、TUI 记录/退出、隐私和重启行为须由迁移后的生产入口测试。
- 定向命令：`node --import tsx --test tests/session-*.test.ts`；集成与最终检查：`pnpm test`、`pnpm workspace:verify`、`git diff --check`。
- 此 Goal 仅完成当前基线职责迁移和自动 UI/API 回归；整个重组后的模拟用户前后端验收、代码清理和复测仍按总 spec 第 24 节执行，不缩小总目标。

## 状态

第 1 步已完成：Work 应用通过 Session 公开 API 与 RuntimeHostApi 工作，42 项 Session 测试通过。交接拆为 draft/application、delivery/recovery、package rendering，旧 5 个实现文件 caller 清零后删除。

第 2 步部分完成：Session 目录/详情/对话框、样式与浏览器内容/目录/新建/关联/交接初始化器已归 Work UI Contribution，通过 Workbench 的 UI Host 挂载。54 项定向测试通过；与 HEAD 旧实现比较，空、native、archived fallback/workspace 三种输入的四个 HTML surface 完全一致。浏览器 resume 成功/unsupported/失败测试实际执行完整生产脚本。

终端客户端已迁入 Work：`terminal/client.ts` 装配页面事件与控制器，`screens.ts` 负责 xterm、主题和输出缓冲，`connection.ts` 管认证通道和重连计时，`panels.ts` 管加载/接回/重开/退出，`autofill.ts` 管 Feed/Onboarding 填入。Workbench 使用公开 `terminal-client` 入口；旧 `src/web/pty-client.ts` 和其 allowlist 已删除。xterm 依赖归 Work，终端不再豁免 TypeScript 检查。9 项新行为测试通过：认证与重试、跨 Goal 迟到响应隔离、接回不重启、显式重开、回放恢复、自动填入去重/失败保留/等待确认/消息来源隔离。原有 Desktop/视觉与首批终端测试共 68 项通过；这是自动回归，不替代最终模拟用户 E2E。剩余服务端 terminal UI/read model 仍需处理。

第 3 步部分完成：Session create/discover、content/resume、associations/archive、handoff prepare/update/send/cancel 已移到 Work 的独立 HTTP handlers。Web Server 仅传入已鉴权的请求、响应及 Goal/Project/workspace ports；此阶段全量回归 526 项通过。后续终端客户端迁移后的工作区及全量回归另行运行；Panel/terminal 路由和 read-model composition 仍需处理。

## 收尾结果

上面的分步记录保留实施顺序。当前第 1–4 步的代码工作均已完成：后续已迁 Session/workspace read model、Panel/Workspace HTTP、终端模板、终端英文 catalog 与 workspace 补偿恢复，旧转发入口已清理。535 项全量回归及最后 90 项定向回归通过，工作区构建/类型/边界通过。

正式验收以 [wk3-validation.md](wk3-validation.md) 为准。没有新增产品决策；最终全产品模拟用户验收仍待整个开发阶段完成后执行。
