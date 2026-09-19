# Sessions 详情改成续跑舱

状态：功能可用切片已落地。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

## 背景目标

Sessions 详情仍是旧 Goal 文档页（英雄区、执行卡片、底部两块上下文），被塞进标签工作区。打开一条 Session 应先回答：这是哪次执行、绑了哪个 Goal、现在能不能续、不能的话下一步是什么。时间线是证据，不是默认主角。

## 当前行为与问题证据

- 详情用 `goal-document` / `goal-hero`，舞台有 980px 居中和卡片阴影。
- 「执行内容」在不可读时仍出搜索和事件筛选，中间是锁图标空状态。
- 已确认关系折在底部 disclosure，两张卡片带大 `min-height`。
- 「加载原 Session」和「创建 Handoff」并排抢主按钮；不可读时主按钮是禁用的加载。

## 范围与非目标

做：Sessions 舞台详情的信息架构、主操作规则、关系轨和不可读/已加载两态。左栏列表、新建/关联/Handoff/归档弹层语义不变。

不做：不改 Session 身份、Adapter 能力、Handoff 确认、归档不删原生内容。不猜不可读正文。不重绘时间线事件视觉。不换 Linear × coss 视觉世界。

## 使用场景

1. 打开一条不可读、已归档、已绑 Goal 的 Codex Session：名称是 Goal 标题；主按钮是「创建 Handoff」；没有搜索条；右侧（或窄面板覆盖层）是紧凑关系事实。
2. 打开一条可读且已有执行记录的 Session：主列自动读入时间线后出现搜索和分段筛选；身份条和关系仍在；长内容在主列内滚。
3. 没有当前 Goal：主按钮是「选择当前 Goal」，打开现有关系弹层；Handoff 不作为可用主操作。
4. 面板窄于 720px：关系轨改为覆盖层，身份条提供「关系」。

## 方案与关键决策

- 贴齐标签页纸面，去掉 Goal 文档英雄和卡片。
- 一个主按钮：可原生 resume → 加载原 Session；否则已有当前 Goal → 创建 Handoff；否则 → 选择当前 Goal。可 resume 且可 Handoff 时，Handoff 作为次按钮，不与主按钮同级抢。
- 归档/恢复、禁用的另一续跑动作、管理关系进更多菜单。身份与能力放关系轨底部 disclosure。
- 不可读不自动请求内容 API，主列只说明能力边界。可读仍在选中后按需读取；有事件后才显示搜索和筛选。
- 事件筛选用现有 `mw-toggle-group`，不再用「全部事件」下拉撑阅读器头。

## 输入输出与依赖

输入：现有 `ProjectSessionRecord`（contentMode、resumeMode、currentGoal、state）。输出：同一套 resume / content / associations / archive / handoff 接口。依赖：工作台标签舱、目录选中、现有 Work 弹层。

## 文件 / 模块边界

- `plugins/native/work/src/ui/render.ts`：详情 DOM。
- `plugins/native/work/src/ui/styles.ts`、`apps/workbench/src/styles/detail-reading.ts`、`tab-workspace.ts`、`linear-density.ts`：舞台布局。
- `plugins/native/work/src/ui/content-client.ts`：筛选、工具条显隐、不可读跳过自动读取、关系轨覆盖。
- `plugins/native/work/src/ui/en.ts`：新文案。
- `tests/work-session-ui.test.ts`、`tests/session-web.test.ts`、`tests/long-content-viewport.e2e.test.ts`。

## 验收标准

1. 不可读详情没有搜索/事件筛选，主按钮不是禁用的「加载原 Session」。**通过**（单元 + 浏览器：归档 Codex 主按钮「创建 Handoff」，工具条缺失）。
2. 已绑 Goal 且不能 resume 时，主按钮是「创建 Handoff」；无 Goal 时主按钮是「选择当前 Goal」。**通过**（单元 + 浏览器：无 Goal 的 Claude Code 主按钮打开现有关系弹层）。
3. 名称优先当前 Goal 标题，Runtime 只作为事实，不当大标题。**通过**。
4. 桌面宽面板关系轨可见、无卡片最小高度；窄面板经「关系」打开覆盖层后可点「管理关系」。**通过**（1024 关系轨 280px；390 e2e；轨内「管理关系」打开原弹层）。
5. 可读并加载到事件后，搜索和筛选出现，时间线在 `.session-content-body` 内滚动，外壳不滚出视口。**通过**（long-content e2e 含 1024 分屏 iframe）。真实 Codex Session 自动读失败时工具条保持隐藏，符合「有事件才出搜索」。
6. 新建、关系、Handoff、归档弹层仍可用。**通过**（关系弹层浏览器点开；其余覆盖层 HTML 未改）。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-work --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/work-session-ui.test.ts tests/session-web.test.ts tests/session-directory.test.ts tests/long-content-viewport.e2e.test.ts tests/coss-control-language.test.ts
```

浏览器打开项目 Sessions：不可读归档一条、可读有记录一条，核对主按钮、关系轨和加载后的搜索条。

## 假设与开放问题

- 关系轨覆盖阈值用容器 720px，让 1024 宽且目录打开时仍能并排显示关系。
- 可读 Session 保持选中后自动读取，不改成必须再点「读取内容」。
