# Shelf：复刻 DropAgent 的功能、交互与视觉

状态：执行中。完成等级目标 **4：内部完整**。刚完成垂直切片：**确认条与动作栏**（不适用的 Agent 动作不占位；对话前分隔；确认条写清产出与隔离；切走材料即取消确认；对话在确认时降低高度；⋯ 可整理动作 / 新建）。下一刀默认 Desktop：**轮盘**。全局热键、Vision OCR、CLI Recipe、真实拖出、系统剪贴板轮询仍待 Desktop adapter。不发布、不改用户真实库。

高保真切片（可点，对齐 DropAgent 现行表面）：`.impeccable/review/shelf-plugin/index.html`。外壳是 Molis 标题栏和插件轨，工作面是 DropAgent 的色、行、纸钮和底栏。

插件名 **Shelf**，id `shelf`。产品是 DropAgent 在 Molis Work 里的完整复刻：**功能、交互、图标色彩、样式、交互质感**都以 DropAgent 已接受需求为准。不另做一版套 Molis 主题的「简化 Shelf」。

权威（按冲突时的优先级）：

1. `/Users/didi/code/DropAgent/01-requirements.md`
2. `/Users/didi/code/DropAgent/02-prototype-design.md`
3. `/Users/didi/code/DropAgent/specs/linear-workbench/spec.md`（当前工作台、轮盘与视觉校准）
4. `/Users/didi/code/DropAgent/DESIGN.md` 与 `macos/App/Palette.swift`（现行色值、图标色组、动效）
5. DropAgent `specs/` 下所有已接受、描述用户可见行为或表面的需求书，尤其 `calm-color`、`paper-buttons`、`paper-press`、`paper-chrome`、`drop-wheel`、`ui-onboarding-refresh`、`monochrome-copy`

Molis 只规定：它挂在工作台插件槽和桌面壳上。不重写 DropAgent 的选择、拖放、确认、结果、剪贴板、轮盘、快捷键、设置语义，也不把 Shelf 重涂成 Coss / Molis 交互质感。DropAgent 写过「不做」的，这里也不做。

## 背景与目标

Molis Work 有左目录、右内容区、macOS 桌面（主窗口、菜单栏、PTY）。要在这里提供 DropAgent 已经做完的置物架，而且看起来、用起来都是那一套：暖纸面、雾蓝主操作、克制的类型色、纸面按钮、按进纸里的反馈。

目标：Shelf 是默认启用的内置插件。人用起来就是 DropAgent。

## 当前行为

- 内置插件没有 Shelf。
- 菜单栏单击是 Goal 胶囊，不能拖文件、没有轮盘。
- 主窗口没有「先上架再跑」的材料/结果/剪贴板工作台。
- Artifacts 是项目成果版本。Sessions 终端绑项目 / Goal。
- 工作台现行表达是 Molis Coss / `interaction-texture`（靛紫强调、按压滤镜、插件身份色）。这套**不得**套到 Shelf 表面上。

## 范围

### 做：DropAgent 的全部功能与交互

主循环与安全承诺整段采用 DropAgent `01-requirements.md` 第 3、6、7 节。Recipe 表、隔离三档、任务目录 `Jobs/<id>/{input,work,output}`、不加载全局 MCP / Hooks / 当前项目规则、不写回原件、跑完校验原件 Hash，全部照搬。

工作台交互整段采用 `linear-workbench` + `02-prototype-design.md` 第 2–4 节。包括但不限于：

**架子与目录**

- 左栏三组：材料、生成结果、剪贴板历史。结果有内容才出现。剪贴板默认可见，展开最近 3 条，最多 10 条，可看全部、可折叠。
- 目录顶：搜索过滤已上架材料；满两字也可添加本机文件。添加、粘贴、多选、更多入口保留。
- 单击稳定选择并在右侧预览，重复单击不清空。Command 点 / 多选模式改材料集合。双击用系统打开。
- 文件夹在左栏展开子项，右边预览选中文件，不嵌第二份目录。
- 行可拖出。悬停或选中时行尾出现复制、隐藏、删除（剪贴板为复制、加入材料、删除），不用右键菜单当主路径。运行中不能隐藏或删除。⌫ 隐藏当前材料或结果；剪贴板焦点下删除所选历史。隐藏只从列表拿掉；删除只清 Shelf 副本，原件不动。
- 从 Finder 拖进 Shelf 工作面任意处：整块半透明罩「加入材料」，并提示发给终端走轮盘。松手加入副本。

**预览与指令**

- 右侧大预览，底部指令常驻一排，只列当前选中能用的动作，加上对话、整理、新建。对话与动作用分隔线分开。宽度不足横向滚动。不适用的禁用，不误用后台那份选择。
- 参数、读/写/网络/隔离事实和开始按钮在指令上方展开。确认、运行、失败、取消、重试都保留预览；Shelf 工作面高度不因状态抽掉预览或把对话做成脱离正文的浮窗。
- 文字副本先阅读，「编辑副本」进入编辑；切换对象、Esc 或「完成编辑」保存退出。PDF 用原生阅读（桌面 PDFKit），对照原文只读。
- 点「对照原文」展开目录 / 原文 / 结果三栏；多原材料可切换；右侧不足 640pt 时上下对照；缺失原文有说明。
- 产出追加到结果组。仅当人还停在这次任务材料上时自动预览结果，不抢剪贴板、其他材料、草稿或对话的焦点。
- 结果或剪贴板焦点下，先「用作材料」/「加入材料」再处理。失败且无文件：原因 + 返回材料重试，不提供复制或拖出。

**对话 / 终端**

- 只有「对话」打开对话区。右下方展开，与主工作台连接。收起、切换预览、进设置不销毁 PTY。
- 拖到列表 = 加入材料；拖到 AI 区 = 连同输入打进当前 TUI。没有会话时拉起该 Agent 的 TUI。发给终端写明「不是副本沙箱」。不解析 TUI、不模拟键盘点菜单。
- 预置 TUI 与芯片规则采用 DropAgent：Grok / Claude / Gemini / OpenCode / Cursor CLI / Codex / Kimi Code / CodeBuddy / Qwen Code；设置可加自定义 Runtime。快捷动作和 CLI Recipe 跟当前芯片。没有可收口 Job 入口的 TUI 不能跑动作，有 TUI 仍可发送。

**进货、出货、轮盘、快捷键**

- 接收：文件、文件夹、PDF、图片、纯文本 / Markdown、URL、网站抓取（标题 + 链接 + 正文 md + 截图）、多文件组合。先放着，不放下就跑。
- 菜单栏图标接拖入。拖文件约 0.18s 后，指针位置钉住六瓣轮盘：正上起顺时针为加入材料、发给终端、总结、抽取、翻译、转 MD。圆心空洞。出圈 + 16pt 消失，把拖还给底下 App。顶边 80pt 安全区不出轮盘。拖到已打开的 Shelf 工作面时藏轮盘，用面板落点。Recipe 瓣用默认选项立刻跑，不走确认页。设置 → 外观可关轮盘。轮盘不开关面板、不改 Goal 胶囊。
- ⌘V 把当前剪贴板直接上架。别处复制的本地文件自动进材料，不占剪贴板历史。隐蔽 / 密码类型不记历史。历史点选只预览，不上架、不改系统剪贴板；复制切为当前；加入材料走 Ingest；URL 走抓页。
- 全局快捷键（设置可改，必须带修饰键），默认与 DropAgent 相同：⌃⌥D 打开 / 关闭 Shelf 工作面；⌃⌥W 抓当前 Safari / Chrome / Edge 页；⌃⌥A 加入前台选中的本地文件。抓页与前台文件的权限、失败提示、不装扩展，整段采用 DropAgent 对应 spec。
- 拖出交系统认的货（文件 / 字 / 图 / 链接），多形态同时带，接不住弹回，不弹错误窗。默认复制，架子上还在。多选一次拖出所选项。落点保证与尽力清单采用 `02-prototype-design.md` 第 6 节。

**动作与引导**

- 六个 CLI Recipe + 本机文字提取（图 Vision，PDF 抽可选中文字）。动作栏可整理（显隐、拖换序）。用户快捷动作：类型 + 一句话，副本里跑，产出 `原名-动作.md`。不开放任意 Shell。
- 首次：空架子 + 试用示例 PDF（真实可抽字 PDF，经 Ingest 上架）。无 Agent、无授权、无网络可走完提取并拖走。可选自己的文件或跳过。设置「使用指南」可再试。权限按需，不前置。

**设置**

- 用途导航：使用准备、快捷键、能做什么、本机、外观、动作。使用准备含终端 Agent、辅助功能、Finder、已装浏览器。本机可加自定义 Runtime。外观可关轮盘。快捷键占用要标明。分段选择是真实按钮，选中底片短弹簧移动。

以上未点名、但 DropAgent `specs/` 里已接受的用户可见行为同样在范围内。发现遗漏时以 DropAgent 那份 spec 补进本文件，不静默砍掉。

### 做：图标色彩、样式、交互质感

Shelf 的目录段、工作面、确认条、空态、设置页、拖入罩、轮盘，完整采用 DropAgent 现行表面，不以 Molis `DESIGN.md` / `interaction-texture` 替换。对照物是正在运行的 DropAgent 与 `DESIGN.md`，不是 Coss 组件库。

**表面与文字（`Palette.swift` / `linear-workbench`）**

| Token | 浅色 | 深色 |
|---|---|---|
| 侧栏 / 外壳 | `#F5F5F4` | `#111112` |
| 内容面 | `#FCFCFB` | `#19191B` |
| 悬停加深 | `#EEEEEE` | `#242427` |
| 按下加深 | `#E8E9EE` | `#28282F` |
| 正文 | `#292A2E` | `#E9E9ED` |
| 辅助 | `#74757D` | `#96969F` |
| 发丝边 | `#E8E8E6` | `#2B2B2F` |
| 雾蓝强调 | `#66709E` | `#A6AFD5` |
| 主按钮字 | `#FAF9F6` | `#2B3142` |
| 选择 | `#D6DCEB` / 淡灰蓝底 + 高对比细边 | `#4D5874` |
| 终端井 | `#F8F7F4` | `#222329` |

近白与中性炭灰构成连续工作面。雾蓝只用于主操作、选择和焦点。正文保持中性。禁止绿色、发光、玻璃高光、装饰网格、渐变。错误另有警示符号和原因，不只靠颜色。文件内容与第三方终端 ANSI 色保留自身，不重涂。

**图标色组（固定映射，浅/深各有 ink + fill）**

- 雾蓝 slate `#647DB5` / `#91A8DC`：文字、处理、完成、Markdown、剪贴板、总结、图片抽字
- 钢蓝 blue `#5684AA` / `#8AB2D5`：网页、代码、JSON/HTML、抽取、翻译、链接
- 麦色 ochre `#A7803E` / `#C9A566`：文件夹、普通文件、快捷动作、整合、待处理、ZIP
- 灰紫 plum `#9270B1` / `#BC9ADA`：图片、对话、转 MD、终端
- 陶土 clay `#B27460` / `#D29C87`：PDF、PDF 抽字、脱敏、错误

类型靠图标和标签区分；禁用图标回到辅助文字色，不保留鲜明彩色。动作栏图标用同一张色组（`RecipeGlyph`），正文和整颗按钮不跟图标变成彩虹。

**样式**

- 系统字体 SF Pro / PingFang。欢迎 26pt、页面 22pt、确认 15pt、正文 12–13pt、辅助 11–12pt。不用等宽装饰分区标题。
- 主按钮：浅色深雾蓝底暖白字，深色浅雾蓝底深灰字。次要按钮休息态就是纸片 + 1pt 发丝边，不是裸字、不是系统灰钮、不是大色块。图标按钮同一套纸片、正方形。控件约 30–36pt 高、8pt 圆角。
- 目录 31pt 紧凑行，彩色小图标 + 文件名，选中淡灰蓝底，悬停轻底，无卡片边框与投影。组名可折叠，文件相对目录缩进一级。
- 右侧内容面内缩 7pt、9pt 圆角、1pt 细边；正文水平留白 42pt、顶部 35pt，对照时缩为 22pt / 24pt。
- 「编辑副本」、对照、复制、加入材料：同一套细边文字按钮。
- 轮盘：中性实底、细边、彩色图标，悬停浅底与描边，长标签换行。不做玻璃。
- 拖入罩半透明纸面，文案「加入材料」。
- 度量对齐 DropAgent：目录约 213pt、行 31pt、对照 640pt 阈值、窄预览 800pt 上下对照。挂进 Molis 时只让工作面吃剩余宽度，不把这些度量改成 Coss 密度来「适配」。

**交互质感**

- 能点的控件休息态就看得出是按钮（`paper-buttons`）。
- hover / pressed 是按进纸里：填充换成 `panelHover` / `panelPress`，按下再深；禁止用降低透明度把格子变浅（`paper-press`）。禁用整控件约 0.45 透明。
- 动效：普通 180ms ease-out；选择底片弹簧 response 0.28 / damping 0.88；罩层 220ms；到场曲线 `(0.16, 1, 0.3, 1)`、约 300ms。服务于 hover、pressed、选择、展开。`prefers-reduced-motion` 关闭位移与缩放，不闪整行字。
- 键盘焦点：高对比雾蓝轮廓。输入聚焦描边用正文色，不半透明靛紫光晕。
- 分段选择底片短弹簧移动，真实按钮，不是 tap 伪装。
- 动作整行默认无卡框，悬停才显底；选项用清楚勾选格。
- 鼠标按下后移出再松开不执行。

### 挂到 Molis 的唯一映射

- 左目录插件段 **Shelf** 就是 DropAgent 的左栏。右工作面就是预览 + 对照 + 底栏指令 + 对话。
- 架子数据是个人的，不进项目 Goal 账本，不是 Artifact。每个项目都能看到同一架子。结果只有用户再拖进 Frame 才进当前项目工作。
- 全局 ⌃⌥D：置前主窗口并打开 Shelf 工作面；若已在 Shelf 且窗口在前，则按 DropAgent 关面板语义隐藏主窗口。不另做第二套 1160×640 菜单栏浮窗。
- 菜单栏单击仍打开现有 Goal 胶囊。拖到图标 / 轮盘才是 Shelf 进货。两者不得互相抢走手势。
- **Molis 外壳**（48px 插件轨、标题栏、其他插件、Goal 胶囊）保持 Molis。**Shelf 表面**（该段目录、该插件工作面、轮盘、拖入罩、Shelf 设置）是 DropAgent 的色、字、按钮和质感。禁止把 Coss 靛紫、插件身份色、`interaction-texture` 的按压滤镜和焦点光晕套进这些表面。
- Recipe 工作目录是任务 `work/`，不是项目 workspace。可复用 Desktop 已有 Agent 探测与 PTY，调用语义必须是 DropAgent 的 Job / TUI，不是 Sessions 的 Goal 终端。

### 不做

与 DropAgent 第一版「不做」相同，外加：

- 不在本仓库改 DropAgent 源码，不把 Swift App 嵌进 WebView。
- 不把结果自动写成 Artifact / Goal 证据。
- 不改 Capsule 的 Goal「正在做什么」投影，不把胶囊重绘成 DropAgent 面板。
- 不把 Goals / Feed / Sessions 等其他插件改成 DropAgent 配色。
- Windows / Linux 第一版不做。

## 使用场景

DropAgent README 与 `01-requirements.md` 里的成功标准都要能在 Molis 桌面走通。代表性路径：

1. 拖报价 PDF 进 Shelf 工作面 → 陶土 PDF 标、雾蓝主按钮提取文字 → 结果组 `pdf.md` → 拖到桌面；原件 Hash 不变。
2. 没装 CLI：总结禁用并退成灰；抽字、预览、拖走仍可用。
3. Finder 拖文件，轮盘「总结」松手：进架子并立刻在副本跑；点菜单栏仍是胶囊。
4. Safari 里 ⌃⌥W：一条网站（钢蓝地球标）进材料。
5. 剪贴板历史点选只预览；加入材料后才能跑动作。⌘V 仍直接上架。
6. 对照原文三栏可读；编辑副本不改原件。
7. 点对话展开 TUI（灰紫），收起后再打开还是同一会话。
8. 浅/深主题下，Shelf 工作面与正在运行的 DropAgent 对照：侧栏/内容面/强调色/图标色组一致，按钮能看出可点，按下变深而不是变浅。

## 方案与关键决策

1. **复刻产品，不复刻仓库。** Module `shelf` 拥有架子、任务、剪贴板历史、Hash。Plugin 渲染目录与工作面，并带 DropAgent 的样式层（独立 stylesheet，不吃 Coss 强调色）。Desktop / Tauri 做拖入拖出、轮盘、全局快捷键、抓页、Vision/PDF、系统剪贴板。
2. **插件 id `shelf`，栏名 Shelf。** 默认启用，目录顺序在 Artifacts 之上。
3. **DropAgent 是验收原文。** 行为与视觉冲突时改实现，不改成 Molis 习惯。
4. **没有「先做子集」。** 工程可以按垂直切片提交，但完成定义是功能、交互、图标色彩、样式、质感全部复刻。不能把轮盘、剪贴板、对照原文、抓页、发给终端、动作整理，或雾蓝/五色图标/纸面按压标成 later 来结案。

## 输入输出与依赖

- 输入：本机文件/剪贴板/URL/前台浏览器/前台选中文件、已装 CLI、系统拖放；DropAgent Palette 与现行表面。
- 输出：架子条目、任务工作区、结果文件、目录与工作面、轮盘、隔离文案、Shelf 专用视觉层。
- 依赖：Workbench 目录分段与挂载槽、Desktop Tauri、Agent 探测与 PTY。
- 不依赖：Goals / Artifacts / Feed 写入、项目 workspace 规则、把 Shelf 画进 Coss 组件。

## 文件 / 模块边界

允许：`modules/shelf/**`、contracts 中 shelf 合同、`plugins/native/shelf/**`（含独立样式）、Workbench 挂载、Local Host HTTP、Desktop/Tauri adapter、`DESIGN.md` 写明 Shelf 表面跟 DropAgent 不跟 Coss、覆盖 DropAgent 行为与视觉的测试 / 对照图。

禁止：改 Goals/Feed/Inbox/Artifacts 领域写入；改 Capsule Goal 投影；改用户默认 home 做演示；在 DropAgent 仓库里改产品来迁就 Molis；把 `interaction-texture.ts` 的全局规则覆盖 Shelf DOM。

## 验收标准

1. DropAgent `01-requirements.md` 第 9 节成功标准，在 Molis 桌面成立。
2. `linear-workbench` 「场景与交互」7 条在 Shelf 工作面成立。
3. 轮盘几何与命中采用 DropAgent `specs/drop-wheel/spec.md`。
4. 剪贴板历史采用 DropAgent 当前约定。
5. 本机提取示例 PDF 闭环无需 Agent。六个默认 Recipe + 文字提取 + 自定义快捷动作按 DropAgent 输入输出跑。
6. 原件 Hash 不变；Prompt 不写原路径；不用指向原件的符号链接。
7. 单击菜单栏 = 胶囊；拖到图标或轮盘 = Shelf 进货。
8. **视觉：** Shelf 浅/深表面 token、五色图标映射、主/次按钮、选中行、轮盘、拖入罩与 DropAgent `DESIGN.md` + `Palette.swift` 一致；无绿色、无玻璃、无 Coss 靛紫焦点环。对照运行中的 DropAgent 与 Molis Shelf 同状态截图，颜色和质感不能再出现「差得很明显」。
9. **质感：** 休息态能看出可点；hover/press 加深；`prefers-reduced-motion` 无位移缩放；禁用退灰。
10. 定向测试覆盖进货、任务、结果、剪贴板、选择焦点。桌面拖入/拖出/轮盘/全局热键必须在真实 Molis Work.app 走。视觉验收必须看 Shelf 工作面，不能只看插件轨图标。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-shelf typecheck
pnpm --filter @molis-ai/molis-work-app-workbench typecheck
node --import tsx --test --test-concurrency=1 tests/shelf-plugin.test.ts tests/shelf-plugin.e2e.test.ts
```

对照 DropAgent 的 Check / `--e2e` 场景在 Molis 桌面复跑等价路径。浅/深 Shelf 工作面与 DropAgent 同状态截图放进 `.impeccable/review/shelf-plugin/`。隔离试用必须 `--home` 临时目录。

## 假设

- 第一版只做 macOS。
- DropAgent 源码与 `Palette.swift` 是色值与质感的执行参考，不合并进本仓库。
- 中英文案采用 DropAgent 已有用词（添加材料、提取文字、开始提取、用作材料等）。
- 插件轨上的 Shelf 图标可用雾蓝标记当前项；点进 Shelf 之后，目录和工作面必须是 DropAgent 表面，不能只改一颗轨上的图标。
