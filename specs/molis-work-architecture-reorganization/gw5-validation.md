# GW5 Goals Native Plugin UI 与文案验收

2026-09-06；accepted `goal-reorg-gw5` revision 1。完成等级：现有 Goals 功能可用、此项迁移行为无损；不代表整个架构重组或可发布验收完成。本文是整项验收证据，canonical 完成状态以 Molis Work transition 为准。

## 验收范围

Canonical 回执：2026-09-05 17:01:04 UTC，三项 passed Evidence `evidence-8efddec5-17d9-4437-ab5a-c78b64f2ef91` 经 `review-15084847-4b63-438c-93fe-74e011422203` self-verifier pass 后，Molis Work 自动完成 GW5（projection=completed）。旧到期 Run 历史未改，收尾与复核 Run 已自动释放。

按原 Contract 保留全部 Goals 一级入口、列表、详情、关系、编辑、Planning、Risk/Policy UI、对应 route/copy 与 Workbench 装配，不把范围缩成最后的项目规则表单。明确排除 Claim/Run/Evidence/Review/Decision 执行验收复合 UI、Store 事实迁移及新产品/视觉功能；排除项不是产品功能删除，而是原 owner 继续提供并在 Cutover 清理。

## gw5-boundary

**通过。** Plugin 用公开 Contracts 的最小 read model 提供真实 UI contribution；Workbench 经 `UiHost.mount` 选择已注册的 contribution/surface/Slot，不持有 Store 或复制持久化/权限规则。

| 完整用户结果 | Plugin owner / Workbench 接入 | 独立行为证据 |
| --- | --- | --- |
| 一级 Goals 入口、current/archive/trash 列表、树与搜索 | Tree contribution 的 root-entry/directory/refresh/tree/chrome；collection model、Tree client | tree-ui/tree.e2e、navigation.e2e、refresh.e2e：目录计数、排序/循环、展开/折叠、搜索/筛选、选中/历史、外部归档恢复和旧响应保护 |
| 详情、标签、上下文/覆盖、草稿 | Document/Context/Status contribution；document/panels/draft/work-tabs client | document-ui/context-ui/document.e2e/draft.e2e：accepted 不可编辑、缺口/目标值/引用、首次惰性打开、取消/重试、保存一次且仍为 Draft、标签焦点与关闭限制 |
| 关系、Risk、Impact、Policy | Relation/Safety/Policy/Factors contribution 与各自 client | relation-ui/relation.e2e/safety-ui/safety.e2e/policy-ui/Web：九种关系与方向、解除历史、归档只读、风险失败重试、Impact 保存/停用、Goal 不能降低项目底线 |
| 项目工作规则完整页面 | Policy `project` surface；project-policy client/styles/就近文案；Host 保留设置导航与 head | project-policy.e2e：空原因拒绝、失败输入保留、重试唯一写入、所有 Goal 继承、新 Claim/Run 不被启动、刷新持久化与一次性成功回执 |
| Planning 方法库、个人编辑、项目采用与独立版本 | Planning contribution/client/styles；公开 route/method selection；Workbench Planning request | planning-ui/planning.e2e/Web：分类/空列表、新建/编辑/不可用状态、failed save 后重试、显式确认后采用、内置模板不被覆盖、project/personal scope 区别 |
| 态势图与记录/进展中的 Goal 内容 | Momentum / Context / Safety / Policy contribution；原 Execution/Decision 内容显式输入 | momentum-ui/momentum.e2e/records.e2e：依赖方向、阻塞、懒加载、过滤/缩放/选中、记录取消/分页重试/无重复、只读前后 facts 不变 |
| 新建、回收、恢复与页面请求 | Dialog contribution/clients；Goals parser；Workbench page/read/fragment adapters | dialogs-ui/dialogs.e2e/document-routes/Web：失败后新建一次、取消不写、同 id 回收恢复且关系/历史保留；非法路径不读 view；集合/偏移/404/headers 保留 |

所有这些 contribution 在 `apps/workbench/src/index.ts#createWorkbenchUiHost` 注册；不存在只建空包而根 renderer 保留同一产品模板的替代路径。不同 owner 的 HTML 只由内部已渲染内容提供，不作为第三方任意 HTML 输入。Module 继续拥有 Goal facts、Policy resolution、关系/风险/生命周期和 Planning 规则；Plugin 的表单预填与显示投影不是第二套授权判定。

最新边界检查（3de35b）：48 packages / 448 sources / 1,236 imports / 71 edges / 30 contract subpaths / 10 compatibility entries / 5 legacy huge files，0 errors。已检查 UI 和 Workbench adapters 的 imports，使用公开 package/Contract 入口，无 root deep import/Store 注入。UI 按完整能力分文件，本次 Policy UI 213 行、project client 107 行、styles 23 行；未新建包/总线/通用运行框架。既有 901 行 action-projection 属于 EX4/后续总治理，不包装成本项新 UI 产物。

## gw5-legacy-exit

**通过本 Goal 的职责退出。** `gw5-caller-audit.md` 按入口列出已切调用和每个残留 owner；不是声称整个 `src/web` retired。

- root 的完整/refresh 页面模板和六种 fragment 路由实现已退出，公开函数改为 Workbench factory 结果；Goals 特有的集合选择/404/方法选择/一级按钮/文案由 Plugin 提供。
- root 的 Policy/Safety/Relation/Tree/Momentum/Document/Context/Draft/Planning/Status/Factors/Dialog 产品模板已改走相应 contribution。整项审查额外发现的项目规则说明/预填/脚注、专属保存交互和样式也已迁走，而不是转交含糊的“其他工作”。
- 专属客户端以有限 Host factory 绑定；项目设置独立脚本复用既有明确 `L`/control-header Host globals。共享 cursor/fallback、跨插件刷新与 Shell state 保留 Workbench，不能为了消除某个函数名而复制或搬错权限逻辑。
- 19 条项目规则专属文案补迁到 `policy-en.ts`；此前各能力文案在对应 `*-en.ts`，聚合 catalog 只组合其公开导出。原 Workbench settings 不保留项目规则脚本/样式副本。共享词语、其他 owner 文案仍留原位置。
- root renderer 3,827 / server 3,353 行，剩余内容/绑定不因此清零。Execution/Decision、快速 Evidence 组合、共享项目设置/安装 Shell、最终 Catalog/Coordinator caller 由明确的后续 Goal 承担。已核对 canonical Cutover `goal-95f66d79-3e4f-4f38-8676-4354be495bb2`，其 Contract 覆盖旧路径/重复职责清零、最终文档与全量发布验收。未擅自重开 EX4，也未执行 Cutover revalidation。

## gw5-result

**通过。** 最终串行命令：

```sh
node --import tsx --test --test-concurrency=1 tests/goals-*.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts
```

**175 passed / 0 failed / 0 skipped，86.9 秒，7f949a exit 0**。完整原始日志 `/private/tmp/gw5-acceptance-regression.log`。浏览器使用临时项目/端口/Chrome profile，真实点击、输入、导航、reload 和 HTTP，断言持久化结果/无多余副作用；并非仅检查源码或模拟模板。测试集合覆盖上表全部结果及真实 Web 控制权限、Project 隔离、HTTP 错误/数据、Desktop/浏览器显示差异。

最近 targeted：Policy public + i18n **12/0/0**（3de35b）；新增项目规则 browser **1/0/0**（553b2d）；此前页面回归 172/0/0 和后续 Planning/Web 65/0/0 均为补充，不替代当前最终组。Plugin → Workbench → root TypeScript 构建、manifest、boundary、diff check 均通过。

迁移前后输出验证：

- full/refresh 16 份中英文 current/archive/trash/empty 完整输出严格逐字一致（e98ebe），baseline `.../T/gw5-page-compare-4eANTr`。
- 项目 Policy 的中英文 × desktop/browser × 有/无项目完整页面（含 inline script）和完整 settings stylesheet，在模板/资产迁移后严格逐字一致（a8eeac）。随后迁移 19 条翻译使内嵌 catalog 键顺序变化；只将该 JSON 的键排序、保留全部键和值后仍一致（27e5f6），没有忽略 UI 区块或改变文案。baseline `.../T/gw5-policy-page-lC49K5`，脚本 `/private/tmp/gw5-policy-page-compare.mjs`。

失败历史和行为修复完整保留在 `gw5-progress.md`：属性转义、首次草稿打开、面板/记录取消恢复、迟到响应不覆盖等均由实际失败场景驱动；没有靠放宽断言掩盖问题。此前未定位的草稿偶发失败不宣称已解释；最新整组该路径通过。最近文档焦点测试等待原有下一帧焦点，没有改产品语义。

## 不由本证据证明的整体终点

整个重组仍要完成 Draft Dialogue/Goal Tree Decision、迁移/恢复保证、DV4 和最终 Cutover；随后按用户要求做全产品前后端模拟用户 E2E → 代码清理 → 重复 E2E → 最初分包/边界/Huge Class/调用链/规范逐项审查。现用 4173、用户安装与项目事实未改；DV4 GUI 首启所需的暂停服务授权仍缺失。本 Goal 的通过不能替代这些任务。
