# Coding 插件工作台接入与功能修复

## 目标与完成等级
2026-09-23：检查并修复 Coding、Workspace、Files、Git、Diff、Text Stats 的现有调用链，使当前工作台中的入口、主内容和已实现操作真实可用。目标为「功能可用」；本轮不以自动测试代替真实模型质量、安装或发布验收。

## 当前证据
- 导航已切换到按 `data-work-surface` 挂载主区；Workspace/Files/Git 仍仅输出旧侧栏 panel，没有主区。
- 旧 panel 的 `data-action` 按钮没有对应客户端；有效 Files/Git 客户端只绑定 Coding 内部的 browser/result。
- Coding 客户端监听已退役的全局 item-selected 事件，当前标签系统发的是 surface 上的 select-item。
- Companion API 一律要求 Coding 启用，独立 Files/Git 等被错误拒绝。
- Diff 声明 git-change-set 输入组但 state 未处理该组。
- 定向 HTTP 测试证明 Coding 设置直达页 404：注册页面查找误用未带项目的导航过滤。保留导航范围，路由从已注册 contribution 查找；覆盖直达与项目上下文。
- 当前工作区存在大量其他任务未提交修改，保留其内容。旧文档中提交推送授权不属于本次会话，不执行提交、推送或发布。

## 保留、替换与范围
保留现有会话、草稿、执行、计划、审查、Artifact 固定版本以及文件/Git 安全边界；保留现有设计系统和标签/分栏机制。
替换旧目录栏挂载及失效事件，给各插件完整主区、可操作空状态与失败重试。Coding 目录随其主区一起挂载。
忽略旧三栏必须占宿主全局目录的约束，不扩大为 IDE 重写，不新增模型供应商或 Git 提交/push 等未完成能力。

## 行为与依赖
- 点击已启用插件打开其真实主区。Coding 新建/切换/恢复标签到原会话与草稿，打开页面不运行模型。
- Workspace 列出项目授权目录，可明确选择浏览目录；新目录经原 `/api/workspaces` 确认入口关联。
- Files/Git 独立可用，复用原声明路由和 browser 控制器；每个实例限定在自己的 root，避免污染 Coding 内嵌视图。
- Files 读文本/目录，固定快照并看到 Diff 与统计；Git 读真实状态/差异并沿用宿主审查操作。
- Diff/Text Stats 提供独立可刷新结果页与明确缺输入说明，导航可达。
- HTTP 检查目标插件实际启用状态，同时保留 Coding 所需的内嵌伴随能力。禁用 Coding 时其自身路由仍拒绝。
- 不隐藏启动/读取错误成空白。无法取得工作区、无仓库、无模型均给原因与实际下一步。

## 文件边界
主 Session：插件 UI/client/manifest 与工作台挂载、Host 页面组合、定向 UI/E2E 测试。
后端 Work Item：`apps/local-host/src/web-request.ts`、`plugins/native/diff/src/plugin.ts`、`plugins/native/text-stats/src/plugin.ts` 及新定向 HTTP/输入组测试；不得改主 Session 文件。
共享 spec 仅主 Session 更新；构建由主 Session 串行执行。

## 验收与验证
1. 正式项目页各插件有主内容；桌面/窄屏按钮可达，无页面 JS 异常。
2. Coding 两会话之间通过标签切换，返回各自草稿，重载后仍能读原会话；无模型时可创建/保存但不伪装运行。
3. 独立启用 Files/Git/Workspace 时 API 可用；其他项目/未启用插件仍隔离。
4. 临时真实目录：展开、读取、二次快照比较、文本统计与 Git 差异；失败/空状态能重试。
5. Git 输入组正确投影，不把不可用 Artifact 统计成有效内容。
6. `pnpm build`、受影响插件 typecheck、`pnpm boundary:check` 与相关测试；浏览器真实点击和截图检查。

测试使用隔离临时 Home 和文件凭据后端，避免碰用户数据和钥匙串。结果、验证缺口记录于本文件；模型长会话准确性、旧 SDK 整理问题不默认为本次已修复。

## 交付核对（2026-09-23）

目标完成程度：功能可用。原用户进程、模型凭据、安装包和用户数据未用于测试；未提交、推送或发布。

| 验收 | 结果与证据 |
| --- | --- |
| 六个入口有主内容 | 通过。正式项目页经导航实际打开 Workspace、Files、Git、Diff、Text Stats、Coding；运行时错误不再用缺失主区掩盖。 |
| 会话与草稿 | 通过。浏览器新建两会话，通过真实标签切换、返回母页、刷新恢复，各自草稿保留；查询服务确认只有两会话、均无 Run。修复母页 null 事件与重复点击监听。 |
| 独立启用与隔离 | 通过。正式 HTTP 覆盖七种启用组合；Files/Git 无需 Coding，未授权接口、跨项目工作区与固定成果仍拒绝。 |
| 文件、快照、统计、Git | 通过。临时真实仓库：展开目录、空文件、读取文本、固定前后版本、差异和统计、Git 固定差异；未选 Coding 会话也可读内嵌文件。保留路径/符号链接/版本检查和 Git 审查边界。 |
| 输入组与失效输入 | 通过。真实 PluginPlatform 上 Git 输入组产出对比；不可用、归档或读取抛错的 Artifact 不产出有效统计。 |
| 错误恢复、响应式 | 通过。浏览器阻断 Files 读取与 Git 初次目录请求后恢复；Git 刷新重新走完整目录加载。1360×900 浅色、390×780 浅/深色截图确认；窄屏切换结果、发送区和文件返回可达，页面无未捕获异常。 |
| Coding 设置 | 通过。正式设置直达 URL 恢复；项目导航仍按启用范围过滤。无可用模型提供设置入口，不发送任务。 |
| 工程验证 | 相关测试批次 198 项中197项通过；唯一失败为新增 E2E 未完成的路径，修复后该 E2E 单独通过。六插件及 Workbench typecheck 通过；scoped diff whitespace 检查通过。 |

验证命令：
- `node scripts/run-tests.mjs tests/coding-*.test.ts tests/files-plugin.test.ts tests/git-plugin.test.ts tests/diff-plugin.test.ts tests/workspace-plugin*.test.ts tests/workspace-git*.test.ts tests/plugin-global-settings.test.ts`
- `node scripts/run-tests.mjs tests/coding-workbench.e2e.test.ts`（最终独立复验通过，覆盖后续修复的 Git 刷新与窄屏路径）
- `pnpm -r --filter @molis-ai/molis-work-plugin-coding --filter @molis-ai/molis-work-plugin-workspace --filter @molis-ai/molis-work-plugin-files --filter @molis-ai/molis-work-plugin-git --filter @molis-ai/molis-work-plugin-diff --filter @molis-ai/molis-work-plugin-text-stats --filter @molis-ai/molis-work-app-workbench run typecheck`

截图保存在 `.tmp/coding-workbench-review/`。当前全仓门禁不能记为通过：初次 `pnpm build` 通过；之后并行 Alchemist studio 代码引入缺失 React/Zod 依赖使全构建失败，排除 Alchemist 的一次工作区构建通过；再后续 Host 构建受该并行模块尚未导出的 `AlchemistAiPort` 类型挡住。`boundary:check` 唯一报告 Alchemist workspace inventory 与声明不一致。没有为通过门禁改动其实现或依赖。

未验证：真实付费模型长会话质量、SDK 整理故障、正式安装升级、运行中用户服务加载本次版本、一骏本人验收。本次不据此宣称整个 Coding 产品内部完整或可发布。
