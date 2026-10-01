# Molis Work Onboarding QA

## 2026-09-01 当前生产修订：纯净背景、半幅内容与黄金分割

本轮按最新纠偏移除 Goal Spine 背景，科技感改由真实交互状态承担；首屏内容视觉中心落在视口高度约 `61.8%` 的下黄金分割点，不再垂直居中。

- 背景为单一 `#f1f3f2` 中性色面；页面 DOM 中 SVG 数量实测为 `0`，没有连接线、节点、分区图形或远程背景资源；
- 1440×900 实测首屏 flow 为 `480×201.3px`，主要输入为 `360×46px`，标题 `20.88px`；视觉中心为视口高度 `62.8%`；
- 390×844 实测首屏 flow 为 `350.4×207.2px`，主要输入为 `350.4×48px`，标题 `20px`；视觉中心为视口高度 `62.7%`；
- 桌面与移动端横向溢出均为 `0`；手机首屏主操作底部约 `633px`，无需滚动即可到达；桌面 Runtime 步骤使用自然纵向滚动承载完整操作；
- 步骤状态使用 `01 / 04 · 说说想法`，确认后回答收拢为带状态点的“我们一起……”上下文；输入就绪、焦点和步骤装载使用 100–460ms 的一次性状态动效，无背景循环；
- 人话校准后的四个问题为：`你希望我们一起做什么？`、`给项目取个名字吧。`、`接下来，你想在哪里继续？`、`这样开始，可以吗？`；安全说明仍明确保留“不自动执行、不替用户发送”；
- 在本地 in-app browser 实测首屏、第二步回执与 Runtime 步骤；浏览器 console / warning 为空；
- `pnpm typecheck`、`pnpm build` 通过；首次跳转与跳过、真实 Project / Goal / Workspace 写入、版本更新三条 Onboarding 定向测试全部通过。

完成等级保持 **Level 3：功能可用的生产垂直切片**。真实 Runtime 自动打开与提示填入本轮未重复手测，沿用既有功能测试证据，不将其表述为本轮新验证。

下文为早期 Level 2 原型与上一版生产视觉的历史 QA 记录，不再代表当前首屏。

## 2026-09-01 二次修订：Goal Spine 轻量工作面

本轮根据“一屏占比太大、不能照抄参考图风格”的纠偏，撤销上一版浅色雾面 Hero。旧版北欧冬晨原型记录保留在下文，只作为历史证据，不再代表当前生产首屏。

- 保留 Peace、克制科技感与人话文案；移除柔焦布景、低位大标题、大型白色输入框和悬浮按钮；
- 背景改为平坦暖灰工作面与右侧冷灰 Goal Spine：一个根节点、两个结果分支和未完成端点，直接来自 Molis Work 的产品结构；
- 1440×900 实测首屏内容区 `660×198.7px`，标题 `27.36px`，主输入 `600×54px`；
- 390×844 实测首屏内容区 `350.4×198.6px`，标题约 `24.99px`，主输入 `350.4×57.6px`；
- 1440×900 Runtime 步骤高度 `423.3px`，操作区底部约 `720px`，6 个选择项高度 `52–54.4px`；无横向溢出或关键操作遮挡；
- 浏览器 console / warning 检查为空；`prefers-reduced-motion` 继续取消非必要动效。

定向生产验证：`pnpm build` 通过；首次跳转与跳过、真实 Project / Goal / Workspace 写入、版本更新三条 Onboarding 测试全部通过。真实 Runtime 自动打开与提示填入本轮未重复提交，沿用既有功能测试证据。

## 历史 Level 2 原型结论

原型达到本阶段约定的 **Level 2：可交互高保真切片**。首次安装不再像功能介绍或配置向导，而是一段从黑夜到晨光的渐进对话：黑屏停顿后只出现“你好，我们今天做点什么？”和一个无边界填空位置；用户逐步说清项目、结果与工作环境，Molis Work 才显露 TUI 和第一棵 Goal Tree。版本更新沿用同一套视觉语言，但使用独立的短路径，不会重放初装问题。

上一轮完整视觉世界通过了 Impeccable finish review。本轮是在其上完成的窄范围 polish：移除所有装饰线、替换 Hover 反馈并重做 Goal Tree；按 polish playbook 完成两轮内的浏览器检查。这个结论只适用于 Level 2 原型，不表示生产 Runtime 与数据链路已可用。

## 已走通路径

使用本机 Chrome 完整操作并截图检查：

1. 纯黑抵达页缓慢显出第一句问题；
2. 填写第一个项目与四周后的真实结果；
3. 选择已检测 Runtime；
4. 填写 Workspace；
5. 检查交接摘要和安全边界；
6. 打开新 TUI Session，确认提示词为“已填入、尚未发送”；
7. 主动发送后生成 Goal Tree Proposal；
8. 用户确认 Proposal 后进入冬日白色的激活完成态；
9. 使用 `?journey=update` 进入版本更新短路径。

结果：通过。浏览器没有捕获脚本异常或 console error；原型没有自动发送提示词、自动接受 Goal、自动修改代码或覆盖 Runtime 配置。

## 视觉与渐进动效

- 首屏保持 350–500ms 的黑场停顿，再用 900–1200ms 显露冷色冬晨环境光和正文；
- 页面没有中央卡片、功能清单、步骤导航、分隔线或蓝色科技线，第一视口只保留一句问题、一个由光标和柔光定位的填空位置、品牌和跳过入口；
- 每次回答都会成为低调的上文，同时环境光略微增强，但下一步仍只有一个视觉焦点；
- TUI 是流程中第一个明确色块，用深浅与内缩表达“现在进入真实工具”，不使用描边；
- Goal Tree 只在 Proposal 阶段显形；根 Goal、两个结果分支和第一条行动由字号、位置、明暗与依次生长的动效组成，不再绘制连接线或节点卡片；
- Runtime、主次操作、返回和 TUI 按钮的 Hover 改为柔光、轻微抬升、位移与亮度变化，不再使用下划线生长或描边变色；
- `prefers-reduced-motion: reduce` 实测命中：启动等待被取消，房间与环境光动画约为 `0.001ms`，标题直接可见，主路径仍可使用。
- 原型已随包提供 `fonts/Manrope-Variable.ttf` 和 `fonts/OFL.txt`；拉丁字形使用本地 Manrope，中文按 `PingFang SC` → `Noto Sans CJK SC` → `Microsoft YaHei` → `Source Han Sans SC` → 系统无衬线顺序回退。
- quiet、placeholder 和 terminal 辅助文字的对比度已提升，在保留次要层级的同时达到 reviewer 可 ship 基线。
- 滚动条已使用当前表面的 rule 色与透明 track 主题化，深色与成功态不会突然出现浏览器默认滚动槽。

结果：通过。

## 键盘、表单与辅助语义

- Runtime 选择使用 native `fieldset` / `legend` 与 radio，选择控件之后是独立的“继续”按钮；
- 已在真实 Chrome 中验证：标题获得焦点后，`Tab` 到当前 checked radio，再 `Tab` 到“继续”，按 `Enter` 成功进入下一步；
- 项目、结果与 Workspace 输入错误均通过 `aria-describedby` 关联对应的错误文本，校验失败时将 `aria-invalid` 设为 `true`。
- 在当前 in-app browser 中实测项目名和结果输入 `1`：页面停留在原步骤、`aria-invalid=true`，并提示不能只填数字或符号；有效中文输入可继续进入 Proposal。
- Proposal DOM 与截图确认使用 UTF-8，Manrope 已加载；用户文案统一为“目标树、根目标、结果分支、可执行行动”，不再显示 `canonical`、全大写 `GOAL` 或 `Goal和1` 一类内部术语与粘连文本。

结果：通过。

## 响应式与关键画面

### 桌面 1440×900

- 抵达、交接、TUI、Proposal、激活完成和版本更新均已截图检查；
- 页面宽度与 viewport 同为 1440px，无横向溢出；
- 首句在桌面保持单行，正文内容区宽 960px，仍有足够负空间；
- 所有关键状态均在单屏内可读，操作可达。
- 新 Goal Tree Proposal 的 document 与 viewport 同为 1440×900，确认操作无需滚动即可到达。

### 移动端 390×844

- 页面宽度与 viewport 同为 390px，无横向溢出；
- 首句自然折为两行，无边界填空和下一步操作保持清楚；
- 可见交互目标最小高度为 44px。
- Goal Tree Proposal 使用单列层级，页面高度 1159px，由正常纵向滚动承载；没有横向溢出或被遮挡的内容。

### 窄屏 720×900

- 页面宽度与 viewport 同为 720px，无横向溢出；
- 一次一问的结构、留白和低光环境均保留，没有退回卡片列表；
- 文本、输入和操作完整可见。

## 静态与机械检查

执行了内联 JavaScript 语法检查和限定文件的 diff 检查，结果通过。

Impeccable detector 在本机因为缺少 `htmlparser2`、`css-select`、`css-tree` 和 `domutils`，降级为正则扫描。扫描指出四项机械风险：选择项的 `padding` 过渡、两个 `width` 过渡，以及工作状态的无限扫描动画。已分别改为 `transform`、固定宽度配合 `scaleX`，并把无限循环改为一次性动画。按照 Impeccable 的单次扫描约束没有重复运行 detector，因此这里记录为“发现项已修复”，不把降级扫描表述为完整审计通过。

## 未完整验证

- 没有接真实 Runtime、PTY、数据库、文件选择器或 Goal 写入，符合 Level 2 非目标；
- 没有运行仓库生产 typecheck、build 或完整 test，本次只修改独立 Spec 与静态原型；
- 原型已在真实 Chrome 中通过 Runtime 关键键盘路径；未做完整屏幕阅读器走查，生产实现仍需重新验证整体 Tab 顺序与辅助技术体验；
- 动效节奏已经通过桌面、移动端和 Reduce Motion 截图与 DOM 数据检查，最终的情绪质感仍以人工观看为准。

## 本轮 refinement 边界

- **保留：** 北欧冬晨、一次只问一个问题、安全边界、TUI 交接和 Goal Tree 的真实层级；
- **替换：** 输入基线、进度线、列表分隔线、按钮下划线、终端描边和树连接线，改为留白、色块、柔光、明暗与空间层级；
- **重做：** Goal Tree 从机械 SVG 连线图改为无连线的 Goal Grove，先出现根结果，再展开两个结果分支，最后托起第一条行动；
- **忽略：** 旧截图中的机械连线和条目表格语法，不让它继续影响后续实现。

## 2026-09-01 生产单屏步骤修订

本轮在生产 `/onboarding` 而非静态原型中完成了单屏舞台、独立流程导航、双向步骤动画和轻量选择列表验证。

- 生产构建 `pnpm build` 通过；`pnpm typecheck` 通过；Onboarding 两条定向 Web 测试通过，覆盖跳过、真实 Project / 根 Draft Goal / Workspace 写入、意图值拒绝与 `work-diagnose-fix` 规划线索落入 Draft 待澄清上下文；
- 首步撤掉原生下拉灰盒与完整输入框容器，闭合状态只保留文字触发器、chevron 和一条功能性输入基线；展开菜单为 8 条单列轻列表，当前项使用浅灰底和右侧 cobalt 状态点；
- 意图菜单实测支持鼠标与键盘：`ArrowDown` 打开并移动焦点，`Enter` 选择 `我想做成` 后菜单关闭，前缀和 placeholder 同步更新；展开时菜单顶部约 173.8px、底部约 496.8px，仍在窄屏视口内；
- 前进实测 `data-step-direction=forward`，返回实测 `backward`，切换期间 `data-transitioning=true` 防止重复触发；鼠标点击与键盘 Enter 均可进入下一步；
- Runtime 不再展示卡片矩阵或未安装项，只显示“这次先跳过”和当前检测到的 Codex、Claude Code、Grok Build；四行均为 44px 单列文字行，选中行以浅灰底和状态点表达；
- 窄屏有效视口 389×841 下 `documentElement.scrollHeight === innerHeight`；第三步整体上移后提示底部约 715.75px，独立导航顶部约 776.8px，全部内容单屏可见且没有重叠；Review 沿用上一轮单屏验证结果；
- `prefers-reduced-motion` 继续由现有媒体查询把动画压缩为即时切换，表单和按钮状态不依赖动画成立。

结果：通过。浏览器控制台没有捕获 error 或 warning；没有提交最终创建按钮，避免视觉 QA 写入额外真实项目。

## 2026-09-01 条件式第五步：引导内 Runtime 规划

本轮把“创建后跳进 Runtime 工作台”改为条件式第五步。测试数据全部写入 `/private/tmp/molis-work-onboarding-live-v*`，没有修改用户的真实 Molis Work Home。

- 选择 Runtime 时，第 4 步先创建真实 Project、根 Draft Goal 与 Workspace；顶层 URL 继续保持 `/onboarding`，第五步 iframe 使用真实 Goal 深链接和 `onboarding-runtime=1&onboarding-embed=1`；未选 Runtime 仍直接进入项目；
- iframe 实测只保留根 Goal 绑定信息、当前 Runtime、真实终端和状态；Molis Work 目录、Goal 正文、移动标签、状态胶囊、添加终端、关闭终端和重复的推进 / 复制 / 填入工具条均不显示；
- Codex 在 `/private/tmp` 出现目录信任确认时，父页显示等待状态，`安排好了，进入 Molis Work` 为 disabled；安全选择拒绝信任后，进程退出，父页保留已创建项目并给出原位“重新打开”；
- Codex 在仓库工作目录出现 Hooks 复核时，父页同样保持 disabled。选择 `Continue without trusting` 后，系统等待正常 `Ask Codex to do anything` 输入位出现，再填入带项目说明、根 Draft、项目规划组合、一次一问、Goal Tree Proposal 与用户确认边界的 onboarding prompt；终端没有发送回车，父页此时才启用最终进入操作；
- 桌面有效视口 819×576 下，页面 `scrollWidth×scrollHeight` 与 viewport 完全相同，Runtime 底部约 514.2px；窄态有效视口 312×675 下同样无页面滚动，Runtime 底部约 619.4px，最终操作、说明、终端和状态均在一页内；
- 第五步视觉截图确认：外部保持平坦暖灰与小字号线性导航，内部只有一个必要的真实 Runtime 视口；没有背景线条、粒子、发光边界或多余卡片。

验证命令：`pnpm typecheck`、`pnpm build`、`node --import tsx --test tests/i18n.test.ts tests/visual-foundation.test.ts`、定向 Desktop TUI / Onboarding Web 测试均通过。一次未授权回环监听的测试在沙箱内得到 `EPERM`，允许仅监听 `127.0.0.1` 后相同测试通过。

结果：通过。第五步达到 Level 3 的真实功能切片；它确保 Runtime 和首次规划提示已经就绪，但“项目是否已经安排满意”仍由用户在完成本轮对话 / Proposal 后主动点击最终进入操作，不用前端伪造 Goal Tree 完成事实。
