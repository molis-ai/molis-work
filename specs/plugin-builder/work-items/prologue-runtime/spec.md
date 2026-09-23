# 插件创作工作台：Prologue 正式接入

2026-09-23；执行依据：用户明确要求按插件规范实现，runtime 使用 Prologue。继承 ../../spec.md 的产品目标与已批准 V3 视觉。目标完成等级：功能可用；真实模型、重启与主流程验证后才能提升为内部完整。

## 当前证据与边界
现有 ui/ 仅浏览器演示。正式 Host 已有 AgentHost 的 Prologue capability、PluginDefinition/Manifest v2、PluginPlatform、SQLite private storage（旧 design.md 对空存储的描述已过时）。复用这些接口；不让插件持有 runtime、密钥或裸路径，不修改其他插件业务。工作区已有其他任务未提交内容，保留。

## 本轮完整路径
用户进入项目的插件创作工作台，选择已授权工作区和配置模型，输入需求。Prologue 的设计角色生成澄清问题或 2–3 个含字段、旅程、验收的候选；选择后 UI 角色和功能角色以同一主线构建。UI 使用受控零件（标题、表单、搜索、筛选、集合、操作、统计），每个合法结果逐步保存并渲染。Jev 在合法候选中选择集合表现，未配置时明确允许用户人工选择，绝不伪称已调用。功能角色生成通用数据字段和派生计算，后端验证后接通保存、编辑、搜索、筛选、批量 CSV 导出、CSV 导入和汇总。用户可暂停、继续、撤销、局部换布局、修改零件标签与顺序、补充需求重建；晚到旧结果不能覆盖新修订。

正式插件由同一规格解释器生成独立 Manifest/PluginDefinition，PluginRuntime 真正启动，独立 URL 可直接打开；按安装身份保存数据，草稿试用与正式数据分离。再次编辑沿用插件身份、发布新版本，兼容检查拒绝删除/更改已使用字段类型或新增必填无默认值的字段；启用前经生成插件自身的授权存储校验已有正式记录是否能按新规则计算，失败保留原版本。可切回兼容旧定义，数据不回滚。

首轮支持本地数据工具与受控表达式行为：字段引用、常量、加减乘除、连接、条件、比较及聚合。第二场景用 CSV 数字数据及模型生成的计算验证非素材模板。生成任意 JavaScript、外部账号、市场分发和多人共创仍属主 spec 已列的后续范围，不以本轮完成宣称任意插件生成。

## 模块与契约
- plugins/native/plugin-builder：model.ts / validation.ts / store.ts / records.ts 拥有受控规格、修订、发布、记录与计算；workflow.ts / roles.ts / routes.ts 拥有 Prologue 工作流；ui.ts / client.ts / styles.ts 拥有批准布局；generated.ts 适配独立插件。
- apps/local-host：builder surface 只装配 PluginPlatform、已授权能力、Jev 选择和已发布插件；Workbench catalog/registration 只登记贡献。
- 公共调用沿用 contracts/platform/plugin 与 services/agent-host，不创建第二 runtime 或模型直连接口。
- 所有模型/HTTP 输入验证；渲染转义，不执行模型 HTML/JS。private storage compareAndSet 拒绝并发覆盖。运行引用真实保留，异常显示具体可恢复动作。

## 验收与验证
1. Manifest/路由/能力声明有效，入口能打开；仅使用 prologue runtime。
2. 需求→澄清/候选→选择→真实 UI/功能工作→试用→独立发布可执行；待连接不伪造成功。
3. 测试旧 revision、停止后晚到结果、失效规格、数据校验、CSV、计算与发布兼容；使用真实生产类与 SQLite 存储。
4. 独立插件经 PluginPlatform 启停，重启后版本/数据保留；新草稿不改使用版本；实例间数据隔离。
5. pnpm workspace:check / boundary:check、受影响包 typecheck/build、定向测试与浏览器桌面/窄屏主流程；全仓失败区分已有错误与本轮错误。
6. 真实 Prologue/Jev 使用现有配置验证；无配置或外部错误如实标未验证，不用测试替身冒充真实模型。最终用户审美与手感验收保留未验证。


## 实现与验证记录 · 2026-09-23

已实现上述本地闭环。三个角色通过 AgentHost 启动 `prologue`，工作区/模型来自现有授权配置。UI 装配状态、运行引用和模型选择持久保存；停止/暂停与晚到结果有回归，重启能继续未完成的节点装配。界面零件可改标签和顺序并撤销，集合可在卡片/列表/表格间替换。发布设计版本是固定解释器 1.0.0 的应用数据，保留稳定安装 ID；运行时不热替换任意代码。发布与切换前先异步取得正式插件的同步校验器，再同一调用栈校验正式记录并激活，防止保存插进预检和激活之间。

工程证据：

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @molis-ai/molis-work-plugin-builder build` | PASS |
| `pnpm --filter @molis-ai/molis-work-app-workbench build` | PASS |
| `pnpm workspace:check` / `pnpm boundary:check` | PASS，当前 66 个包，无边界错误 |
| `pnpm exec tsx --test tests/plugin-builder-domain.test.ts tests/plugin-builder-workflow.test.ts tests/plugin-builder-runtime.test.ts tests/plugin-builder-publication.test.ts` | PASS，22 项；真实 SQLite CAS 交错、角色调度/迟到结果、Runtime 安装与撤权、重启、计算、CSV、隔离及版本兼容 |
| `pnpm exec tsx --test tests/plugin-builder-browser.e2e.test.ts` | PASS，Chrome 1440×1000 / 390×844；真实 HTTP guard、PluginPlatform、SQLite |
| `pnpm --filter @molis-ai/molis-work-app-local-host build` / `typecheck` | PASS；视觉纠偏收尾时重跑通过，之前并行任务导致的 Cognia 构建阻塞已消失 |
| `pnpm exec tsc --noEmit -p tsconfig.json` / 本轮全部测试文件严格类型检查 | PASS；不能替代上行完整 Local Host 构建 |
| 真实 Prologue/Jev 联调 | UNVERIFIED：本机模型配置为空，MINIMAX_API_KEY/TYPESAFE_API_KEY 未配置；没有使用其他账号或测试结果冒充真实模型 |

浏览器测试中的模型响应为明确标记的 fixture；它证明真实 UI、HTTP、数据和安装行为，不证明模型输出质量。覆盖一句需求→两候选→逐节点装配（保持输入、焦点和光标）→预览保存/计算→发布→独立页初始无预览数据→正式保存→刷新保留→真实 CSV 下载（单 BOM）→草稿改布局不影响使用版本→发布 v2 后保留正式记录。移动端关闭对话、试用与插件库可点击，无文档级横向溢出；表格内部允许横向滚动。原生 select 一步采用 DOM value/change 触发真实 handler，其他交互使用真实鼠标键盘。

实际截图：[桌面](screenshots/desktop.png)、[窄屏](screenshots/mobile.png)、[独立插件 v2](screenshots/mobile-installed.png)。由测试临时项目生成，页面明确显示 Fixture 模型；没有写入用户正式插件数据。

未完成项：真实模型候选质量/Jev 质量与延迟、100 组件 P95≤200ms 指标、中文 IME/用户手感及本人验收。上位 P4 的多页面/多状态编辑、任意自定义代码和远程分发未在本轮实现；不把本地受控数据插件宣称为任意插件生成平台。源码入口已登记在 Workbench；纠偏收尾时完整宿主构建已通过。


## 用户纠偏后的视觉与交互重做 · 2026-09-23

用户明确指出配色、交互、动效和整体实现与批准示例差距过大。前轮工程通过不等于视觉验收，通过截图所宣称的体验完成度撤回；以 `../../ui/design/approved-comp.png` 和实际 V3 为唯一视觉基准。

保留 Prologue、版本校验、SQLite、正式/预览隔离与测试。替换简化的通用表单外壳：固定26%对话栏、白画布/暖灰地面、连续需求与设计依据、确认后仍可见的三候选缩略图、主线卡片、底部紧凑输入、配置抽屉、构建/试用分段、图片卡片内容、悬浮零件条、组件选择框与检查器、真实事件驱动的蓝绿指针和局部连接反馈。用户操作控件不触发组件检查；节点刷新保留输入/焦点/滚动；reduced-motion保持完整信息。

为通用图文工具添加可选字段表现绑定，不把灵感库硬编码成唯一产物。内置灵感库示例仅由用户主动创建，明确示例内容并复用批准稿原始图片；不冒充模型运行、真实素材来源或正式数据。示例装配回放与实时Prologue构建标记分开。

验证以批准稿同尺寸1586×992同场景优先，并测390×844；包含新建/配置/候选选择/构建/暂停恢复/试用录入/搜索筛选/卡片列表表格/选中检查/CSV/发布/独立页/版本保持。保留原库存场景数据能力回归。提供同场景画面对照与真实交互证据，由独立视觉评审检查，不能再拿普通库存表的工程截图充当批准图的视觉验收。


纠偏工程与实操证据：插件、Workbench、Host 构建及 Host 类型检查通过；workspace/boundary 为66个包无错误。领域/工作流/安装/发布/表现绑定共26项通过；新增表现绑定与示例持久化4项在最终修改后复验通过。两套 Chrome 浏览器流程通过，原库存路径保留真实计算、逐节点输入焦点/光标、CSV与版本隔离；灵感库路径实操搜索/标签、录入抽屉、编辑、刷新、选中导出、发布空正式实例、手机对话/设置/保存。新回归确认图标实际绘制、缩略图尺寸、刚打开示例即可发布、卡片在390px单列可读、真实图片不被示例图层遮盖。零件仅在相邻同区域内移动，画布 DOM 跟随实际规格顺序并在刷新后保留；日常构建轮询不重新移动已有表单节点。

同场景截图位于 `.impeccable/review/plugin-builder-fidelity/{desktop,building,mobile}.png`；desktop/building为1586×992，mobile为390×844。三图均为原始四条预览记录；building是明确标注的已保存示例回放。图片复用原V3 atlas，来源sidecar随发布资产保留，provenance scan为1个raster/0缺失。独立视觉复核结论为 `ship`，范围仅限本次被列出的修复项。首屏密度、卡片/零件池高亮和事件驱动装配顺序均已判定 resolved；随后修正入场位移造成的蓝框终态偏移，复核同样 resolved，无遗留项。当前证据仍不替代真实Prologue质量和用户本人验收。

最终浏览器几何验证：1586×992 下湖景卡底部864.1px，零件条顶部887px，卡片底部hit-test无遮盖；左栏两条Agent状态及回放控件均在composer前。蓝框四边外扩均为5px。动效开启时先保留目标占位（inert/aria-busy），650ms指针抵达后显示真实组件；出现仅渐显/消除轻微模糊，避免几何测量跟随位移残留。reduced-motion直接到达最终状态。终态截图等待卡片、蓝框、指针动画全部结束；当前全路径视觉测试7.96s通过，库存路径9.95s通过。专用Impeccable自定义agent类型未提供，本轮由新的独立只读子代理按同一合同完成视觉复核，文档在插件目录独立记录。

