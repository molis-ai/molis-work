# 全局 UI 与交互动线规整

## 背景、目标与完成等级
用户要求系统优化全局组件、审美、交互与动线，并端到端检查。目标为本次覆盖主链的「内部完整」：共享控件可读可操作，创建/记录/返回/设置路径真实可用，提交失败可恢复，窄屏可访问。不得据此宣称所有插件的外部服务或桌面原生集成已验收。

## 保留、替换、忽略
- 保留：现有 Linear × Coss 的中性紧凑界面、HTML Slot 技术栈、项目与插件边界、Frame/工作区/分屏模型、中文产品事实。
- 替换：覆盖共享控件的旧业务样式、丢失焦点与标签的增强行为、异步操作的可变提交目标、经复现的导航断点。
- 忽略：无证据的历史重构方向；不迁移框架、不另建主题、不重写所有插件、不更改业务授权和完成语义。

## 当前行为与证据
1. 共享 select 增强器隐藏原 select，但没迁移包装 label、校验 focus 与完整状态；生产关系表单校验仍 focus 隐藏 select。
2. 真实浏览器中 Feed → 添加任务 → RSS / Atom，拉取频率触发器计算字号为 9px、高 28px，与相邻表单明显不一致；菜单同样受旧 button 样式污染。
3. Goal 回收站请求完成后继续读取全局 trashIntent；等待期间取消使它为空，或另开 B 使 A 的响应导航到 B。只读审查已通过生产脚本延迟响应复现。
4. Feed 展开正文同时被通用 workspace 和 detail 的 overflow:hidden 裁切；Artifact 的专属滚动约束需要限定到其表面。
5. Feed 创建成功后保留 createdSourceId、旧草稿和禁用按钮，刷新也未重新选中来源；同页二次创建受阻。成功后重置，部分失败时保留以便重试。
6. 全局搜索缺少触屏可用的关闭按钮、输入框与当前结果的 ARIA 关联；补齐关闭返回与键盘当前项。
7. 基线端到端回归暴露 Feed/记录导航等待和旧目录假设失败；需先确认源码构建与现行用户路径，区分过期断言和真实缺陷。
8. 窄屏设置选择分类后抽屉仍覆盖正文。分类选择后收起目录；切回已缓存分类时取消旧请求的显示资格，防止较慢响应覆盖用户最后选择。

## 使用场景与验收
- 共享选择：鼠标、键盘开关、选择、Escape、Tab、校验回焦；标签/说明/禁用项正确，动态变更与表单 reset 保持原值和显示一致，菜单在可视范围内。
- 目标：创建→落到新目标→进入工作区→记录→查看结果→返回；回收站/恢复提交期间一次请求、稳定目标，失败保留原因可重试。
- Feed/Inbox：添加来源的校验、成功落点、失败重试；阅读、返回、搜索清除与处理结果一致。
- 设置/导航：项目设置与全局设置能到达并返回；菜单/弹窗有清楚标题、操作层级与焦点，长内容内部滚动。
- 视觉：代表性页面在浅深色、1440/1024/390 宽度与低高度下检查；共享字段、菜单、按钮遵守现有 token 与密度，不横向溢出、遮挡或缩成难读小字。

## 模块边界与执行
- Design System：`select-menu-client.ts` 拥有 select 的 DOM 增强、菜单键盘和状态；共享 CSS/Catalog 拥有控件视觉与标本。
- Workbench：CSS/浏览器装配/导航负责消费共享控件及页面切换。
- Goals Plugin：`dialogs-client.ts` 及直属绑定负责提交生命周期；保持 API 不变。
- Tests：复用生产浏览器 fixture，延迟/失败响应模拟真实时序，断言请求、持久化和后续可观察状态。过期导航断言只能改为等待真实用户结果，不降低业务约束。
- 主 agent 串行维护本 spec 与跨模块改动；可派一个 writer 到独立 select 文件和独立测试，其他审查只读。

## 依赖、验证与假设
Node 24、现有 workspace dist、Chrome；隔离 Home `/tmp/molis-ui-system-20260923`，预览端口 4182。现有用户数据、服务及未提交改动均不重置。
先编译当前源码；定向执行 primitives、Goals dialogs、product interaction、project journey、settings viewport 与 tab workspace 测试；补充共享选择及提交时序回归。真实浏览器完成一轮发现、一轮修复确认，发现明确失败允许定向修复。
验证命令：`pnpm build`；`node --import tsx --test --test-concurrency=1 <受影响测试>`。构建/现有测试受其他未完成改动影响时记录事实，不掩盖或顺手扩大后端范围。

## 发现后补充的行为决策
Feed 配置保存成功关闭编辑弹窗并显示确认；失败保留表单。Inbox 处理后若从待处理移到历史，收起原详情并返回列表，不继续停在已离开的待处理事项上。Feed 正文由当前条目的内部阅读面滚动，返回入口保留。
Feed 配置提交期间锁住取消、Escape 与切换，完成后解锁，防止旧保存响应关闭新编辑页并清空其草稿。

## 验收结果
2026-09-23：本次覆盖主链达到「内部完整」；工程检查与隔离 Home 中的真实浏览器路径通过，一骏本人体验验收尚未进行。

- 构建：`pnpm build` 通过；末轮修改后 Design System、Goals 与 Workbench 的 TypeScript 增量编译通过。全构建日志 `/tmp/molis-ui-build-20260923.log`。
- 共享控件：标签/说明、校验回焦、动态值与禁用状态、分组禁用、键盘选择、Escape/Tab、表单重置、滚动/缩放定位通过。Feed 撤销修改同时验证真实 select 值和可见文字。
- 主链与异常：1440 和 390 宽度完成创建 Goal→记录→Feed 创建→阅读→送入 Inbox→处理返回；Feed 同页连续两次创建、部分失败重试不重复、保存反馈及延迟响应期间取消/重复提交保护通过。Goal 回收站/恢复验证服务端持久化、稳定目标和事件记录。
- 设置与导航：窄屏分类选择后抽屉收起、迟到设置响应不覆盖最后选择；1024×400 / 390×500 的设置表单滚动、取消、校验失败、保存失败重试与提交中状态通过。标签新增与分屏保留通过。
- 外观实操：浅深色代表页面、桌面 Feed/Goals/搜索、窄屏设置与 RSS 创建检查完成；390 窄屏 RSS 触发器 44px/16px，菜单项 44px/14px，无横向溢出。预览恢复跟随系统主题，浏览器临时尺寸已清除。
- 最终自动验证合计 **37/37 通过，无失败或跳过**。执行：`node --import tsx --test --test-concurrency=1 tests/global-ui-interaction.e2e.test.ts tests/product-interaction.e2e.test.ts tests/select-menu-interaction.e2e.test.ts tests/primitives.test.ts tests/goals-dialogs.e2e.test.ts tests/goals-narrow-navigation.e2e.test.ts tests/project-user-journey.e2e.test.ts tests/settings-viewport.e2e.test.ts`（36 项），以及 `node --import tsx --test tests/workbench-tab-workspace.e2e.test.ts`（1 项）。日志 `/tmp/molis-ui-final-20260923.log`、`/tmp/molis-ui-tabs-final-20260923.log`。`git diff --check` 通过。
- 只读复核发现的配置响应误关弹窗和重置显示不一致均已修复并覆盖；复核无剩余 Blocker/P1。

边界：没有验证所有插件的外部账号、真实 Runtime 执行或桌面原生集成，不能据此宣称整款产品已可发布。测试使用独立项目数据；用户已有工作树改动保留，没有提交或发布。

可交互预览：`http://127.0.0.1:4182/projects/project-64f33c54-e174-42fd-8391-131c03f068e2/`。

## 第二轮跨页面检查（用户追加）
继续覆盖 Sessions/Handoff、Schedule、Shelf、Images、灵光、工作规划表单和全局滚动/返回。保持原完成标准与现有视觉方向；检查中定位的问题直接修复。

已确认需要修复：Shelf 输入后 400ms 内返回未 flush，最后输入丢失；保存失败没有可见恢复提示。返回需等待最后保存，失败保留编辑器和草稿，延迟保存绑定原材料 ID。Schedule 创建中仅禁用提交按钮，取消/Escape 可重开新草稿并被旧响应清空，需统一提交生命周期保护。Images 加载图片失败后，刷新同一记录被结果缓存跳过，需允许真正重新加载已保存图片且不重复调用生成服务。

新增定向回归覆盖以上失败、恢复及持久化；额外扫描发现的规划表单与旧滚动断言先核对现行实现，不凭测试失败盲改产品行为。
确认额外两处布局问题：工作规划编辑器增加了一层滚动 wrapper，但布局规则仍匹配旧结构，保存按钮掉出窗口；桌面 Goal 列表展开详情时，列表工具栏超过左栏宽度，遮住返回按钮。修复相应 owner 的布局约束，保留低高度表单固定操作区与返回按钮真实可点击的验收。
实操发现 Characters 现有项目无法打开：新增路由后 Manifest 仍为 1.0.0，触发同版本不同定义冲突。沿用 Host 已有的 replace_version 升级路径，仅将该 Manifest 递增到 1.1.0；验证从旧登记升级后页面可打开，个人草稿不变，不放宽定义一致性校验。

汇总回归暴露减少动态效果模式下的信息栏展开不稳定：已展开的 DOM 状态与 32px 收起宽度短暂不一致。捕获确认不是元素替换或错误选择器；全局 `transition-duration: .01ms` 意外给原本没有过渡的所有元素启用了默认 `transition-property: all`，使布局尺寸也延迟变化。该模式改为真正零时长、零延迟过渡，保留现有 animation 的短时结束语义；验证切换后立即计算的正文几何与状态一致，不放宽真实点击断言。

### 第二轮验收结果
2026-09-23：本轮覆盖的 UI 主链达到「内部完整」，修复以上七类问题。受影响的 Shelf、Schedule、Images、Characters、Workbench、Local Host 与 Design System TypeScript 编译通过。没有重置同时进行的其他开发改动。

- **最终 44/44 通过，无失败或跳过**：跨插件与布局 19 项、共享控件与提交恢复 25 项。
- 19 项命令：`MOLIS_CONTENT_CAPTURE=/tmp/molis-ui-round2-captures node --import tsx --test --test-concurrency=1 tests/cross-plugin-recovery.e2e.test.ts tests/images-plugin.e2e.test.ts tests/shelf-plugin.e2e.test.ts tests/lingguang-plugin.e2e.test.ts tests/remaining-forms-viewport.e2e.test.ts tests/continuous-surfaces.e2e.test.ts tests/chrome-inner-scroll.e2e.test.ts tests/goals-narrow-navigation.e2e.test.ts`。日志 `/tmp/molis-ui-round2-final-v2.log`。
- 25 项命令：`node --import tsx --test --test-concurrency=1 tests/select-menu-interaction.e2e.test.ts tests/primitives.test.ts tests/goals-dialogs.e2e.test.ts tests/global-ui-interaction.e2e.test.ts`。日志 `/tmp/molis-ui-round2-shared-final.log`。
- Shelf 验证输入后立即返回的持久化结果、失败保留草稿及重试，另一材料未改；Schedule 验证失败重试、待提交时取消/Escape/重复提交保护、成功仅创建一次及下次新建空表单；Images 阻断已存图片加载后，解除阻断并刷新可重新显示，生成服务调用数不增加。
- Characters 从旧版本登记与已有个人草稿升级，实际页面可打开，授权身份、安装时间与草稿保留。灵光记下/刷新/编辑/移除和 Shelf PDF 提取既有回归通过。
- 1440×900、1024×400、390×640 检查工作区布局；规划表单覆盖全局/项目两处及 1024×400、390×500。列表工具栏改为按实际内容撑开的网格行，返回按钮不被遮挡；关系创建/失败恢复/停用取消通过。
- 减少动态效果回归先证明旧规则失败（展开后正文仍为 31px），改动后即时展开/收起与原关系编辑点击均通过。日志 `/tmp/molis-ui-reduced-motion-before.log`、`/tmp/molis-ui-reduced-motion-after.log`；未修改点击 fixture 或放宽遮挡断言。
- 浏览器实操补查 Sessions/Handoff、Schedule、Shelf、Pages、Forms、Dataset、PPT、Functions、Characters、Artifacts、实验、Images、Jelly、Coding 的可见入口、列表/空态及相关返回；其中 Handoff 仅创建隔离演示草稿后取消，未发送到 Runtime。规划低高度失败态截图已检查，预览恢复跟随系统主题与默认尺寸。
- 只读复核无剩余 Blocker/P1；`git diff --check` 通过。预览仍为上述 4182 隔离示例项目，已更新到本轮最终代码。

验证边界仍与第一轮一致：本轮不是所有插件外部服务和桌面原生集成的完整功能验收，也未代替一骏本人体验验收。无提交或发布。
