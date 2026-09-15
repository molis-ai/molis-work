# Feed Markdown / HTML 安全展示

完成等级：3（功能可用）

## 背景与目标

Feed 详情当前把正文、Markdown 链接和 HTML 标签全部作为纯文本转义，因此 GitHub Release notes 等常见的 Markdown + HTML 混合内容会直接显示源码，正文结构、链接和层级都无法阅读。列表与详情顶部摘要也会显示 `[标题](链接)` 或 `<details>` 等标记。

本任务让 Feed 的外部正文在不降低“不可信输入”安全边界的前提下，自动以适合阅读的富文本呈现；无需用户选择内容格式。

## 当前行为与问题证据

- `src/web/render.ts` 的 `renderPersistedFeedDetail` 对正文统一调用 `escapeHtml`，所以 Markdown 与 HTML 都不会渲染。
- `feedDirectoryEntries` 和 Feed 详情头部直接显示外部 `summary`，导致 Markdown 标记进入目录和摘要区。
- 现有测试只证明脚本与危险链接被当成纯文本；改为富文本后，需要新的白名单过滤证明同一安全结论仍成立。

## 范围

### 包含

- Feed / Inbox 引用详情正文统一解析 GitHub 风格 Markdown，并支持其中的常见内嵌 HTML。
- 支持段落、标题、强调、链接、列表、引用、代码、表格、分隔线和 `details / summary`。
- 对解析后的 HTML 进行服务端白名单过滤；仅允许 HTTP(S) 外链，统一新窗口打开并添加安全关系属性。
- 列表摘要、搜索文本和详情顶部摘要转换为紧凑的纯文本，去掉 Markdown / HTML 标记并限制过长展示。
- 空正文继续显示现有明确空态，不因解析失败导致整个详情不可用。
- 补齐桌面与 760px 以下的正文排版、长链接、宽表格和代码块溢出处理。

### 不包含

- 图片、视频、iframe、表单、SVG、MathML、脚本、外部样式或任意 CSS。
- 语法高亮、远程图片代理、附件预览或 AI 自动摘要。
- 修改 Feed 的存储格式、同步来源、Runtime 上下文或原始正文。
- 在目录列表中直接渲染富文本。

## 方案与关键决定

1. 不做“Markdown 或 HTML”二选一判断。外部正文可能混合两者，统一先按 GFM Markdown 解析，再过滤解析产物。
2. 解析与过滤在服务端完成，输出只包含受控标签和属性。解析器不承担安全职责；过滤器是最终安全边界。
3. 链接只允许 `http`、`https`，协议相对地址与相对地址不生成可点击外链；危险或无效 `href` 被移除但保留可读文字。
4. `script / style / iframe / object / embed / form / input / svg / math` 等元素及其危险内容不可进入结果；事件属性、`style`、`class` 和未知属性全部丢弃。
5. 目录与头部使用解析后提取的纯文本摘要，避免紧凑操作区被复杂排版污染；原正文仍完整保存在 Item 中。
6. 本 spec 替代 `specs/molis-work-feed-workbench/work-items/real-feed/spec.md` 中“详情正文按纯文本呈现”的历史展示决定，不改变其数据所有权和不可信输入规则。

## 输入、输出与模块边界

- 输入：`FeedItemRecord.body / summary` 中的外部不可信字符串。
- `src/web/feed-rich-content.ts`：Markdown 解析、安全过滤、纯文本摘要和链接规范化的唯一实现。
- `src/web/render.ts`：在 Feed 目录、详情头部和正文位置消费上述输出；不自行复制解析规则。
- `src/web/visual-foundation.ts`：Feed 正文的语义排版、折叠内容、代码和横向溢出样式。
- `tests/feed-rich-content.test.ts`：纯函数与 Feed 详情集成测试。
- 输出：可直接插入 Molis Work 自己生成页面的安全 HTML 片段，以及用于紧凑 UI 的纯文本摘要。

## 验收标准

- [x] GitHub 风格 Markdown 链接、标题、列表、代码、表格与 HTML `details / summary` 在同一正文中正确呈现。
- [x] 列表与详情顶部不再直接显示 Markdown 链接或 HTML 标签，搜索仍可命中可见文字。
- [x] `script`、事件属性、`javascript:` / `data:`、iframe、图片和 SVG 不能进入渲染结果；安全链接具有 `target="_blank"` 与 `rel="noopener noreferrer"`。
- [x] 空正文、纯文本、中文、emoji、长 URL、代码块和宽表格都有稳定降级且不造成页面横向溢出。
- [x] 原始 Item 内容、来源、材料、动作与 Runtime 不可信上下文行为保持不变。
- [ ] 定向测试、类型检查、正式构建、差异检查和桌面 / 窄屏视觉检查通过；未运行项明确说明。除正式全量构建被工作区内与本任务无关的现有类型错误阻塞外，其余项目已通过。

## 验证命令

```bash
node --import tsx --test tests/feed-rich-content.test.ts tests/web.test.ts
pnpm typecheck
pnpm build
git diff --check
```

视觉检查：使用真实或等价 GitHub Dependabot 混合正文，检查桌面与约 390px 窄屏的详情头部、正文层级、`details`、表格、代码块和长链接。

## 验证结果

- 新增富文本单元与集成测试：5 / 5 通过。
- Feed 相关测试：42 / 42 通过；其中一个本地 Web API 用例因沙箱禁止监听端口，授权后单独复跑通过。
- 受影响文件的严格 TypeScript 检查：通过。
- `git diff --check`：通过。
- 桌面 1152×800 与窄屏 390×844：正文无页面级横向溢出，原始 Markdown / HTML 标记不再可见，表格和代码块在内容区内可滚动，窄屏操作控件高度保持 44px。
- `pnpm typecheck` / `pnpm build`：未作为通过证据。工作区内与本任务无关的现有改动分别在 `src/web/render.ts` 的未使用声明和 `src/web/server.ts` 的 `dialogue` 类型契约处失败；本任务未越界修改这些代码。
- 完整 `tests/web.test.ts`：未作为通过证据。该文件当前同时受工作区内其他未完成行为变更和沙箱端口权限影响；本任务的页面接入由新增集成测试与浏览器检查覆盖。

## 假设与开放问题

- Feed 正文当前由来源层限制在可控大小，本任务不额外截断详情正文。
- 相对链接缺少可靠来源基址，V1 保留文字但不让它可点击；后续若来源契约提供 canonical base URL，再独立支持安全解析。
