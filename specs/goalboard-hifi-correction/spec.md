# Molis Work 高保真还原纠正

## 完成等级

本轮达到 **内部完整的 UI 修正（Level 4，UI 范围）**：真实 Molis Work `.app` 的中文、英文、桌面宽屏、Harness 伴随窄屏与 Goal Graph 均可直接评审。现有领域能力和 Runtime/TUI 行为不改变。

## 背景与问题证据

用户对真实运行截图复核后否定了上一轮验收：

1. 中文界面仍混入 `Goal Navigator`、`Goal Focus`、`Bound to Goal`、`Run` 等未处理的英文壳层文案；桌面模式还会无条件把窄屏导航切成英文。
2. 真实桌面实现与三张已确认高保真稿在栏宽、字号、信息密度、TitleBar 和窄屏层级上仍有明显距离。
3. 当前 Graph 把同方向节点堆进单列，再以长曲线连接；适应窗口会缩到 80%，导致节点与连线都难以阅读，关系方向也缺少可靠的端点语义。
4. 更根本的问题是可见组件仍沿用旧版后台页面的视觉模型：层级生硬、边线和色块过重，中间是完整文档页，右侧是终端容器。上一轮主要覆盖了颜色、字号和间距，没有把它们替换成确认稿中的 Focus 与 Runtime 组件，因此整体质感不可能靠继续叠加 CSS 达标。
5. Desktop 项目列表仍有只适用于浅色主题的硬编码白色 Hover、迁移区和按钮底色；项目列表页 TitleBar 没有声明原生拖拽区域，宽屏三栏又覆盖了用户拖动写入的栏宽变量，造成窗口拖不动、分栏拖动没有视觉变化。
6. Desktop TitleBar 的网页内容与 macOS 交通灯不在同一视觉中线，品牌 Logo 被隐藏；关系页的二级导航仍带浅色硬编码；切换 Goal 详情 Tab 会调用 `scrollIntoView`，无端改变用户阅读位置。
7. 双栏切换器直接复用于普通 Web 后缺少 Web 自己的栏头规则，形成悬浮胶囊并挤压“目标聚焦”标题；Runtime 打开菜单仍使用硬编码白色背景和按钮，暗色主题下出现白底浅字与错误的琥珀色警告块。
8. “关系图”被错误放进 Goal 级工作区切换，与 Goal Focus、Goal-bound Runtime 混为同一层级；Runtime 外层栏头与组件自身又重复显示两次标题。改为独占工作面后，旧 Dock 的展开 / 收起按钮也失去职责。径向图虽已降低交叉，但普通连线缺少清楚的起点与终点提示，仍难以判断关系方向。
9. 决定中心仍有只针对浅色背景设计的卡片、选项、依据区、禁用态与操作按钮，Dark 下层级和对比度没有进入同一套主题系统。
10. Desktop 虽保留了 `data-tauri-drag-region` 和可缩放窗口配置，但 capability 只声明 `core:window:default`；自定义 TitleBar 发起的拖动命令没有独立授权，因此真实窗口无法移动。

上述反馈已作为失败复核写回 Molis Work；原“已达到高保真”的完成结论不再作为本轮验收依据。

## 目标

- 产品壳层随语言完整切换；Goal 标题、用户正文和用户输入保持原文。
- 真实 Desktop 在不复制假数据的前提下，还原确认稿的三栏比例、字体层级、接缝、TitleBar 与伴随模式。
- Desktop 的项目列表与工作台在 Light / Dark 下使用同一套语义色；TitleBar 可移动窗口，Tree 与 Runtime 分隔条能真实调整栏宽。
- TitleBar 中央保留品牌图标与名称；详情 Tab 只切换内容，不改变当前滚动位置。
- 普通 Web 使用贴合主内容栏的平面 Tab 导航，Desktop 使用紧凑模式切换；两者共享行为但不强行共享同一视觉容器。
- Runtime 菜单、选项、输入、禁用态和提示全部使用 Light / Dark 语义色，不出现硬编码白底或低对比度文本。
- 关系图作为项目级“列表 / 图谱”导航进入完整项目网络；Goal 级工作区只在“聚焦 / Runtime”之间切换，Runtime 只有一层组件标题。
- Runtime 的进入和退出只由工作区 Tab 控制；不保留旧 Dock 的展开 / 收起按钮，切换视图不能关闭已有终端。
- 决定中心所有结构表面与交互状态使用现有主题 token，Dark 下保持信息层级、语义色与可读对比度。
- Graph 仍只读取 active `part_of` / `depends_on`，但通过关系语义布局、可读节点和低交叉正交连线表达真实方向。

## 范围

### 包含

- `src/web/render.ts`：壳层文案、桌面/窄屏结构类、Graph DOM 与连线端点。
- `src/web/i18n.ts`：新增壳层、Graph 与 Runtime 摘要的对称中英文映射。
- `src/web/visual-foundation.ts`：桌面栏宽、字体、间距、窄屏层级、Graph 画布与节点样式。
- `src/web/goal-graph.ts`：只读展示布局；根据父子与依赖语义放置节点，不写回数据。
- `desktop/src-tauri/capabilities/default.json`：只补充自定义 TitleBar 启动窗口拖动所需的最小权限。
- 相关测试与真实 `.app` 截图验证。

### 不包含

- 不修改 SQLite、MCP、API、状态机、Goal 业务权限、Goal 生命周期或 Relation 类型；仅补充桌面窗口拖动的壳层权限。
- 不修改 PTY、终端进程、会话恢复、Runtime 启动或 Goal 绑定契约。
- 不翻译 Goal 标题、Contract、Evidence、用户记录或其他用户内容。
- 不根据标题臆造项目阶段或业务分组。

## 方案与关键决策

### 语言边界

品牌名 `Molis Work` 与协议名 `Goal`、`Runtime` 可按产品约定保留；页面区域、操作、状态和说明必须经过 `L(...)`。中文模式使用中文区域名，英文模式使用对应英文。桌面壳不再成为强制英文的条件。

### 桌面与伴随模式

Desktop 宽屏改为稳定的双栏工作台：左栏始终承担项目级 Goal Navigator，并提供“列表 / 图谱”入口；右栏是单一主工作区，Goal 级只在“聚焦 / Runtime”之间切换。进入图谱时，右侧显示完整项目网络，左侧入口明确表明它属于项目导航而不是某个 Goal 的详情 Tab；选中图中节点后仍联动对应 Goal。切到 Runtime 时，其组件 Header 必须保留当前 Goal 标题与绑定状态，因此外层不再重复显示 Runtime 标题。原生 TitleBar 承担全局控制与居中的 Molis Work 品牌；默认窗口必须完整落在常见笔记本工作区内，并允许用户拖动和缩放。760px 以下继续使用目标 / 聚焦 / Runtime 独占视图，首屏字号、卡片高度和操作密度按伴随窗口重新校准，不是缩小后的宽屏页面。

桌面宽屏先作为本轮第一个垂直切片，必须直接替换可见组件结构，而不是继续给旧 DOM 换皮：

- Navigator 保留真实父子 Goal Tree、展开收起和层级线，不照搬参考稿的状态分组。默认行以标题、紧凑状态和必要的子项进度为主，Goal ID 与完整依赖说明退到按需查看；依赖摘要只在存在时出现。
- Focus 默认面只由 Goal 标题与结果、Next、Completion、Context 组成；Next 保留唯一主操作，Completion 直接呈现完成条件，Context 用简单键值行承载负责人、范围、依赖和更新时间。完整事实仍从既有 Tab 进入，不删除任何信息或动作。
- Runtime 使用确认稿的 Header、Goal 绑定状态、Terminal / Logs / Artifacts 导航和深色工作井；现有 TUI tab、打开 Runtime、推进、复制、填入、恢复和父 Goal 保护行为继续复用。右侧主工作区的模式切换只改变显示面，不关闭终端、不切换 Goal，也不改写任何业务状态。
- Desktop 顶部只承担原生窗口身份与少量全局动作；项目、语言、主题和设置可以进入 TitleBar，但不能再形成一层网页式大工具栏。

整体视觉采用“高密度但不压迫”：一屏容纳足够多的 Goal 与工作事实，同时通过柔和小圆角、低饱和选中态、胶囊状态和弱分割线降低攻击性。高信息密度不能通过缩小到难读或堆满 ID、说明文字实现；圆润也不能退化成大卡片堆叠。减少的是重复解释和无意义留白，不是 Goal 数量、完成条件、关系和进度等有效事实。

这一刀完成后立即重启源服务和真实 `.app`，先由真实截图验证组件层级，再进入 Graph 与窄屏；不得用后续 Graph 工作掩盖桌面三栏仍未达标的问题。

### Graph

Graph 采用确定性的同心聚簇布局，而不是层级卡片矩阵：当前 Goal 固定在圆心；直接父级、直接子级与直接依赖进入第一圈；每个直接子 Goal 获得独立扇区，它的后代沿该扇区向第二、第三圈展开；其余弱相关节点置于外圈。`part_of` 关系沿半径连接，跨分支的 `depends_on` 关系沿外圈弧线绕行，避免从圆心横穿与大量交叉。节点以状态圆点和紧凑标签表达，选中节点在圆心获得更强层级；标题不能因自动适配缩到不可读。

Graph 默认显示完整网络，用户可切到“直接相关”聚焦当前 Goal，并可单独开关父子 / 依赖。两类关系分别使用实线蓝色和虚线琥珀色，以同色箭头指向 `to_goal_id`。布局与路由只读取 active `part_of` / `depends_on`，不得创造关系、修改 Goal 或根据标题臆造分组。

每条可见边以源端圆点标出 `from_goal_id`，以箭头标出 `to_goal_id`；当前选中节点相关的边、源节点与目标节点同时增强，其余边降低对比度。图例必须能让用户不依赖悬停就读懂“圆点起点 → 箭头终点”。

## 输入、输出与调用链

- 输入：现有 `WebGoalView`、active Relation、当前选择、语言和主题。
- 布局：`buildGoalGraphLayout` 只返回展示坐标与关系角色。
- 渲染：`renderMolisWorkWeb` / `renderGoalGraph` 生成可访问 DOM。
- 交互：现有 `selectGoal`、筛选、搜索、缩放和 TUI 事件继续复用。
- 输出：Web 与 Desktop 的 UI；任何视图操作都不得产生 Molis Work 写入。

## 验收标准

1. 中文模式的宽屏、窄屏、List、Graph、Focus、Runtime 不出现可翻译的英文壳层标签；英文模式对应区域为英文；用户内容原样保留。
2. 真实 Desktop 宽屏为“Navigator + 单一主工作区”双栏；聚焦、关系图和 Runtime 的切换不造成 Goal 变更、终端关闭或内容跳滚；窄屏伴随模式与确认稿的信息密度一致。
   - Navigator 保留父子层级，一屏可辨认更多 Goal；不再默认铺开 Goal ID、依赖原因与多行关系说明。
   - Focus 首屏能在 5 秒内回答“这是什么、下一步是什么、怎样算完成、上下文是什么”，并且不出现旧版卡片堆叠。
   - Runtime 的 Goal 归属、Terminal 工作面和关键操作同处一个连贯组件中，不出现空白大容器或双重工具栏。
3. 当前 12 Goal 项目中，Graph 以当前 Goal 为圆心按关系距离向外展开；同一父 Goal 的子树形成可辨认聚簇，节点标题和状态可读，父子与依赖方向正确，跨分支连线不横穿圆心或汇成无法判断的线团。
4. 直接相关 / 完整网络、关系类型、搜索、缩放、节点选择、Focus 联动、Light / Dark / System 均可用。
5. Graph、语言和响应式交互不修改 Goal、Relation、Runtime 或任何业务状态。
6. 每个可见切片完成后重启源服务和真实 `.app`；最终截图来自实际运行页面。
7. Desktop 项目列表在 Dark 下不出现硬编码白色 Hover 或白色迁移区；在项目列表和工作台均可从非交互 TitleBar 区域拖动窗口，宽屏 List 视图的 Tree / Runtime 分隔条拖动后栏宽发生变化。
8. Web 的聚焦 / 关系图 / Runtime 导航与主内容栏同高、同基线，不形成悬浮卡片；暗色 Runtime 打开菜单标题、说明、Runtime 选项、禁用状态、输入框和取消按钮均达到可读对比度。
9. README 靠前的产品演示区使用本轮真实桌面端聚焦、Goal-bound Runtime 与径向 Graph 截图，不引用临时路径。
10. “关系图”不出现在 Goal 级工作区 Tab 中，而由项目导航的“列表 / 图谱”切换进入；Runtime 页面不重复出现两个同级 Runtime 标题，也不显示旧 Dock 的展开 / 收起按钮；每条图边均可辨认源端与目标端，选中节点的关联路径有明显但克制的增强。
11. 决定中心在 Dark 下不出现硬编码白色卡面、输入、选项或按钮；待决定、风险、确认与禁用状态仍可清楚区分。
12. Desktop capability 明确允许 `start_dragging`；从任一非交互 TitleBar 区域拖动时，真实窗口可移动，TitleBar 内链接与按钮仍只执行自身动作。

## 验证

```bash
pnpm typecheck
node --import tsx --test tests/goal-graph.test.ts tests/visual-foundation.test.ts tests/i18n.test.ts tests/web.test.ts tests/desktop-tui.test.ts
pnpm test
cargo check --manifest-path desktop/src-tauri/Cargo.toml
```

视觉验证覆盖：中文/英文，Light/Dark/System，1440×900 左右桌面宽屏，约 500×900 伴随窗口，List、Graph、Focus 和 Runtime。
