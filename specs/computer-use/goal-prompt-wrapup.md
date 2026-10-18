# Computer Use 收尾与能力补强 Goal Prompt

> 用法：新开一个会话，把「完整 prompt」整段作为首条消息；要持久 goal 时，把「Objective」填进 goal 的 objective。
> 写于 2026-10-18。依据：[spec.md](spec.md)、[goal-prompt.md](goal-prompt.md)、当前 main 的代码与门禁。

## Objective

收尾 Molis Work 的 Computer Use 线：补齐 `specs/computer-use/spec.md` 两项未完成验收，并按 P0→P1 顺序落地长任务可靠性、多窗口/对话框、视觉兜底与评测骨架；每项能力按合同、驱动、Swift 助手、测试四层实现，守住防腐线与并行开发规则，不引入兼容层、不新增旁路、不放大门禁数字，最后留下真实 macOS 验收记录。

## 完整 prompt

你是 Molis Work 仓库里的实现代理。这个 goal 只做一件事：把 Computer Use 线收尾，并把它目前最值得补的能力补齐；不重写、不换路线、不为了演示牺牲安全边界。

### 0. 先读，再动手

按顺序读：

- `AGENTS.md`（硬约束、构建与测试、协作）
- `PRODUCT.md`、`docs/SSOT-MATRIX.md`、`docs/system/ARCHITECTURE.md`、`docs/system/PACKAGE-BOUNDARIES.md`
- `docs/system/PARALLEL-DEVELOPMENT.md`（工作树、枢纽文件、构建与浏览器时段、子代理、清理、PR 体量）
- `docs/system/CONTRACT-CHANGES.md`（合同变更、快照、版本）
- `docs/system/SECURITY-INVARIANTS.md`（安全边界与拒绝测试）
- `specs/computer-use/spec.md`、`specs/computer-use/goal-prompt.md`
- `specs/repository-anti-corruption/spec.md`（防腐线）
- 相关包 README 的「开发要求」：`apps/local-host`、`apps/workbench`、`packages/contracts`、`packages/plugin-sdk`、`horizontal/agent-host`

读完后先用一段话复述：现状、你要做的切片、你不做什么。不要先改代码。

### 1. 现状（2026-10-18）

- Computer Use 已通过 PR #471、#480、#481、#493、#510 合入 main；代码在 `apps/local-host/src/computer/`、`apps/local-host/native/computer/`、`apps/workbench/src/side-panel-computer.ts`，合同在 `packages/contracts/src/services/ui-surfaces.ts`。
- `specs/computer-use/spec.md` 仍是「进行中」：17 条进度里 15 条已勾，只剩两项：
  1. 真实模型的跨应用验收（一次说完、二十步、电脑标签、文件记录、Shelf、对话引用、中途暂停、拒绝不换办法、禁区/终端/落点/自批/密码/锁屏各一遍）——走查最多停在 12 个 `computer-act`；
  2. Shelf 带截图放入的真机记录——代码和单测已有，真机只看到文字那次 200。
- 已知限制：`ROUND_TURNS = 24`；树最多 600 节点/22k 字符；观察 10 秒过期；只操作前台窗口；截图固定 1x、无 crop、无 OCR；没有评测骨架。
- 这些限制哪些是设计（不要动）、哪些是待补（要做），以 spec 的决策记录 D01–D19 为准。

### 2. 目标与非目标

**必须做完：**

- A. 收尾两项验收，留下可复核的真机证据。
- B. 长任务可靠性：桌面轮次预算、观察压缩、效果校验与卡住检测、zoom 入口。
- C. 多窗口/sheet/对话框/打开保存面板，以及语义定位/树搜索。
- D. 视觉兜底：本地 Vision OCR + crop/zoom，只在树不够时给模型图。
- E. 评测骨架：10 个场景，成功率/步数/耗时/token/拒绝率/接管次数。
- F. 过门禁、全量对比干净基线、更新 spec 与索引；做完则按 `specs/README.md` 归档。

**非目标（除非用户明确改口，不要做）：**

- 不改 macOS-only 的决定；不做 Windows/Linux/远程桌面。
- 不改成纯截图/坐标 agent；不引入 VM/云桌面作为主路径。
- 不做剪贴板、应用配方/长期记忆、专用 GUI 模型、MCP、插件声明应用、签名/公证；这些是后续切片。
- 不新增内置插件、不新增宿主旁路、不新增第二套注册表/名单。
- 不顺手重构 Computer Use 之外的模块；发现的问题记进 `specs/BACKLOG.md` 或最终报告，不在这个 goal 里修。

**完成定义与优先级：**

- 完成 = CU-G01–G14 全绿；真机不可用时 CU-G02–G04 可标 blocked，其余全绿，spec 不归档。
- 顺序：阶段 0 → 1 → 2 → 3 → 4；阶段 5 只在前面全绿后做。
- 如果只能做一个 P1：先多窗口/对话框（真实任务更常撞上），再 OCR/评测。
- 每个阶段结束停下来报告一次：改了什么、测试/门禁、证据、下一个切片；不要一口气做完再报。
- 先验证再改：阶段 0 的基线走查如果已经完成二十步或 Shelf 带截图，先记录并勾掉，不要为了“用上”新能力而改代码；代码切片只由复现出的缺口驱动。

### 3. 工作方式（防冲突、防腐）

1. **独立工作树。** 从最新 `origin/main` 建 `feat/computer-use-wrapup-20261018`，放在主检出之外；开工前 `git worktree list`、`git fetch origin main`、`gh pr list --state open`，记下在途 PR 与占用文件。不要在主检出改代码（4207 的真实 Home 在用），不要碰别人的未提交改动。
2. **切片推进。** 一次只做一个切片；每个切片先写失败测试或复现，再实现，再跑相关用例；一个切片一个提交，PR 体量按 `PARALLEL-DEVELOPMENT.md` 控制。切片之间不交叉改同一批文件；合同变更单独一个提交。
3. **冲突处理。** 动枢纽文件（`assistant-service.ts`、`computer-driver.ts`、`computer-desk.ts`、`ui-surfaces.ts`、`side-panel-computer.ts`）前先查在途 PR；能加新模块就不改大文件；必须改时先 rebase，冲突不猜，问用户或等对方合入。
4. **构建/测试。** 整台机器同一时间只跑一个构建、一个浏览器批次；全量只在集成分支跑；失败用干净基线工作树对比；只按 pid 停自己的进程；测试用 `node scripts/run-tests.mjs`，选用例先用 `node scripts/affected-tests.mjs`。
5. **防腐线（逐条守住）。**
   - 不留 `legacy` / `compat` / `@deprecated` / `backfill`；合同变更只认现行取值，调用方一起改，不写别名。
   - 测试不 import 包内部；不同时从源码和 `dist` 加载同一个包。
   - 一张表只由建它的包读写；共享表登记 `tooling/gates/table-owners.json`。
   - 不新增巨大单元；拆分而不是登记例外；不新增 `any`、`as unknown as`、空 `catch`、`console`、`debugger`；`biome` 配置只许更严。
   - 不放大 `page-assets`、健康门禁、动作合同快照、公开 API 快照的数字；要改就按 `--base origin/main` 重算，只许变小。
   - 新动作/新观察只走 Prologue 合同 + `packages/contracts`，注册一次，页面/工作流/Agent/MCP 共用；不在宿主另造绕过策略的通道。
   - 新错误码用 `defineErrorCodes("<主人>", …)`，不新写 `Error` 子类；错误码以主人名开头。
   - 安全边界变更同步 `SECURITY-INVARIANTS.md` 和拒绝测试，跑 `pnpm test:security`。
   - 文档：spec 状态句、验收编号、链接、索引、`BACKLOG` 一并更新；`pnpm health:check` 管文档引用。
6. **最小合同变更。** 能在 driver/helper 内解决的，不改合同：OCR 文本并入观察、窗口选择优先扩 `app` 动作的可选 `window`、树压缩在 render 层做。必须改合同时，单独一个提交，跑 `pnpm api:update`，写调用方影响；不把合同变更和行为变更混在一起。
7. **一个文件一个写入者。** 子代理只做只读调研或互不重叠的独立测试，不并发改同一批文件，不跑构建/全量；主代理负责合并与最终验证。
8. **不擅自推送/开 PR/发布。** 先问用户；推送前 `pnpm secrets:check`；不 force push。

### 4. 阶段与切片

#### 阶段 0：基线与复现（先做，不改产品）

- 建工作树/分支；记录 `origin/main`、在途 PR、其他工作树。
- 用当前构建跑相关用例：`computer-use-gaps`、`computer-use-act-loop`、`computer-use-task-done`、`assistant-tool-words`、S-25 安全用例；记录命令、项数、失败。
- 如果屏幕可用、模型已配置：按 `goal-prompt.md` 的验收清单做一次基线走查，目标不是通过，而是记录停在哪、为什么停（预算/拒绝/模型/机器）；屏幕锁着或有人在用就跳过，记下时间与原因，不锁屏、不猜密码、不发 Ctrl+Cmd+Q。
- 如果基线走查已经完成二十步，或 Shelf 带截图已经成功，先按验收记录并勾掉对应项；不要为了“用上”后面的代码切片而改代码。
- 把 spec 状态句补到 #510 之后，新增「下一步」指向本 goal；不要改已记录的旧证据。

验收：CU-G01。

#### 阶段 1：长任务可靠性（P0）

1. **桌面轮次预算。** 先量一次 20 步任务需要多少轮、每轮 token；再加 desktop 预算（例如 60）或按 `computer-act` 计数，保留 token 上限。测试：预算生效、超限文案、继续/收尾。
2. **观察压缩。** 树 diff/只给变化子树、折叠静态文本、按屏幕区域/可交互性筛选；保留 600 节点/22k 作为兜底。测试：大树、滚动、弹窗、密码框；记录压缩前后 token。
3. **效果校验与卡住。** 动作前后比较 `identity`/树 hash/关键区域；无变化在回执里明说；同一动作重复 3 次拒绝并提示换办法；测试：无反应按钮、遮挡、加载慢、焦点丢。
4. **zoom/裁剪。** 先做 driver 侧裁剪 + OCR 文本/坐标（不改合同）；确实需要把裁剪图交给模型时，再按 `CONTRACT-CHANGES.md` 加一条观察/回执能力，单独切片，不阻塞 OCR。helper 的 `observe.screenshot` 已支持 `rect`/`scale≤2`；密码框相交仍拒绝；测试：密集 UI 点击。

验收：CU-G05–G08。

#### 阶段 2：多窗口与语义定位（P0/P1）

1. **窗口选择。** 优先扩 `app` 动作的可选 `window`（标题或 id），不新增动作种类；观察包含 sheet/popover；打开/保存面板、打印、导出作为场景；helper 的 `app.state` 已有 `windows`/`popups`，先复用。确实不够再单独加 `window` 动作。
2. **语义定位/树搜索。** 按 role+name/regex 找控件，返回节点 id/坐标；减少上下文；测试：同名按钮、滚动后、窗口切换。

验收：CU-G09、CU-G11。

#### 阶段 3：视觉兜底与评测（P0/P1）

1. **本地 Vision OCR。** helper 加 `observe.ocr`，driver 把文本+框并入观察正文（优先不改合同）；只在树稀疏/无节点时用；OCR 文本按不可信内容处理；密码框遮罩；测试：Electron/canvas/游戏/远程桌面各一条。要做成模型可选的独立观察再走合同。
2. **评测骨架。** 10 个场景（TextEdit、计算器、Mail 附件、Excel/Word 导出、Finder 整理、Electron、画布、终端只读、禁区、自批/落点/密码），一条命令跑；输出成功率/步数/耗时/token/拒绝率/接管次数；可用 fake helper，真机场景单独标记。

验收：CU-G10、CU-G12。

#### 阶段 4：真机收尾（必须）

- 20 步一次说完：真实模型、隔离 Home、独立端口；记录 work/record id、步数、耗时、文件、Shelf、对话引用、暂停/接手、拒绝不换办法；完成判断看窗口标题/文件/记录，不信模型口说。
- Shelf 带截图：真机放文字+PNG，验证回滚；记录 item id。
- 拒绝：终端打字、系统设置、被挡落点、自批、密码截图；能一次跑完就一次，跑不完分次；每条记 `refused` 或「未复现+原因」。
- 机器不可用：不伪造，不锁屏，不输密码；留下 runbook 和已完成的代码切片，标 blocked。

验收：CU-G02–G04。

#### 阶段 5（可选，绿色才做）

文件工作流（打开/保存/拖拽/附件）、延迟优化、多显示器/Retina 验证；每项单独切片，不阻塞收尾。

验收：CU-G15（若做）。

### 5. 验收编号

- **CU-G01 基线**：工作树/分支/在途 PR 记录；目标用例结果；基线走查记录或 blocked 原因。
- **CU-G02 二十步**：真机一次说完，work/record id、≥20 步、电脑标签、文件记录、Shelf、对话引用、暂停/接手、拒绝不换办法。
- **CU-G03 Shelf 带截图**：真机 item id、文字+PNG、回滚。
- **CU-G04 拒绝真机**：终端打字/系统设置/被挡落点/自批/密码截图，每条 `refused` 或「未复现+原因」；锁屏/在场/驱动不可用沿用旧记录。
- **CU-G05 预算**：20 步不被 24 轮截断；测试 + 实测 token。
- **CU-G06 观察压缩**：大树/滚动/弹窗/密码框测试；压缩前后 token；可点节点不丢。
- **CU-G07 效果/卡住**：无反应、遮挡、加载慢、焦点丢；重复动作 3 次拒绝。
- **CU-G08 zoom**：密集 UI 点击；密码框相交仍拒绝。
- **CU-G09 多窗口/对话框**：打开/保存/打印/导出场景；窗口选择测试。
- **CU-G10 OCR**：Electron/canvas/游戏/远程桌面；OCR 不可信；密码遮罩。
- **CU-G11 语义定位/树搜索**：同名按钮/滚动/切窗测试。
- **CU-G12 评测骨架**：10 场景一条命令；指标输出。
- **CU-G13 门禁**：`pnpm build`、`pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main`、`pnpm test:security`、相关用例、全量 vs 干净基线无新增失败；`api`/`actions` 快照；`page-assets` 只降。
- **CU-G14 文档**：spec 状态句/清单/决策/§8；索引；`BACKLOG`；做完归档。
- **CU-G15（可选）**：文件/延迟/多显示器各自的测试与真机记录。

### 6. 证据

- 代码：提交列表、改动文件、测试文件；每个验收编号在测试名或注释里出现。
- 门禁：命令、退出码、前后数字；全量对比的基线提交与失败文件清单。
- 真机：macOS 版本、模型、Home 路径、work/record id、时间、步数、日志、截图；不记录密码，不把截图放进仓库的 `.impeccable/`（新增图会被门禁拦）。
- 成本：20 步任务的 token、每步观察 token、耗时；压缩/预算前后对比。
- 拒绝：每条 `refused` 的 record id、错误码、摘要；未复现的写原因。

### 7. 停止/询问规则

- 屏幕锁着、人在用、模型没配、别的全量在跑：不硬来，记录并继续不依赖真机的切片。
- 合同变更会破坏调用方或需要升版本：按 `CONTRACT-CHANGES.md` 做，更新快照，写影响；不确定先问。
- 安全边界变化（剪贴板、外发、密码、禁区）：同步 `SECURITY-INVARIANTS.md` 和拒绝测试；会放松就停下问用户。
- 门禁数字会变大：拆分或推迟；不改 `scripts/gates`、`limits.json`、`biome.jsonc` 来放行；确实做不到就问用户。
- 与在途 PR 冲突：等/串行，不复制一套。
- 要推送、开 PR、发布：先问用户。

### 8. 交付

- 分支与提交；代码 + 测试；spec 更新；证据记录。
- 最终报告：做完什么、没做什么、门禁结果、真机证据、剩余缺口、下一批切片。
- 工作树与分支用完清理；不删别人的。
