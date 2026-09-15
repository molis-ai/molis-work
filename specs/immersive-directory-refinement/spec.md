# 工作台目录修正

状态：2026-09-12 已完成，功能可用（等级 3），已更新本机 Core 与 Web 服务。承接 immersive-workbench-implementation，用户提供实际本机截图并要求修正 Goals、Feed、Sessions 目录及无法调整宽度的问题。

## 目标与证据

完成等级 3：本机真实目录可顺畅浏览、筛选和调整宽度，保留原有项目与内容。截图显示 Goal 父子行排版不同、字重过重、状态点套边框；Feed 的页面级空状态挤入目录；Sessions 搜索与整行筛选占据过多空间。

根因：旧 directory-ledger 的高优先级 Goal 样式仍覆盖 immersive 样式；旧插件目录控件未按新侧栏适配；生产 shell 未渲染 tree-resizer，宽度 CSS 也未消费现有 --tree-width。

## 范围与方案

- 保留首页、两层目录、纯文字插件条、Goal 画布/固定工作框、所有业务及真实数据。只修目录表达与侧栏宽度，不重做插件详情页或新接入对话。
- Goals 使用一致的单行省略标题、正常字重、紧凑层级缩进与无边框状态点；保留完整 title、状态名称、折叠与选择交互。将旧 Goal directory-ledger 样式排除出 immersive 工作台，避免继续叠加复杂覆盖。
- Feed / Sources / Sessions 的目录使用统一搜索高度、同排图标筛选、紧凑记录、轻量空态、固定底部计数。保留来源/状态/内容/排序能力；筛选面板不超侧栏，窄屏仍可操作。
- 恢复现有树分隔条与指针/键盘宽度控制，沿用项目级 UI 存储。桌面 236–520px，给主区留至少 360px；折叠/恢复及刷新保留宽度，手机抽屉不拖宽。可用方向键和双击恢复默认宽度。

## 边界、依赖与输入输出

输入是现有 Goals/Feed/Work 插件渲染与项目 UI 状态；输出仅是目录 HTML/CSS、宽度 UI 状态。修改 Workbench shell/styles/client、旧 design-system 目录样式适用范围、必要插件目录标记及定向浏览器测试。共享业务接口、项目数据库和 Runtime 生命周期不变。

## 验收与验证

1. 长标题、多层真实结构：父/子标题同一行高，文字不覆盖状态，选中/展开可操作；桌面深浅、窄窗、手机无横向溢出。
2. 真实鼠标拖动改变目录宽度，主区相应变化；方向键调整，刷新及折叠/恢复保留，手机仍为抽屉；调整不写 Goal 事实。
3. Feed 空态/有内容/搜索无结果、Sessions 多条/搜索/筛选/打开均真实可操作；控件与列表统一密度，筛选面板可完整使用。
4. 定向 E2E、构建通过；成组截图检查后一次集中修正和确认。更新本机运行代码以供用户继续验证。

命令：pnpm build；node --import tsx --test --test-concurrency=1 tests/immersive-directory.e2e.test.ts tests/immersive-workbench.e2e.test.ts；必要既有 Feed / Session / Goal 导航回归。沿用隔离浏览器 fixture，实际本机只读检查目录，不制造数据。

假设：用户所说宽度指截图中的左侧项目/插件目录。右侧 Goal 信息栏不是本次调整对象。

## 验收结果

- 通过：统一 Goal 父子行 32px、高优先级旧样式隔离、标题省略及完整 title、无边框状态点；新增深层长标题由真实 Goal API 写入隔离项目，打开正常且目录操作未改变 Goal/Run 事实。
- 通过：真实指针拖动、方向键、双击重置、释放时存储、刷新恢复、折叠后调整窗口再展开、另一项目独立宽度。尺寸检查等待浏览器提交布局，防止将上一帧尺寸误判为最终值。
- 通过：Feed 真实空态、来源入库后的列表、无匹配搜索/清除、筛选弹层边界、阅读后的持久化已读；Sessions 真实 Registry 记录、按 Runtime 筛选、打开详情、Escape 关闭筛选。
- 通过：1440/1280、1024、700、390px；手机项目头及底部入口恢复，抽屉宽度不被桌面偏好挤压；深色 Session 标题使用正文色。截图 `.impeccable/review/directory/`，成组检查与一次修正后的确认。
- 通过：`pnpm build`，`git diff --check`，目录 layout detector 无问题。11 个相关测试最终通过（Go​​als navigation 3、immersive workbench 3、work session UI 4、目录端到端 1）；最后目录确认日志 `/private/tmp/molis-work-directory-confirmation.log`，其余回归在 `/private/tmp/molis-work-directory-final-tests.log`。
- 本机运行代码已刷新到 `~/.molis-work` 并重启既有服务。沿用当前桌面开发程序，未更换 `/Applications` App 包；没有改用户项目内容。Feed 与 Sessions 主区的既有详情布局保留。
