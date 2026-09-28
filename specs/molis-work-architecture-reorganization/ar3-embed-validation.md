# AR3：正式嵌入与旧结果入口对账

本文件补充浏览入口阶段的历史证据，不把之前的 inconclusive Evidence 改成通过，也不代表整体重组已经完成。

## 真实嵌入链路

Goal 上下文请求 → root 绑定当前 Project / 可见 Goal → Native Artifact application 查询公开 Ledger 的明确输入/产出关系 → 公开 Artifact Query 取精确版本 → Workbench 通过 UI Host 挂载 contribution → 返回 Goal 槽位。

没有关系时旧页面不增加入口；初始 Goal HTML 不加载全部 Artifact。输入 v1 和产出 v2 独立展示，缺失版本保留 id/version；unavailable、archived 或解除关系后重新读取反映 owner 的当前事实。跨 Project 目标引用不混入当前 Goal。

## 结果与引用 caller 清单

| 旧内容 / 调用者 | 迁移结果 / 保留边界 |
| --- | --- |
| `render.ts::renderReference` 的外链、文件、复制分类 | Native `reference-ui.ts` 唯一拥有展示分类；root 只把 primitives 交给 Workbench contribution renderer |
| Goal input bindings / Risk resolution refs / Impact input snapshot | 通过相同公开 renderer 查看旧字符串；绑定关系、风险结论、Impact 事实不改变 |
| dependency evidence refs / Proposal source refs | 同上；不把来源 locator 变成虚构 Artifact version |
| EX4 Run `output_refs` / Evidence `locator` | 经注入的同一 renderer；Evidence unverified 项目引用的禁打开决定继续归 Evidence 的展示 owner，保留复制模式 |
| `/api/project-references/:reference` | Native `openArtifactProjectReference` 核对精确 Evidence / verified 状态和记录的原 workspace；Evidence Module 安全 reader 继续处理目录边界、符号链接、文本和大小限制；root 只编码 HTTP |
| Evidence POST / Review 选择 / conversation verdict / 记录摘要 | 仍是 Evidence / Governance 的判定和展示，不是 Artifact 写入。不得为清空搜索结果而转移所有权 |
| 正式 Artifact 浏览、详情、本地导出 | 新 Plugin application / contribution；root 绑定 Project public query；404 不取 latest，导出不发布或共享 |
| 正式 Goal input/output Artifact 嵌入 | 新 `readGoalArtifactEmbeds` application 与 Workbench `goalContext`；Goal 显式提供槽位，不绕过被嵌入功能 |
| private Work / Handoff / Session `content_ref` | 保持私人上下文，不自动发布，不读取私人会话补充 Artifact |

旧系统没有正式 Artifact 表；这些 locator 缺少 producer 的 id/version，因此迁移的是实际展示和内容打开职责，而非批量重写历史数据。正式版本由 AR1 公开 Command 写入，查看操作不写入任何 owner。

## 已执行的验证

- `tests/artifact-browser.test.ts` 新增真实 HTTP 场景覆盖上述 Goal relation → lazy panel → 版本详情，以及缺失版本、不可用、归档、解除关系、跨 Project 和不存在的 Goal。比较 Artifact、Ledger、Goal、Evidence、Run、Review 前后事实，读取无写入。
- 与 Artifact reference UI / Workbench UI Host 测试合计 12/12 通过；Web 与 Context Materialization 合计 62/62 通过。
- `pnpm boundary:check`：48 packages / 259 source files / 616 imports / 65 dependency edges，零错误。`git diff --check` 通过。
- Chrome 1024×900：实际展开 Goal 上下文的关联结果，输入 v1 / 产出 v2 同时出现；已点击 v1 验证精确版本。
- Chrome 390×844：输入和产出版本自然换行，document width / scrollWidth 均为 390；点击第二个“查看这个版本”，实际进入 v2 详情，精确引用 version 为 2。
- 截图在 `.impeccable/review/ar3-embed/`：`desktop.png` / `mobile.png` 是整体顶部；`desktop-context.png` / `mobile-context.png` 是 Goal 内滚动容器的嵌入补充，不冒称全页顶部。均已打开确认。
- 本次 UI detector 运行一次 `[]`；独立 finish reviewer 返回 `ship`，未列新增区域的实质问题。范围仅为 Goal 上下文嵌入，不是全产品验收。沿用 DESIGN，无视觉系统修改。

## 复制行为与验收边界

浏览器工具的键盘粘贴明确报 `Browser Use virtual clipboard has no data to paste`；这是工具的虚拟剪贴板路径，不能据此断言产品失败。原生 App 读取连续两次超时。测试期间未提交新建 Goal 表单，未用已复制提示替代实际结果验证。

已通过 `tests/artifact-clipboard.e2e.test.ts`：隔离 Chrome profile 从生产 HTTP Goal 页面进入记录，真实鼠标点击 Plugin 渲染的引用，真实 `navigator.clipboard.readText()` 与固定中文/查询字符串逐字相等。浏览器权限拒绝后再次点击，显示无法访问剪贴板；恢复权限读回仍是原引用。没有 mock clipboard 或修改生产 handler；Goal/Evidence/Run/Review 前后相同。测试用减弱动画、真实命中目标和前台页面避免点击动画中的坐标，不改变产品语义。

联跑命令 `pnpm exec tsx --test tests/artifact-clipboard.e2e.test.ts tests/artifact-browser.test.ts tests/artifact-project-reference.test.ts tests/artifact-reference-ui.test.ts`：13/13 通过，0 skipped。此前虚拟剪贴板的读回限制保留为历史事实；本次独立真实浏览器证据补齐实际复制验证，不再据此阻塞迁移。

## Contract 对照

| 条件 | 结论 | 依据 |
| --- | --- | --- |
| `ar3-boundary` | 通过 | 唯一事实 owner 与公开 Query/Command；Plugin 无 Store/SQL/文件系统及 producer implementation；Workbench UI Host contribution；边界检查零错误 |
| `ar3-legacy-exit` | 通过 | 上述全部结果/文件/引用 caller 逐项归属；root 只保留 composition/HTTP，原 Evidence/private Work 规则不被吸收；旧字符串与内容对账测试 |
| `ar3-result` | 通过（功能可用级迁移） | 正式列表/详情/本地导出/实际 Goal 嵌入，精确版本、consumer 缺失和错误/恢复路径；真实 HTTP、桌面/窄屏操作、真实复制成功/拒绝与无写入对账 |

本结论不包含基线不存在的 Plugin 安装市场或 Team 同步。整体开发后仍需安装版本更新、完整前后端模拟用户 E2E、代码清理及第二轮 E2E / 初始要求逐项审计；不能据 AR3 推导整个重组已完成。
