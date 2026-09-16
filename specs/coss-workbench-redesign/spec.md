# Coss 风格的全界面重设计

## 背景与目标
功能迭代后，工作台标签、目录、内容工具栏、设置和弹层的空间与控件语言脱节。本次直接改造现有产品，目标为等级 3「功能可用」：真实页面和交互接通，完成浏览器验证；不以此宣称原生安装包已验收。

## 证据
- 标签条仅 32px，组名旁是贯穿高度的色线，选中使用下划线；组、母标签、内容标签区分不足。
- 目录树在窄目录中同时挤入长标题、层级缩进和带框状态，主信息被截断。
- 整体配色由多代样式覆盖，设置与工作台各自定义色值。
- Goal 框有 64px 标题栏、工作方式栏及终端栏，正文空间受挤压。
- 已有未提交的 workbench-chrome-cleanup 改动作为工作基线保留。

## 范围与场景
用户已明确授权改变目录、设置页与操作路径。范围包括共享视觉基础、工作台外壳、分组标签、目录、画布/看板与 Goal 内容、Feed/Inbox/资料/Session 内容的共享控件、项目/全局设置、项目选择及引导。以 Coss 的中性表面、细边界、紧凑控件和清晰层次为方向。

用户补充：关键页面与交互均可重做，现有样式和布局不是约束；保留的是有价值的功能和数据关系，结构以定位、阅读、操作是否更直接为验收依据。

场景：打开项目定位入口；打开多条 Goal 并切换/关闭/折叠分组；拆栏后继续工作；切换画布与看板；阅读信息与时间线；进入设置并返回；浅/深色及窄屏操作。

## 方案与取舍
- 保留领域事实、插件所有权、真实功能、原生拖动区、分栏与状态恢复；替换视觉表达与导航层次。无需迁移到 React 或添加 UI 框架。
- 统一中性灰表面与状态色、8px 控件圆角、12px 内容表面、间距和短时反馈。主操作有明确重量；语义颜色用于状态。
- 主标签条采用 44px 工作栏、32px 标签。组用小点和展开箭头标记，选中是清晰的浮起表面，长标题保留 tooltip，关闭保留稳定占位。方向键/Home/End 移动并选中，Delete 关闭，操作后保持合理焦点。
- 目录增加标题可用空间，目的地和内容目录分层；状态保持可读。设置内容用可读列宽、稳定标题与连续分区，窄屏表单竖排。
- 动效说明状态变化，避免内容反复淡入。支持 reduced motion、可见焦点及触摸目标。
- 项目名占据目录主要宽度：搜索移到目录顶栏，移除无功能的通知占位。只有终端可用时不展示重复的「对话/终端」栏。目录宽度用户已保存的值继续有效，双击分隔线恢复新的 256/280px 默认值。
- 项目设置提供明确「返回工作台」：退出设置独占页面，恢复原先标签和分栏；无需重新找到先前 Goal。设置加载失败保留同页重试。
- 视觉验收收尾：看板按实际列数据显示数量和空列提示；紧凑时间线使用 16px 标题；项目常规设置补齐表单标签、输入和路径信息层级；Feed 明确页面标题并去掉无目录时误导的「项目首页」。窗口变窄时当前标签保持可见。

## 输入输出与模块边界
输入为现有 renderer DOM、tab-workspace 状态、插件内容和主题偏好；输出为新的 CSS、必要的语义 DOM 与本地导航行为。
允许修改 packages/design-system/src、apps/workbench/src 中 UI 所有者、plugins/native 中必要的 UI 样式与对应测试；设计记录 DESIGN.md 与 .impeccable/surfaces。禁止改变领域写入、MCP、凭据、用户真实数据或插件协议。

## 验收
1. 标签可分辨组与页面，选中、hover、focus、关闭、折叠、长标题可用；支持键盘与分栏。
2. 工作台目录、内容、设置、项目选择的色彩/控件/间距一致；主要内容不被重复工具栏挤占。
3. 桌面浅深色与 390px 窄屏无页面级横向溢出，窄屏目录与设置可操作。
4. 打开/切换/关闭标签、画布/看板、信息栏、设置返回保留真实行为与状态。
5. 定向构建、相关交互回归通过；视觉证据保存到 .impeccable/review，未验证的路径明确报告。

## 验证
pnpm --filter @molis-ai/molis-work-design-system build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test tests/tab-workspace-ops.test.ts tests/web.test.ts
浏览器在隔离 home /private/tmp/molis-coss-review 上完成主路径、键盘、响应式与主题检查。

## 假设与开放项
用户已指定 Coss 参考，直接走真实代码切片；不另开风格投票。不提交、不发布、不替换用户运行服务。原生 macOS 窗口及所有低频领域表单的人工穷举不属于浏览器证据。

## 构建前置修正
全仓构建发现 modules/feed/src/index.ts:542 的重复 inbox 判断：前面的 inbox 分支已提前返回，后面的相同判断不可达，TS2367 阻断 Feed、Host 和 Desktop 编译。允许仅删该不可达分支并展开原 else，不改变领域行为；用 Feed 定向测试验证。此项是更新真实预览所必需的机械修正，不扩展业务范围。

## 导航验收修正
真实浏览器刷新并恢复 INTERFACES 标签时，标题为 INTERFACES，`data-goal-view` 仍为项目根 Goal。根因是 tab-workspace 只调用 applySelection（更新标题和选中），没有调用现有 Goal 正文加载器。标签路径须按选中 ID 加载正文，复用已有取消过期请求和错误提示；只同步可见状态，不写领域数据。测试覆盖两条 Goal 切换、刷新恢复后的正文 ID 与标签相同。标签点击重绘后必须恢复 native trigger 焦点，保证鼠标选中后可直接用方向键。

## 最终验收记录（2026-09-15）
完成等级：3，功能可用。独立 Impeccable finish reviewer 返回 **ship**，范围为指定截图与本轮限定 diff，不代表原生发布验收。

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 标签分组、键盘、关闭、折叠、分栏 | 通过 | workbench-tab-workspace.e2e：鼠标点击后 ArrowLeft/End/Delete、焦点恢复、组折叠、Sessions 分栏及最后关闭回首页 |
| 共享外观与内容层级 | 通过 | 统一 token、10 张最终截图、独立视觉复核；共享控件覆盖其消费页面，低频表单未穷举 |
| 浅深色、1440/1024/390px | 通过 | Chrome 实际截图；390px 与1024px document.scrollWidth ≤ innerWidth；390px目录可展开/收起、当前标签缩放后可见 |
| 内容和导航状态 | 通过 | 两 Goal 正文切换与刷新恢复 ID 一致；设置返回原标签及焦点；画布/看板与视图恢复回归 |
| 构建及定向回归 | 通过 | pnpm build；最终导航修正后 workbench build；下述42项定向测试全部通过；git diff --check |
| 原生 macOS 安装包与全部低频领域表单 | 未运行 | 本轮为隔离浏览器预览，未发布/替换用户安装 |

最终定向命令：
`node --import tsx --test --test-concurrency=1 tests/workbench-tab-workspace.e2e.test.ts tests/goal-kanban.e2e.test.ts tests/project-settings-navigation.e2e.test.ts tests/goals-kanban-ui.test.ts tests/i18n.test.ts tests/tab-workspace-ops.test.ts tests/project-settings-stage.test.ts tests/project-settings-accordion.test.ts tests/feed.test.ts tests/feed-native-plugin.test.ts`

结果：42/42，0 skip。日志 `/private/tmp/molis-coss-regression.log`；全仓构建 `/private/tmp/molis-coss-build.log`。此前 web 与 tab-ops 31项检查通过。设计 detector 仅运行一次，结果 []，保存 `/private/tmp/molis-coss-detect.json`。

最终图：`.impeccable/review/coss-{workspace-1440-light,workspace-1440-dark,workspace-390-light,directory-390-light,project-settings-390-light,project-settings-1024-dark,settings-1440-dark,settings-390-light,kanban-1440-dark,feed-1440-dark}.png`。

独立复核非阻塞 later：窄屏关闭标签为22px命中区，可在后续粗指针优化时扩大命中范围并检查相邻标签误触。当前键盘 Delete 和原生关闭按钮均可用。

交付为当前工作树改动；保留已有未提交功能迭代。隔离预览 home `/private/tmp/molis-coss-review`，端口4186；未修改用户真实项目数据、未提交Git、未发布。
