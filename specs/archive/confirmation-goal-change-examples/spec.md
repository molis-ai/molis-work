# Goal 变化确认卡短例子

## 背景与目标

决定中心已经会说明各选项的一般后果，但目标说明、Goal Tree 方案和新发现工作仍需要用户自己把抽象描述套回当前 Goal。用户应当无需展开详情，就能从真实名称和真实关系看懂确认或拒绝后会发生什么。

## 当前行为和问题证据

- `renderContractProposal` 只说明“成为正式依据”和“草稿保持不变”，没有明确当前 Goal 是被更新还是新建，也没有把下一工作阶段放进当前场景。
- `renderGoalTreeProposalDecision` 的具体 Goal、关系和拆解状态主要位于折叠的变化列表中；默认区只说明整份方案会生效或不生效。
- `renderCandidateDecision` 会显示新 Goal 名称，但没有明确它不会自动归入来源 Goal，也不会自动开始执行。
- 三类卡片缺少统一、默认可见、可扫描的当前场景例子。

## 范围

- 为 Contract Proposal、Goal Tree Proposal、Candidate 三类决定卡生成默认可见的当前场景短例子。
- 例子使用当前或拟议 Goal 的真实名称；Goal Tree 例子在有真实关系时说明关系两端和归属。
- 例子同时说明确认后的变化和拒绝后的不变，并说明是否会立即执行。
- 补齐中英文文案、结构测试和窄屏样式。

## 非目标

- 不改变决定 API、持久化结构、审批门禁或状态计算。
- 不修改风险、关系调整和结果确认卡。
- 不替用户推荐接受或拒绝。
- 不把完整方案明细全部搬到默认区。

## 用户场景

1. 用户查看目标说明提案时，能看出是更新现有 Goal，而不是创建另一条 Goal。
2. 用户查看 Goal Tree 方案时，能从一个真实目标或关系例子理解采用后树会怎样变化。
3. 用户查看 Candidate 时，能看出会新增独立 Goal，但不会自动归属或自动执行。

## 方案与关键决策

- 增加统一的 `decision-scenario` 展示组件，标题使用“放到当前方案里看”，正文只保留确认结果和拒绝结果两条。
- Contract 例子根据标题是否变化生成“更新名称”或“采用新说明”，并依据拟议 Contract 推导用户可理解的下一阶段。
- Goal Tree 例子优先选择一条真实 Goal 变化，再补一条真实关系；没有关系时明确本次不改变归属。执行阶段只从拟议 Goal 的已确认状态推导，不创造新状态。
- Candidate 例子明确“新增独立 Goal”；关系变化仍留给独立 Rewire 决定。

## 输入、输出与依赖

- 输入：当前 Goal、Contract Proposal、Goal Tree Proposal 条目、Candidate、现有 Goal 关系和本地化函数。
- 输出：三类默认可见短例子及其响应式样式。
- 依赖：现有决定中心渲染、`MolisWorkWebView` 和 i18n 字典。

## 文件边界

- `src/web/render.ts`：生成并渲染三类场景例子，增加局部样式。
- `src/web/i18n.ts`：补齐英文翻译。
- `tests/web.test.ts`：验证三类例子默认可见且引用真实内容。
- `tests/i18n.test.ts`：沿用现有完整性检查。

## 验收标准

- Contract、Goal Tree、Candidate 三类卡片无需展开即可看到“放到当前方案里看”。
- 每类例子至少引用一个真实 Goal 名称。
- Contract 例子区分更新现有 Goal 与新建 Goal，并说明拒绝后草稿不变。
- Goal Tree 例子说明真实新增或修改、真实归属（若有）、下一阶段或不会自动执行，以及退回后 Goal Tree 不变。
- Candidate 例子说明会新建独立 Goal、不会自动建立归属或依赖、不会自动开始；拒绝后不创建。
- 390px 窄屏无横向溢出，语义顺序与桌面一致。

## 验证

- `pnpm test -- --test-name-pattern='Goal Tree|Candidate|Contract Proposal|readable Contract Proposal' tests/web.test.ts`
- `pnpm test -- tests/i18n.test.ts`
- `pnpm test`
- 浏览器检查决定中心桌面宽度和 390px 窄屏。

## 假设与开放问题

- 例子是现有事实的只读派生，不需要新数据库字段。
- 当前 Goal Tree 提案可能没有关系条目；此时例子明确“本次不改变归属”，不虚构父子关系。
- 本 Work Item 没有需要用户另行选择的开放问题。
