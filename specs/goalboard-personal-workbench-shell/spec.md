# Molis Work Desktop 单目录个人工作台改版

## 背景与当前证据

当前未提交实现仍是“应用栏 + 项目 Goal 目录 + Goal 内容”的三层结构。真实试用和后续高保真原型确认了它的问题：

- 应用栏和 Goal Tree 都在左侧承担导航，目录重复；
- 顶部项目、应用栏项目和 Goal Tree 项目上下文重复；
- 左侧搜索、分组标题、结构线和固定工具持续占空间，视觉噪声高；
- 主工作面没有项目级 Goal 标签，切换后难以保留多条正在查看的 Goal；
- 根目录的 Feed、Promotion、可视化工作区目前只替换左栏目录，右侧仍停留在旧 Goal，形成“左侧已经切换、右侧没有响应”的错误状态；
- 标题栏虽然声明了 Tauri 拖动权限，但左右实际可命中的空白拖动区分别只有最小 12px 和固定 48px，正常窗口宽度下近似不可用；
- 标题栏曾把 `trafficLightPosition.y = 16` 错当成原生按钮中心线；改为 `24` 后，真实 2× Retina 安装包截图仍测得原生按钮中心约为 21.75 CSS px，而 Web 控件中心在 24px，相差 5 个物理像素。Web 控件因此需要独立校准到 21.5px，而不是继续假设配置值就是可见中心；
- 本机同时存在 `~/Applications/Molis Work.app` 与 `/Applications/Molis Work.app` 时，启动脚本优先前者；若只更新后者，用户仍会打开旧版本；
- 旧 Desktop App 在 4173 服务重启的短暂空窗中会重新运行其内置安装器；同版本内置 Runtime 因内容摘要不同而覆盖刚安装的本地新构建，造成源码、安装目录和实际页面反复回退；
- Desktop 从本地开发安装启动 Web 时，Legacy Node launcher 会再 spawn 真正的 server；App 退出若只强杀 launcher，server 会变成 PPID 1 的孤儿并继续占用 4173，随后 LaunchAgent 无法接管；
- Desktop 项目页当前把 `Goals` 作为初始左栏目录，并恢复旧版保存的 `directory: goals`；因此即使新包已经安装，用户打开项目仍直接看到 Goal Tree，根目录工作台被藏在返回箭头后，视觉上与旧版几乎一致；
- Desktop 请求曾写入一年有效期的 `molis-work-desktop` Cookie，导致同一浏览器随后访问普通 Web 也被错误识别成 Desktop；响应式聚焦页因此丢失项目切换入口；
- Desktop 与普通 Web 仍保留了两套项目壳层：Desktop 使用新版单目录工作台，Web 使用旧 Goal Tree。原生窗口一旦丢失 `desktop=1` 就直接暴露旧壳层；真实 Footballnia 页面已经复现。根因不是缺少更多身份补丁，而是同一个产品不该继续维护两套互相漂移的主界面；
- 同壳层完成后，原生安全区仍由服务端是否看到 `desktop=1` 决定；进入 Goal、Inbox 跳转、归档、恢复、新建项目或 Web 服务恢复等完整页面导航会丢失该参数，随后 CSS 把标题栏左内缩从原生安全值降到普通 Web 的 `2px`，项目图标和标题再次被 traffic lights 遮挡；
- Desktop 设置页仍使用“原生标题栏安全空行 + 下一行项目卡片”的旧结构，项目切换下沉并与设置标题重复；主工作台的项目控件左侧安全距离也不足，会与 traffic lights 重叠；
- 普通项目首页和设置页把约 230KB 的共享视觉样式重复内联进 HTML，项目首页仍使用长列表；冷启动还需要同步探测本地 Runtime 命令，造成首次页面偶发接近 1 秒的等待；
- Light 模式的大面积白卡同时使用描边和宽而重的阴影，层次漂浮且光源不一致；
- 项目设置和全局设置入口、作用域与返回路径不统一；
- Goal 详情虽然已补充 Contract 信息，但仍需放进更稳定、更简约的工作台结构。

本 spec 取代上一版“三栏个人工作台”的布局结论。保留已经验证有价值的 Goal Tree、Goal 详情分块、现有真实设置表单和 Runtime 能力；替换重复目录、顶栏和线框表达；忽略 YouMind 的大留白、推荐首页和 AI 输入框。

## 完成等级

本轮目标为 **Level 3：Desktop 工作台核心 UI 功能可用，并修复同源 Web 回归**。

- Goal、决定中心、项目切换、项目设置、全局设置和 Runtime 继续使用真实数据与现有行为；
- Goal 标签按项目保存在当前设备，可打开、复用和关闭；
- Feed、Promotion、Cloud/Team 等尚无领域能力的入口只表达规划位置，不伪装成已接通功能；
- 根目录模块切换必须同步切换右侧工作面；返回 Goal 时恢复原 Goal、详情内页签、滚动位置和 Runtime，不重新创建领域状态；
- 普通浏览器 Web 与 Desktop 采用同一套工作台壳层；760px 以下 Companion 由同一 DOM 响应式折叠，并在目标、聚焦和运行任一工作面都能直接切换项目。

## 用户结果

用户打开 Molis Work Desktop 后只面对两个稳定区域：

1. **左侧唯一目录**：原生标题栏内直接选择项目和进入项目设置；标题栏下在工作台根目录、Goals、Goal Tree 或设置目录之间逐级切换；底部固定为本地身份和全局设置。
2. **右侧项目工作面**：顶部是当前项目保存的 Inbox / Goal / 设置标签，下面显示 Inbox 列表、一条 Goal 的完整详情、设置文档或现有 Runtime 工作面。

用户不再判断“该去应用栏还是 Goal Tree”。进入 Goals 后仍能使用原有父子 Goal Tree；返回上一级即可回到工作台根目录。

Desktop 首次打开或安装本版后打开一个项目时，左栏默认显示工作台根目录，同时右侧继续显示最近 Goal。只有用户明确进入 Goals 后，左栏才替换成 Goal Tree；同一会话内切换 Goal 或其他工作面时继续恢复该目录及各工作面的内部状态。

## 方向 Contract

```text
THESIS: 只有一个目录入口，项目中的多条 Goal 在右侧复用；拒绝重复侧栏、轻首页大留白和后台管理式线框。
OWN-WORLD: 石墨目录、深浅同源的柔和工作面、克制钴蓝焦点、系统字体、Lucide 图标、阴影与色面区分层级，尽量减少结构线。
STORY: 先选择项目和工作类型，再在 Goals 中展开真实 Goal Tree；打开的 Goal 作为项目标签留在右侧，详情首屏直接回答结果、原因、运转和下一步。
FIRST VIEWPORT: 约 310px 单目录与剩余标签工作面；项目切换在 macOS 标题栏红黄绿按钮右侧，账户和全局设置贴左下，Inbox / Goal 标签在右上，Goal 详情以柔和分块连续展开。
FORM: Operate 模式的 single-directory project-tab workbench，方向由 2026-08-29 用户确认的交互原型锁定（seed=molis-work-desktop-single-directory-project-tabs-2026-08-29）。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
```

## 范围与行为

### 1. 左侧唯一目录

Desktop 与普通 Web 的宽屏界面共用一个目录列：

- macOS Overlay 标题栏高 48px。红黄绿按钮占用左侧约 76px，项目选择器紧接其右侧并在原位打开项目下拉菜单；项目设置按钮紧邻项目选择器，不再另占一行；
- 项目下拉直接列出真实项目，当前项目有可读选中态，选择后进入该项目工作台；菜单同时保留“管理项目”入口。标题栏空白区域仍可拖动窗口，项目选择、设置、Goal 标签、关闭和新建按钮保持纯交互语义；
- 左侧目录从标题栏下方直接开始。普通模块行约 40px，目录标题约 40px，Goal 工具区约 30px；避免标题重复放大和无意义纵向空档；
- 根目录不显示“工作台”“注意力入口”等分组标题，也不显示常驻搜索框；
- 根目录依次提供 Inbox、Goals、Feed、Promotion、可视化工作区；Inbox 与当前 Goal 页面一样是右侧工作面入口，不再替换左栏目录；
- 项目首次打开默认落在根目录，而不是直接落入 Goals。旧版没有导航模型版本号的 `sessionStorage` 状态只迁移 Goal、详情页签、滚动位置和 Runtime 等内容，不继承其 `directory: goals`；用户在新版中明确进入 Goals 后，新版目录状态才继续随 Goal 页面导航保存；
- 点击根目录模块时，左栏保持根目录并更新当前态，右侧打开或复用对应工作面标签；点击 Goals 时进入左栏 Goal Tree，并恢复最近一条 Goal 的右侧详情；
- 点击 Inbox 打开或复用右侧 `Inbox` 标签，左栏保持根目录并显示 Inbox 当前态；Inbox 默认展示真实待决定事项列表，列表行通过图标和小型类型标签区分目标说明、新工作、Goal 关系、结果确认和风险。点击一行再展开现有真实处理表单；尚未接通的同步输入和升格流不伪装成数据；
- Goals 进入原有 Goal Tree，保留父子展开、状态筛选、新建、列表/关系视图、归档和回收站；这些工具在目录标题区或按需状态出现，不再占据一整块搜索工具栏；
- Goals 及其二、三级目录仍在左栏原位切换，并有“返回上一级”；Inbox、Feed、Promotion 和可视化工作区不再创建左栏二级占位目录；
- 左栏主要依靠与右侧工作面之间的轻微底色色差、hover 和 active 色面区分，不为每个 item 或区域画结构线；左栏与右侧之间不显示贯穿窗口的边框或常驻投影，透明宽度调整区只在 hover / dragging 时显色；
- 根目录和 Goal Tree 使用 Codex 式紧凑列表：hover 与 active 只使用克制的中性色面，不使用粗蓝描边、悬浮位移或卡片式大阴影；返回箭头保持小尺寸，并用内收 focus ring 表达键盘焦点；
- 底部账户区始终贴底，显示本地身份；齿轮明确进入全局设置。

### 2. 项目级工作面标签

- 右侧顶部显示项目内已打开的 Inbox 与 Goal 标签；同一入口再次打开时复用，不生成重复标签；
- 标签列表使用项目 ID 隔离并保存在当前设备，切换项目后恢复该项目的标签；
- 关闭非当前标签只移除标签；关闭当前标签后选择相邻标签；至少保留当前可显示 Goal；
- 选择 Goal 继续复用现有异步文档载入、History、Goal-bound Runtime 和写操作，不复制领域状态；
- Feed、Promotion、可视化工作区作为项目内 utility 工作面打开；其占位内容、标签和左栏当前态同步切换，Goal 工作面继续留在 DOM 中。再次选择 Goal 标签或 Goals 目录时，恢复切换前的详情子页、滚动位置和 Runtime 会话；
- Inbox 继续使用真实 `/decisions` 路由。离开 Goal 页面前保存项目级 Goal UI 状态，Inbox 使用独立的页面 UI 状态键，不能覆盖最近 Goal；从 Inbox 选择 Goals 时回到最近 Goal；
- Inbox 当前使用 `/decisions` 作为真实数据路由，但用户界面统一命名为 `Inbox`；待决定处理仍写入原有 Molis Work 领域状态，不创建第二份 Inbox 数据；
- 设置页在 Desktop 中也表现为可关闭的工作面标签，关闭或返回后回到项目 Goal；
- 窄屏继续使用现有 Goals / Focus / Runtime Companion，不强行显示桌面标签条。

### 3. Goal 详情

保留并打磨现有分块：

- 状态、标题、负责人、优先级和更新时间；
- 完成后会得到什么、为什么现在做、它会怎样运转；
- 概览 / 完成要求 / 进展与阻塞 / 关联与约束 / 记录；
- 下一步、完成要求和执行上下文必须在常见 1440×900 首屏内可读；
- Desktop 的“当前 / 上下文 / 进展 / 关系 / 记录”内容面板默认占满可用宽度和当前视口的剩余高度；同一 deck 的非活动面板必须叠在同一布局轨道并退出可见布局，不能因为隐藏面板各占一行而挤压当前内容。短内容使用安静的工作面承接剩余空间，且高度不能再被固定的桌面上限截断。760px 以下不强制最小高度；
- 完整记录中的执行表格必须使用主题色面与文字 token；Dark 模式的分组标题、正文和次级说明均保持可读，不允许浅色表头配浅灰文字；
- 使用柔和色面、留白和局部阴影形成层级，避免整页细线分割；
- 不删除任何已有 Goal 写操作、决定、证据、风险、影响范围或 Runtime 能力。

### 3.1 复合父 Goal 的 Runtime

- `closed_compound` 父 Goal 不允许直接打开 AI/Runtime 时，Runtime 面只显示父 Goal 说明和真实子 Goal 入口；
- 界面不显示“添加终端”、终端标签、推进/复制/填入按钮、空终端画布或 Runtime 打开菜单；为支持同页切换到叶子 Goal，必要结构可以保留在 DOM 中，但必须退出布局与可访问性树；
- 子 Goal 入口保留状态与下一步，点击后沿用现有 Goal 切换；没有子 Goal 时只显示拆分异常说明；
- 可执行叶子 Goal 的终端与 Runtime 行为保持不变。

### 4. 双层设置

- **项目设置**入口在项目选择器旁，只包含当前项目的“工作规则 / 工作规划”；保留真实保存、版本与规划方法行为；
- **全局设置**入口在左下账户区，只包含当前设备的“界面与语言 / AI 与执行工具 / 诊断”；
- 两类设置在入口位置、目录标题、右侧标签和页面说明中都明确作用域；
- 项目设置保存需要显式提交；全局外观偏好沿用现有即时保存行为；
- Desktop 与普通 Web 设置页使用同一目录和工作面语言；平台差异只用于原生窗口拖动区和 macOS traffic lights 安全距离；
- Desktop 项目设置与全局设置沿用相同的 48px 原生标题栏：项目切换和设置按钮直接位于 traffic lights 右侧并与其视觉中心对齐，不再先渲染空安全行，也不在标题栏下面重复项目卡片；第二行直接开始“项目设置 / 全局设置”目录标题；
- 项目管理页使用紧凑的真实项目卡片网格，展示项目名、数据范围和打开动作；常规宽屏每行 4 张，中等宽度依次降为 3 / 2 张，窄屏单列，不使用贯穿页面的项目列表和巨大外框。
- 所有按钮在 Light / Dark 中必须消费同一套语义动作色；主操作、危险操作、hover、focus、disabled 与 loading 状态不得写死白字并搭配会在 Dark 中变亮的背景色。

### 4.1 Web / Desktop 同壳层与加载性能

- 项目工作台、项目切换、单目录、Inbox、Goal 标签、Goal 内容和 Runtime 在 Desktop 与普通 Web 共用同一份 HTML 结构、CSS 和交互脚本；删除旧 Web Goal Tree 壳层和 `desktopShell ? 新壳层 : 旧壳层` 双分支；
- `desktop=1` 或 Desktop 请求头只启用原生增强：macOS traffic lights 安全距离、可拖动标题栏和 Tauri 窗口能力。它们不再决定用户看到哪套产品界面；
- 原生增强不能只依赖服务端 URL 标记：页面在 stylesheet 生效前通过 Tauri 注入对象自识别原生环境，完整页面跳转统一保留 `desktop=1`，服务恢复也必须把当前 loopback URL 归一化为 Desktop URL。普通 Web 不获得原生安全区；
- 普通 Web 在宽屏直接使用同一项目下拉和单目录工作台；760px 以下继续折叠为同一 DOM 的 Companion 视图，不另建旧版导航；
- 旧 `molis_work_desktop` Cookie 不再读取或写入，桌面正确性也不依赖每条链接都追加查询参数；
- Desktop 内置 Runtime 只在首次缺失或版本号严格升级时写入本机安装；旧 App 不得以同版本内容覆盖本地新构建。内置版本升级后要重启已有的受管 Web 服务，让当前 App 与 4173 立即使用同一 release；
- Desktop 自行启动的 Web launcher 使用独立进程组；窗口退出、替换或恢复时先向 launcher 与整个进程组发送 TERM，超时才 KILL，不能遗留占用 4173 的 server 孤儿进程；
- 项目首页、项目设置和全局设置复用可缓存的静态样式资源，不在每个 HTML 响应中重复传输整份视觉基础样式；
- 首屏不得为了 Runtime 可用性探测阻塞页面响应；探测结果允许在页面显示后补齐，但真正启动 Runtime 时仍使用现有校验与错误反馈。

### 5. 保留、替换、忽略

**保留**

- 原有 Goal Tree 结构和真实状态；
- 原有 Goal Detail 分块及所有写操作；
- 项目/全局设置真实表单；
- Graph、Decision、Archive、Trash、Runtime、Light/Dark/System、中英文与 Companion。

**替换**

- Desktop 的双左栏/三层导航；
- 顶部重复项目面包屑；
- 常驻搜索区和大块工具栏；
- 大量 1px 分区线与后台式连续平面；
- “个人空间 / 工作台”重复文案。

**忽略**

- YouMind 推荐流、积分、技能、AI 首页输入框；
- 尚未定义实体和工作流的 Feed / Promotion / Cloud / Team 假数据；
- 本轮之外的 Server 同步、账号和团队权限实现。

## 模块与数据边界

### 输入

- `MolisWorkWebView`、当前项目、当前 Goal 和 route flags；
- 现有 Goal Tree、决定数量、设置页面数据；
- 现有 Session UI state 和项目 route prefix。

### 新增本地 UI 状态

- 当前左侧目录（root / goals；Inbox 与规划模块均为右侧工作面，不持有左栏二级目录）；
- Desktop 导航状态版本；用于一次性忽略旧版默认写入的 `Goals` 目录，同时保留其他可兼容的 Goal 工作状态；
- 每项目打开的 Goal tab ID 列表；
- 当前右侧工作面（goal / inbox / feed / promotion / visual）及各工作面的滚动位置；
- 当前设置工作面返回目标。

这些状态只进入 `sessionStorage` 或 `localStorage`，不成为 Molis Work SSOT，也不修改 SQLite。

### 允许修改

- `src/web/render.ts`
- `src/web/visual-foundation.ts`
- `src/web/desktop-shell.ts`
- `src/web/server.ts`
- `src/web/i18n.ts`
- 相关 Web / Desktop / visual foundation 测试
- 实现验证后的 `DESIGN.md` 与 `.impeccable/surfaces/src-web-render-ts.md`

### 不允许修改

- `src/v1/` 领域、SQLite、Goal 生命周期；
- MCP、CLI、Runtime 绑定协议；
- PTY/WebSocket 数据行为；
- 普通 Web 的目标、聚焦、运行主信息架构（仅恢复跨工作面项目切换入口）。

## 交互与无障碍

- 左侧目录和右侧标签均可键盘操作；当前目录、当前 Goal 和当前设置具有可读状态；
- 左侧模块当前态与右侧实际可见工作面必须来自同一个 UI 状态，不能出现 Promotion 已选中但右侧仍显示 Goal 的分裂状态；
- icon-only 按钮必须有具体名称，例如“打开全局设置”“打开当前项目设置”；
- 标签使用 `tablist / tab / tabpanel` 完整语义；关闭按钮不嵌套在 tab button 内；
- 状态不只依赖颜色；hover 之外也保留键盘 focus-visible；
- 动效只表达目录替换、hover 和标签变化，150–220ms，并尊重 reduced motion；
- 1180×760 与 1440×900 无横向页面溢出；760px 以下保持现有 Companion。

## 验收标准

1. Desktop 宽屏只出现一列左侧目录和一列右侧工作面，不再出现应用栏 + Goal Tree 双目录。
2. 根目录、Goals 和 Goal Tree 能在同一左栏逐级进入/返回；Goals 保留原有父子树与主要工具。点击 Inbox 时左栏保持根目录，右侧打开或复用 `Inbox` 标签。
3. 项目选择和项目设置位于 48px 原生标题栏内、红黄绿按钮右侧；项目选择器直接下拉列出真实项目。账户/全局设置贴左下且作用域文案清楚。
4. 打开两个不同 Goal 会生成两个可复用标签；重复打开不重复；刷新后按项目恢复。
5. Goal 详情、异步切换、写操作、Inbox 中的待决定处理和 Runtime 主行为无回归；Inbox 列表用真实类型图标/标签区分内容，展开后可完成现有决定流程。
6. 项目设置和全局设置在 Desktop 中视觉属于同一工作台，并显示正确目录和作用域；真实表单可继续保存。
7. Light / Dark 均依靠色面与 active 状态建立层级，左栏没有 item 分割线、大块边框，也没有与右侧工作面之间贯穿窗口的常驻投影或分割线；Light 卡片使用统一、克制的局部阴影，不再同时叠加强描边和宽泛阴影。
8. 1440×900、1180×760 无横向溢出；760px 以下保留目标 / 聚焦 / 运行结构，并能从任一工作面直接切换项目。
9. macOS Desktop 的 traffic lights 不与项目选择器、项目设置或目录内容重叠；项目图标、名称、下拉箭头和设置按钮位于 48px Web 控件带与原生按钮组的同一视觉中心，真实截图尺度下误差不超过 1px。项目控件可正常点击，下拉菜单不触发窗口拖动；左右标题栏把标签和操作之外的剩余宽度交给拖动区，用户可在明显空白处稳定拖动窗口。Desktop 设置页不得在标题栏下方重复项目切换卡片。
10. Dark 模式“完整记录 → 执行与检查”不出现浅色表头配浅灰文字；标题、标签、正文和次级信息均可清楚阅读。
11. Desktop 的当前、上下文、进展、关系和记录标签内容默认撑满可用宽度和剩余视口高度；活动 section 覆盖整个 stage，非活动 section 不额外占用 Grid 行；高窗口不受 `590px / 760px` 一类固定上限截断，短内容不再在卡片下方留下大片无归属空白，窄屏不被强制拉高。
12. 复合父 Goal 的 Runtime 可见界面只保留子 Goal 选择与必要说明，不显示添加终端、终端操作条、空终端画布和 Runtime 菜单；叶子 Goal 仍可正常打开终端。为支持同页切换回叶子 Goal，终端结构可以留在 DOM 中，但必须从布局和可访问树隐藏。
13. 在 Goal 页选择 Feed、Promotion 或可视化工作区时，右侧显示同名 utility 标签与真实“规划中”占位工作面；切回任一 Goal 标签后，Goal 详情子页、滚动位置和 Runtime 状态保持。Inbox 与 Goals 相互切换时不互相覆盖各自的 session UI 状态。
14. 本地安装验证必须读取实际启动优先级最高的 `~/Applications/Molis Work.app` 版本和内置 Runtime 版本；重新打开后健康服务与页面静态资源来自本轮构建，不能只证明 DMG 已生成或 `/Applications` 中另一个副本已更新。
15. Desktop 首次打开项目或从旧导航状态升级时，左栏默认展示 Inbox、Goals、Feed、Promotion、可视化工作区根目录，右侧仍显示最近 Goal；明确进入 Goals 后，在同一会话内切换 Goal、Feed、Promotion、Inbox 再返回时继续恢复 Goal Tree、详情页签、滚动位置和 Runtime 状态。
16. 同一项目 URL 无论是否携带 `desktop=1`，都渲染同一套单目录工作台；带参数时只多出原生拖动区与 traffic lights 安全距离，不允许出现旧 Goal Tree 壳层。
17. 项目管理页使用响应式紧凑项目卡片网格，常规宽屏固定 4 列，中等宽度为 3 / 2 列，窄屏单列；项目首页与设置页的共享视觉 CSS 通过带 ETag 的静态资源复用，重复导航不再传输整份内联样式，页面 HTML 体积相较当前基线明显下降。
18. 首次项目页面响应不被本地 CLI/Runtime 命令探测同步阻塞；页面导航用真实浏览器复测，暖加载目标 < 300ms，若冷加载仍超过 500ms 必须给出可定位的网络或服务端证据。
19. 项目管理卡片在宽屏和窄屏均保留稳定的卡片间距与至少 16px 内边距，标题、项目类型和操作不贴边；Desktop 项目下拉作为左栏之上的独立浮层显示，长项目名在浮层内部省略，不能被右侧工作面裁切或遮挡。
20. Goal 标题上方的状态 pill 对“待执行、待澄清、执行受阻、已完成”等所有状态统一保留至少 26px 高度、清楚的图文间距和左右内边距，不能让图标、文字或边框挤在一起。
21. 打开旧 Desktop App、重启 4173 或执行同版本 `install:local` 时，本机 release 不会被旧 App 内置 Runtime 回写；安装更高版本 App 时才升级 Runtime，并重启已有受管服务。
22. 没有 LaunchAgent 时由 Desktop 自行启动 Web，退出 App 后 launcher 与实际 server 都结束；重新启用 LaunchAgent 不出现 4173 端口冲突。
23. Desktop 从项目列表、Goals、Inbox、新建 Goal、归档、回收站恢复、项目设置、全局设置或 Web 服务恢复进入任一完整页面后，URL 仍包含 `desktop=1`，页面继续应用原生安全区和拖动区；即使某条历史 URL 缺少参数，Tauri 页面也会在首帧布局前自愈。普通浏览器页面仍使用无 traffic lights 留白的 Web 对齐。
24. Light / Dark 下所有可见按钮的文字和图标保持可读：普通文字对比度至少 4.5:1，控件边界与图形至少 3:1；主操作和危险操作的默认、hover、focus、disabled、loading 状态不因主题切换而反转成浅字浅底或深字深底。

## 验证

- `pnpm typecheck`
- `node --import tsx --test tests/web.test.ts tests/desktop-tui.test.ts tests/visual-foundation.test.ts tests/i18n.test.ts`
- `cargo check --manifest-path desktop/src-tauri/Cargo.toml`
- 真实 Desktop 1440×900 与 1180×760：标题栏项目下拉、目录切换、Inbox 标签与类型列表、两条 Goal 标签、标签关闭/恢复、Light/Dark、项目设置、全局设置、Runtime；
- 真实 Desktop Goal Detail：依次切换上下文、进展、关系、记录，检查 active 内容宽度、最小高度、长内容自然增长、Dark 执行表格对比度；
- 复合父 Goal Runtime：只显示子 Goal 列表且无终端控件或空画布；叶子 Goal Runtime 回归添加终端与现有会话；
- macOS Desktop 真实窗口：用截图测量 traffic lights 与项目图标、名称、下拉箭头、设置按钮的垂直中心误差（≤1px），并检查项目下拉、项目设置点击、空白处拖动窗口；
- Desktop 真实窗口依次点击 Promotion → Feed → Goals → Inbox → Goals，核对左栏当前态、右侧标签/内容同步，并确认 Goal 详情页签、滚动位置和 Runtime 会话恢复；
- 重新安装后读取 `~/Applications/Molis Work.app/Contents/Info.plist` 与内置 `molis-work-runtime/package.json`，启动后核对 `/health` 和运行进程工作目录；
- 普通 Web 与 720px Companion 回归；
- 带旧 `molis-work-desktop` Cookie 的普通 Web 请求回归，确认 Cookie 不再参与界面分支且响应不再写 Cookie；
- 记录项目首页、项目设置、Goal 页修改前后的 HTML 字节数、TTFB 和浏览器导航耗时；连续切换项目/设置/Goal 时检查没有重复同步 Runtime 探测；
- 项目管理页宽屏四列、中等宽度三列/两列与窄屏单列卡片截图；Light 模式检查页面底色、卡片描边、阴影方向与强度一致；
- Light / Dark 批量检查项目、Goal、待决定、项目说明、规划方法、来源和 Runtime 中的主操作、危险操作、hover、focus、disabled 与 loading 状态；
- Desktop 主页面与设置页打开项目下拉，检查浮层跨越左栏边界时仍完整可见，长项目名在菜单内部省略且不进入右侧内容层；
- Impeccable 桌面/窄屏一轮截图审视，批量修复后最多一轮确认和终审。

## 假设与开放问题

- 本轮项目下拉只消费 `MolisWorkWebView.projects` 中的现有项目目录数据，不复制项目 SSOT；未来 Cloud/Team 可在同一项目选择工作流中扩展。
- `/decisions` 是 Inbox 当前真实内容来源；Feed、Promotion 和同步输入的实体与工作流仍需独立设计，本轮不写假数据。
