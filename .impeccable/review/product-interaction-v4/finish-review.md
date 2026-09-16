# Whole-product finish review

## 1. Disposition

fix

方向与主体结构成立；以下六项是本轮必须完成的修正，不需要重做视觉方向。

## 2. Scope and evidence validity

已读取 review-packet、总 spec、inventory、Frame 子 spec、craft-floor，打开全部 26 张指定截图（21 张 final、5 张 retained）以及用户提供的旧 Feed 反例。截图均呈现命名对象，没有错误加载或动画造成的空白。规划编辑、规则、诊断长页只证明当前可见部分；其动作栏另核对源码，不能宣称截图已证明长页底部布局。没有浏览器操作或产品代码修改。

核对了 Goal 表单、Feed overlays、Session renderer/styles、Artifact renderer、设置导航、规划编辑及规则 renderer。/private/tmp/molis-last-functional.log 确认 6/6；其余 Goal 日志只有包中点名的单项通过，文件本身仍含失败，不应称整套全绿。父任务补充已修复回收布局且最新功能测试覆盖；关系/指针/画布的专项证据分别使用包中已标记通过的项。

## 3. Material corrections and acceptance

### F1 — 全表单提交与取消尚未统一（P1，明确合同）

证据：final-goal-concern-1440-dark.png / final-goal-concern-390-dark.png 只有顶部“返回工作区”和底部“保存问题”；plugins/native/goals/src/event-document-forms.ts 的 report/type/requirement/progress/concern/decision/closure/resume/adopt/agreement/type-edit/note 均没有同栏取消。plugins/native/goals/src/policy-ui.ts:143、196 的 Goal/项目规则也只有保存。final-settings-rules-390-light.png 底部未入镜，源码确认缺口。

修正：这些有显式提交的编辑表单统一在末尾提供“取消 + 具体提交动作”，取消在左，主动作在右，相邻成组；说明和错误在组外。取消使用现有安全返回/退出语义，不调用提交、不写入领域状态；可保留顶部导航，但不能让它代替底部取消。规则页面的取消恢复已保存值/退出编辑，并清除本次修改原因。不要给即时保存的外观设置添加虚假的保存动作。

验收：逐一核对上述生成器；1440 与 390 的 Goal 问题表单、项目规则底部真实截图显示相邻操作；键盘顺序正确，取消不提交，保存失败仍保留输入，成功去向沿用原契约。已有规划编辑 footer 已正确配对，不重做。

### F2 — Feed 配置提交仍散在正文（P1，明确合同）

证据：final-feed-config-1440-dark.png；plugins/native/feed/src/ui.ts:395–399。任务资料“保存配置”在正文，整体退出在最底部；拉取计划还有一个独立保存，当前层级不能一眼看清哪些修改已保存。

修正：任务名称/地址/说明/范围的主要保存移动到弹窗底栏，与“取消”相邻。拉取计划可以保留明确标注的独立局部保存区域，但要在同一区域配“撤销修改/取消”，并明确仅保存计划；账号连接、立即拉取/暂停、移除继续属于独立局部动作，危险操作保持分离。保持现有 API 和部分失败恢复，不要求为视觉统一发明跨 API 原子事务。演示任务的禁用说明放到相关动作附近。

验收：真实来源修改名称后取消不写入；保存只保存声明的范围；计划修改/取消/保存各自可见且读回一致；失败不丢输入。配置桌面及 390 底栏不越界，两按钮同组；创建 Feed 已正确的底栏保持。

### F3 — Session 创建标题操作发生重叠（P1，可见可点性）

证据：final-session-create-1440-light.png 右上“关联已有 Session”穿过关闭按钮。plugins/native/work/src/ui/styles.ts:173 给 header 内所有 button 固定 32px 宽，215 的文字切换未覆盖该宽度；文字向右溢出至关闭区。

修正：32/44px 方形尺寸只作用于关闭图标；模式切换使用自然文字宽度，并在窄屏放到标题下独立一行。保留显式、独立的关闭触控区与创建/关联模式切换。

验收：同一 desktop 截图重拍；补 390 创建/关联模式确认文字不重叠、不截断，两操作均独立命中且键盘可达。

### F4 — Sessions 首次使用主按钮缺系统样式（P1，主要入口质量）

证据：final-sessions-1440-light.png 中“新建 Session”是浏览器灰色矩形，plus 独占上方；plugins/native/work/src/ui/render.ts:118 没有当前系统按钮类/对应作用域样式。

修正：接入既有主按钮样式，图标与文字单行居中，尺寸/圆角/hover/focus/disabled 与产品其他主动作一致；绑定现有创建入口。

验收：同一截图可见完成后的按钮；390 可点击且无溢出，触发的仍是同一 Session 创建流程。无需新造组件系统。

### F5 — 全局设置子页丢失返回项目（P1，真实导航回归）

证据：apps/workbench/src/settings-navigation.ts:74–89 的 child href 没有 project query；settingsContextHref 也忽略 _project。父任务实际观察 appearance?project=X → planning 后返回变成 /。final-settings-appearance-1440-light.png 和 planning 截图的“返回项目”外观不能掩盖此问题。

修正：将原项目上下文贯穿全局设置栏目、规划库/详情/编辑/取消和关闭/返回链接，并保留 desktop query；无项目上下文时继续合法返回目录。

验收：项目 X → 外观 → AI 工具 → 规划 → 新建/取消 → 诊断 → 返回/关闭，均回 X 且工作区持久状态不丢；从项目目录进入设置仍回目录。提供针对路径的行为证据，而非只验 query 字符串。

### F6 — Artifacts 零结果空态让用户执行不存在的选择（P1，首次使用闭环）

证据：final-artifacts-1440-light.png 左边“还没有 Artifact”，主区却“选择一个结果版本”；plugins/native/artifacts/src/browser-ui.ts:35–37 未区分 versions 为空。

修正：区分“还没有结果”“已有结果但未选择”“指定版本找不到”三态。零结果主区说明这里保存项目产出的结果版本，提供已有真实工作路径或清楚下一步；不要新增不能创建 Artifact 的虚假按钮。保留缺失精确版本提示及禁止自动换成最新版本。

验收：同一 empty 截图不再要求不存在的选择；有版本未选仍可选择；缺失版本仍保留准确恢复入口及引用语义。

## 4. Craft / quality-bar verdict

Coss 中性色、清楚目录、来源选择行、Goal 顶部真实信息、外层彩色标签与四方向菜单已经形成一致的 Operate 界面。Feed 新建已脱离用户拒绝的列表尾部裸表单，实际 1312 视口及 390 表单无重叠；关系详情已明确显示两端名称、归属方向和“已建立”，未把对象类型当状态。底部分屏证据成立。

未达完成线的核心是操作所有权和少数共享样式/导航缺口（F1–F6），不是需要添加装饰或重新发明布局。motion CSS 有按下/对话框/分屏反馈和 reduced-motion 分支；父任务提供 normal 0.18s / reduced 0.00001s 的实际读数。静态截图不能证明完整运动质量或原生触觉。

## 5. Retained, nonblocking, and limits

保留现有 Feed 阅读、Inbox 清空状态、市场、外观即时保存、项目危险区分隔、规划信息分层、Runtime/诊断的真实不可用原因和安装边界。Onboarding 的真实 01/04 步骤有信息意义。Goal 时间线的小型 Unicode 标记仍未完全采用共用图标，可记低优先级后续，不与此次明确可读性问题混淆。

本次不证明外部 OAuth、真实 Runtime 启动、原生菜单栏/触觉、全部设备运动流畅性，亦不把 inventory 的 retained 当成每个动态分支都已经截图验证。修复后一次构建、定向行为校验、同文件同视口重拍，并补上 F1/F2/F3 指定的窄屏及底部动作证据，交回对 F1–F6 逐项评分即可；不再扩展无关改造清单。
