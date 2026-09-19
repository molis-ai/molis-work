# 工作规则设置对齐项目设置

## 背景目标
工作规则页被做成带内滚动和粘底保存条的编辑器，字段区再套一层卡片，里面的分组又是卡片。旁边的「常规」是标题 + 独立设置卡 + 卡内行/折叠。把规则页改成同一套节奏。

## 当前行为与问题
- `.project-rules-document` 走 `settings-content:has(...)` 的编辑器布局：标题钉住、`.settings-rules-fields` 内滚、保存条贴底。
- `.settings-advanced` 和 `.settings-section` 共用卡片样式，高级项单独成卡；修改原因再成一卡。选中字段区时像卡套卡。
- 「常规」是页面背景上的独立 `.settings-section`，折叠用 `.settings-data-disclosure` 放在同一张卡里。

## 范围与非目标
范围：项目工作规则文档的 HTML 分组和设置页 CSS；规则页不再用编辑器内滚；viewport 测试改为跟常规一样滚整页。
非目标：不改规则字段、保存 API、生效语义；不改项目说明新增编辑器（仍可内滚）；不改 Goal 规则表单。

## 使用场景
打开项目设置「工作规则」时，版式和「常规」一样：大标题、状态一句灰字、一张常用设置卡（高级折在卡内）、一张修改原因卡，保存按钮在原因卡底部。

## 方案与关键决策
- 高级项和上次修改原因改成卡内 `settings-data-disclosure`，不再当独立卡片。
- 去掉规则页 `has(> .project-rules-document)` 的 sticky 编辑器布局；`.settings-content` 整页滚动。
- 卡片选择器只保留 `.settings-section`。

## 输入输出与依赖
输入：现有规则字段和文案。
输出：与常规同构的设置卡。
依赖：`PROJECT_SETTINGS_PAGE_STYLES`、Goals `renderProjectPolicyDocument`。

## 文件 / 模块边界
允许：`plugins/native/goals/src/policy-ui.ts`、`apps/workbench/src/styles/project-settings-page.ts`、对应测试。
禁止：改 Policy 写入、MCP、Goal 规则表单语义。

## 验收标准
1. 工作规则字段不再包在独立的内滚编辑器里；高级折叠在「开始与完成要求」卡内。
2. 修改原因是第二张设置卡，取消/保存在这张卡里，不是贴底纸带。
3. 「常规」的名称行、本地数据折叠、项目管理卡保持原样。
4. 窄屏和矮窗口可以滚到保存按钮；校验失败仍停在修改原因。

## 验证命令
- `pnpm --filter @molis-ai/molis-work-plugin-goals build && pnpm --filter @molis-ai/molis-work-app-workbench build`
- `node --import tsx --test --test-concurrency=1 tests/goals-policy-ui.test.ts tests/project-settings-stage.test.ts tests/settings-viewport.e2e.test.ts`
- 浏览器：常规 vs 工作规则并排看卡片节奏；展开高级、校验失败、390 宽。

## 假设与开放问题
矮窗口不再钉住标题和保存条，与常规一致；项目说明的新增编辑器仍保持内滚。
