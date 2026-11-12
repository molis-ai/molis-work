# 第 27 批 Coding 围栏原文与逻辑行

状态：用户 2026-11-11 选 B1（换 Micromark），第 27 批主会话已实施，实现记录见文末；两处可见差异待用户确认。设计 2026-11-09（设计 Codex）。本片交付目标沿用 [VUX-33、VUX-35、VUX-36](../../spec.md#code-diff) 的 Coding 余项，先取得工程和隔离实操证据。真实规模由第 56 批验收，本人实物验收依主规格安排。

## 目标与前置

[27-2](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-2) 的 Assistant 和 Diff 切片已接入。本片处理 Coding 报告和对话共用的 SDK 富文本入口。基点 `d4c725c77` 上，[SDK 富文本](../../../../packages/plugin-sdk/src/rich-text.ts) 先 trim 全文，Marked 18.0.11 归一化行尾，列表会扩 tab 并裁末项，默认围栏 renderer 强制加一个尾 LF。Coding 从 Host 渲染的 `<pre><code>` 读取文本，着色和复制已继承这些损失。保住 SDK 入口中的原文后，CR-only 又会遇到现役着色和布局分块只认 LF 的问题。

`depends_on` 为公共 C 对 `/rich-text` 行为、安装合同和 `/highlight` 行边界的合审，以及 Coding、Feed 消费方核对。统筹先确认文件归属与在途改动，再安排共享源文、共享着色与 Coding 分块的两次相邻提交。安装清单和锁由一个写手串行处理，两次提交共用一套验收。Assistant、Diff 沿已交付动线做消费者回归。第 06 批的共享文件嵌入仍按其独立设计推进，若进入相同路径由统筹排序。

## 原文行为

SDK 输入仍是现有的可空字符串，返回现有的清洗后 HTML 或压缩纯文本。真正的顶层、引用、列表、引用与列表组合围栏保留解析器识别出的逻辑代码。解析器去掉容器和围栏缩进前缀。一个 tab 仅在部分列被结构消费时以余下列宽对应的空格交付，完整留在正文内的 tab 原样保留。保留正文中的 LF、CRLF、CR、前后空格和空行。

| 输入或边界 | 交付的正文 |
| --- | --- |
| `~~~~ts\nx`、`~~~~ts\nx\n`、`~~~~ts\nx\n\n` 开放到输入末尾 | 分别是 `x`、`x\n`、`x\n\n`。开围栏的分隔符归结构，正文尾部的实际行尾均保留。 |
| `~~~~ts\nx\r\n~~~~`、`~~~~ts\nx\r\n\r\n~~~~` 闭合 | 分别是 `x`、`x\r\n`。闭合前只扣一个分隔符。 |
| `- > ~~~~ts\r\n  >   \tconst row = 1;  \r\n  > \r\n  > ~~~~` | `  \tconst row = 1;  \r\n`。列表和引用前缀由解析器消费。 |
| `> ~~~~ts\r\n> x  \r\noutside` | 围栏正文 `x  `，紧贴退出的一条分隔符归容器。容器内更早的空行保留，`outside` 仍是普通正文。 |
| 正文相同但行尾不同的两个真实围栏，旁边有原始 HTML 或四空格缩进中的同文假围栏 | 两个真实 token 分别按自己的原文位置取值，原始 HTML 和缩进代码沿普通渲染路径。 |

## 方案和已证证据

| 路线 | 已证与采用条件 |
| --- | --- |
| A 保留 Marked 18.0.11 | 实际 `fences` hook 收到的顶层输入已归一化为 LF，顶层可用原行尾表逆映。嵌套样本的正文 tab 到达 hook 时已变成四个空格。列表末项 trim、tab 展开及引用懒续行重入都发生在围栏之前。固定版扩展接口无法把这些转换逐段映回原输入。完整保留 Marked 需要上游给出位置及容器映射。复制容器实现或对齐两套解析器会引入第二份语法判断，混合闭合标记已给出判定分歧。 |
| B1 Micromark 4.0.2 与 GFM 3.0.0，推荐合审 | 19 个样本的真实围栏原文通过现行清洗与 HTML 文本回读，包括开放末尾、容器退出、嵌套、重复和恶意字符。固定 Feed 混合正文样本的规范化 HTML 一致。约 14,291 字符的合成输入，精确原型与 Marked 中位分别约 2.19 ms 和 0.16 ms。约 400,000 字符时，标准解析与清洗分别约 62.4 ms 和 2.4 ms。后一数字只反映 Node 静态循环，Coding 路径性能待证。 |
| B2 Markdown-it 15.0.3，性能备选 | 24 个样本通过。`fence.map` 是物理行范围，`content` 已去容器前缀。缺尾 EOL 时加虚拟 LF 让正文每行可计数，以 `end - begin - 1 - 正文行数` 判闭合，再用原物理行尾表还原。虚拟 LF 还需验证普通 HTML 的末尾行为。约 14,249 字符的精确原型中位 0.30 ms，约 400,000 字符标准解析与清洗 3.45 ms。已试生成的删除线标签与表格对齐适配，任务列表标记、单波浪删除线、`www` 自动链接和被拒链接的显示仍有差异。缺少相同行为证据时不能接管共享入口。 |

实验使用本地固定 Marked、现行 `sanitize-html` 配置和固定公开候选版本。重现时先逐项用公开解析入口打印 token 范围及正文，再通过基线 SDK 的同一白名单清洗。先模拟 HTML 行尾预处理，再回读 `<pre><code>` 文本并逐字比较。安全样本包含闭标签、脚本、带引号的语言名及字面 `&#13;`。临时脚本曾位于 `/private/tmp/molis-rich-text-probe.g16IAm1v/` 的 `fence-probe.mjs` 与 `markdown-it-fence-probe.mjs`，需指向有基线 SDK 构建物和固定依赖的工作树。上表及验收样本足以在仓库测试中重建，临时路径只作实验索引。[Marked 扩展接口](https://github.com/markedjs/marked/blob/master/docs/USING_PRO.md) · [Micromark 4.0.2](https://github.com/micromark/micromark/tree/4.0.2) · [Markdown-it 15.0.3](https://registry.npmjs.org/markdown-it/15.0.3)

上面的 `- >` 样本在 Micromark 的围栏范围是 `[4, 51)`，`codeFlowValue` 是 `[16, 35)`，编译后正文为 `  \tconst row = 1;  \r\n`。着色另用生产 `codeTokens` 与 `growCodeTokens` 复现 `// first\rconst second = 2;\rconst third = 3;`。现行实现把整段标为注释，尾追加从偏移 0 重分。同样三行用 LF 或 CRLF 时，注释在首行结束，分别从偏移 25 或 26 重分。

直接 npm 包解包体积约 230 KB（Micromark 与 GFM，传递依赖另计）和 2.06 MB（Markdown-it，含分发文件）。实验的浏览器 bundle 分别约 77.2 KB 和 124.7 KB，Marked 现有库文件约 43.8 KB。当前 `/rich-text` 生产导入在 [Coding 服务端](../../../../plugins/native/coding/src/rich-html.ts) 和 [Feed 服务端](../../../../plugins/native/feed/src/stage-ui.ts)，页面收到渲染后的 HTML。解析器体积用于评估依赖成本，实际页面资源变化由候选构建和 Host 测量。`/highlight` 及 painter 的改动会进入客户端资源。

## 推荐实现

1. 在同一个 `renderRichText` 中从原输入去掉现行的起始不可见字符，空白输入照旧为空。围栏分类前保留物理缩进和尾部。Micromark 用一次 `preprocess`、`parse`、`postprocess` 产生事件。复用标准 GFM 的表格、删除线、任务列表和自动链接，禁用现行 Marked 未提供的脚注构造。编译时停用 GFM tagfilter 的原始 HTML 渲染钩子，保持原始 HTML 由现行清洗器决定去留。普通语法仍由解析器判定。
2. 以 `codeFenced` 事件和 `codeFencedFence` 的次数取得围栏与闭合状态。用对应上下文的 `sliceSerialize` 取 `codeFlowValue` 和 `lineEnding`，跳过 opener 的分隔符。单个行尾 token 的 offset 范围可能跨到下一行的容器前缀，因此按独立 token 取逻辑内容。闭合去掉一个尾分隔符。开放在容器退出时用 token 终点和邻接原字符判定分隔符是否已收进正文，已收进才扣。开放到 EOF 时补回留在 token 外的真实最后一条行尾，只有 opener 的空块仍为空。边界查看限在邻接字符，遍历事件与输出字符各一次，来源索引和编译状态随每次调用释放。随后用该事件流编译正文，生成原形状的 `pre > code.language-*`。
3. 围栏内容和语言标签分别转义。原型把已转义围栏文本中的 CR 暂存为 NUL，输入 NUL 及 HTML 的 `&#0;` 会归一化为替换字符。现行清洗器的文本回调只在 `code` 文本中把临时 NUL 输出为 `&#13;`。浏览器先归一化原始 HTML 中的 CR，随后解析实体，所以这一步在清洗的文本回调输出中完成。所有结果仍经过原白名单、协议及非文本标签拒绝，异常沿现有安全纯段落回退。原始 HTML `pre`、缩进代码、普通 Feed 摘要走既有语义。原型还需对照这些样本的完整可见结果和普通文本链接行为。
4. `/highlight` 的普通代码行搜索、行注释与回改偏移和 Coding painter 的分块都识别 LF、CRLF、CR。CRLF 作为一个逻辑换行，保留 JS 字符串偏移，跨快照从尾 CR 到 CRLF 也按同一规则重分。着色片段仍拼回原串，浏览器可继续携带现有零 import、自包含的 SDK 函数。Coding 保留 `growCode` 的现役原文与复制路径，闭合扣除分隔符按尾部回改处理，保持同块、按钮及未改着色前缀。实测 CR-only 可视行与折行。

现有 GFM/HTML 可见行为与真实长路径性能都须通过，才采用 B1。隔离比较若出现性能退化，按现有 VUX 门槛和路径数据交统筹裁决。若 B1 过不了，B2 也须先补齐有证差异或取得相应语义决定。两种候选均无法满足时，完整原文仍是待交付项。

## 写入边界与决策

| 用途 | 合审后拟允许的文件 |
| --- | --- |
| 公共行为 | `packages/plugin-sdk/src/rich-text.ts`、`packages/plugin-sdk/src/highlight.ts`。`renderRichText`、`richPlainText`、`/highlight` 的签名与导出预计保持。API 快照用作只读对照，若需改形状先回合审。 |
| 依赖与说明 | `packages/plugin-sdk/package.json`、`packages/plugin-sdk/README.md`、`plugins/native/coding/package.json`、`plugins/native/feed/package.json`、`pnpm-lock.yaml`。Coding 与 Feed 同步直接依赖和 `molis-work.extraDependencies`。`apps/workbench/package.json` 有旧直接声明，只有验证其发布装配实际提供这些 peer 时才同步这组依赖，先交统筹确认。Pages 自用的 Marked 属其独立入口。 |
| Coding 消费 | `plugins/native/coding/src/code-paint-client.ts` 的逻辑行与分块。`plugins/native/coding/src/rich-html.ts`、`plugins/native/coding/src/browser/main/code.ts`、`plugins/native/coding/src/browser/main/run-turn.ts` 沿用现有调用链作为验证入口。 |
| 定向用例 | `tests/plugin-sdk-rich-text.test.ts`（拟新增的公开 SDK 精确和安全用例）、`tests/plugin-sdk-subpaths.test.ts`、`tests/plugin-sample.e2e.test.ts`（现有离线夹具补 `/highlight` 加载）、`tests/feed-rich-content.test.ts`、`tests/code-incremental-colour.test.ts`、`tests/code-incremental.e2e.test.ts`、`tests/code-scale.e2e.test.ts`。Assistant 与 Diff 先复用现有 `tests/assistant-text-html.e2e.test.ts`、`tests/code-diff-reader.e2e.test.ts`。若需新增消费者断言，按各文件归属交统筹。 |
| 设计与记录 | 本工作项。主视觉规格、批次清单与整批证据由统筹更新。 |

新解析器与 GFM 依赖仍只由 `/rich-text` 加载，沿用可选 peer 与 SDK 开发依赖设计，普通外部插件仅装 contracts 和 SDK 的离线路径继续成立。已经使用 `/rich-text` 且只声明旧 Marked 和 sanitizer 的插件需要声明新 peer，导出签名稳定也须由公共 C 确认这项安装合同、内外消费者切换及离线包证据。[SDK 安装说明](../../../../packages/plugin-sdk/README.md#富文本子路径-rich-text) · [合同变更流程](../../../../docs/system/CONTRACT-CHANGES.md)

VUX-33 已授权围栏原文和边界修复，普通 HTML 序列化空白差异按可见内容比较。现有 `    real code\n    not paragraph` 因全局 trim 显示为段落，候选可能显示为缩进代码。现有 ```` ```js\nx\n```~\n\nnext ```` 可让 `next` 成为普通段落，候选可能将其放进仍开放的围栏。若这些差异在候选中保留，向统筹提交精确输入及两边结果，由统筹对实际用户可见语义集中裁定。页面资源有必要增长时先审，单项实际 Host 字节增长超过 10,000 或出现新资源时由统筹先问用户。库包体积本身不触发该门槛。放宽清洗、门禁、安装边界或新增兼容路径需要另行定范围。[开发流程](../../../post-anticorruption-roadmap/reference/development-workflow.md) · [页面资源体积](../../../../docs/cli-and-development.md#页面资源体积)

## 开工前检查

| 项 | 判定 |
| --- | --- |
| 1 事实主人 | Coding 仍拥有原回合与报告，Feed 拥有正文。SDK 共用无状态渲染及着色，原文取当前输入。 |
| 2 插件同等待遇 | 内置与外部经同一公共 SDK 子路径，照常由 Plugin Runtime 装配。 |
| 3 能力注册 | 不涉及。沿用既有动作、可信上下文与调度。 |
| 4 合同 | 公开签名、动作和路由形状预计保持。可选 peer 与可见 Markdown 行为交公共 C 和消费者合审。 |
| 5 包与分层 | 解析和着色归 SDK，局部布局和复制由 Coding 消费。没有私有 SDK 依赖。 |
| 6 表与存储 | 不涉及。渲染派生内容来自现有记录。 |
| 7 兼容与迁移 | 原记录经统一渲染入口读取。候选使用一套解析器，按现行合同流程同批切换消费者。 |
| 8 安全边界 | 现行清洗白名单、非文本拒绝、链接策略和安全回退保留，由公开入口拒绝用例验证。Host 权限路径沿用。 |
| 9 调用次数 | 沿用现有请求、目录和授权路径，每份正文解析一次。Coding 仍按路由回传轮次，实测长会话重绘成本。 |
| 10 升级与数据 | 已存正文与引用继续读取。验证旧 Markdown 的可见语义和外部插件更新 peer 后的加载。 |
| 11 成果与过程项 | 不涉及。仍是已有回合、Feed 正文和报告的呈现。 |
| 12 页面与文字 | 现有块、折叠、复制和反馈，核实际 Host 静态资源。无新增 UI 文案或事件。 |
| 13 错误 | 继续使用清洗后的纯文本回退，现有调用方错误合同沿用。 |
| 14 冲突面 | 公共 C 的 SDK、共享锁与消费者文件按上表认领，统筹与第 06 批及在途消费者改动查重。 |
| 15 全局最优 | 插件继续用一份 SDK，外部 `/rich-text` 调用方承担 peer 切换。平台保住根入口离线安装和统一清洗。助理和 Agent 的操作入口沿用，助理消费共享着色需回归。公共呈现和 Feed 走原路径，资料目录、工作流、MCP、同步与授权不涉及。后续插件可直接复用，真实长路径性能留给本片实测和第 56 批复验。 |

## 验收与测量

| 编号 | 可观察结果 | 当前证据 |
| --- | --- | --- |
| B27SRC-01 | 公共 `/rich-text` 的真围栏在顶层、引用、列表、组合及同文重复场景逐字还原。LF、CRLF、CR、tab、仅空格 EOF、闭合、开放末尾与容器退出有独立预期。 | 临时解析与 HTML 文本回读已证，产品测试待做。 |
| B27SRC-02 | Feed 普通正文、摘要和允许的原始 HTML/缩进代码语义一致。安全用例拒绝脚本、事件属性和非法链接，围栏的闭标签、字面实体、恶意语言名作为数据，原始 HTML 中的 NUL 与 `&#0;` 无法触发 CR 转换。 | 固定 Feed 样本和围栏拒绝原型已证，完整基线对照及审批待做。 |
| B27SRC-03 | 打包 SDK 根入口和 `/highlight` 可与 contracts 从空缓存离线安装并加载。真实 `/rich-text` 调用方声明并加载同一组可选 peer。既有公开快照保持。 | 待 C 合审、实现及安装测试。 |
| B27SRC-04 | CR-only 注释在逻辑行尾终止。LF、CRLF、CR 的追加和回改只从受影响的行着色，输出等于全段着色并可拼回精确文本。 | 生产函数已复现基线缺陷，候选待做。 |
| B27SRC-05 | Coding 经真实 Host 与隔离页面从半行、未闭合、闭合缩短到回改及重开。可视行、`textContent` 和真实剪贴板逐字匹配，块、按钮和未变着色前缀保留。 | 待浏览器实操，原型的文本回读只覆盖 HTML 解析。 |
| B27SRC-06 | Assistant 与 Diff 沿已有回归路径保持原文、前缀节点及补丁复制反馈。 | 此前切片有证，共享着色候选回归待做。 |
| B27SRC-07 | Coding 长快照流式、复制与重开达到现行 VUX 性能口径，记录同条件差异与波动。页面资源按真实 Host 下发字节核。 | 合成 Node 循环已证取舍，候选长路径、页面资源及真实规模待测。 |

实现前固定当前生产基线、Node 和专用 Chrome 版本、窗口、隔离 Home、模型夹具、快照轮数及分片节奏。用约 90,000 字符与接近现有 400,000 字符着色上限的多轮 Coding 路径，覆盖首次可读、首次真实复制兑现、结束语和末行均可见、重开及局部回改。基线和候选以同一夹具重复采样，列出每轮耗时、堆、Fetch／XHR 数、重新着色起点和最终文本。现有着色帧 <50 ms、首次布局上限 150 ms 的断言照用，包含原测试规定的布局与观察者范围。未设数值的宿主渲染和端到端阶段提交前后差异与波动供统筹判断。把全文 Markdown 解析成本与局部着色的证据分开记。使用 [现行 VUX 性能口径](../../spec.md#code-diff) 与 [并行开发规则](../../../../docs/system/PARALLEL-DEVELOPMENT.md#5-构建与浏览器用例排时段)。

合审后的测量与验证命令如下，测试名或注释带对应编号。基线与候选在各自隔离工作树使用同一测试夹具和生产入口。

```sh
pnpm build
node scripts/machine-slot.mjs run browser --label "27-2 source tests" -- node scripts/run-tests.mjs --jobs 1 tests/plugin-sdk-rich-text.test.ts tests/plugin-sdk-subpaths.test.ts tests/feed-rich-content.test.ts tests/code-incremental-colour.test.ts tests/code-incremental.e2e.test.ts tests/code-scale.e2e.test.ts tests/assistant-text-html.e2e.test.ts tests/code-diff-reader.e2e.test.ts tests/plugin-sample.e2e.test.ts
node scripts/machine-slot.mjs run browser --label "27-2 Coding scale" -- node scripts/run-tests.mjs --jobs 1 tests/code-scale.e2e.test.ts --test-name-pattern=B27SRC-07
node scripts/machine-slot.mjs run build --label "27-2 page assets" -- pnpm workspace:build
node scripts/gates/page-assets.mjs --base origin/main
pnpm boundary:check
node scripts/machine-slot.mjs run build --label "27-2 health" -- node scripts/check-health-gates.mjs --base origin/main
git diff --check
```

规模命令用于固定夹具的前后测量，随后整批复用相同用例的有效证据。涉及 SDK 共享核心，由统筹在最终批次头安排 CI Full。设计稿阶段只整理已完成的临时实验与只读核查，候选实现、构建、产品测试和公共 C 合审均待做。

## 实现记录（2026-11-11，第 27 批主会话）

用户在第 27 批弹窗里选 B1「换 Micromark（推荐）」。按上面的推荐实现做了，公开签名和 API 快照不变。

- 解析与正文（`packages/plugin-sdk/src/rich-text.ts`）。一次 `preprocess`、`parse`、`postprocess` 得到事件，`fencedSources` 按事件取每个围栏的正文。正文由 `codeFlowValue` 与 `lineEnding` 逐 token 的 `sliceSerialize` 拼成，规则如下：
  - 开围栏后的那个行尾不算；闭合的围栏扣掉闭围栏前的一个行尾。
  - 开放的块跑到输入末尾时，补回留在 token 外的最后一个真实行尾；只有开围栏、下面没有一行的块仍为空。
  - 开放的块被容器结束时，若 token 终点后紧跟的不是行尾，说明分隔行尾已收进正文，扣掉它。
  - 编译用同一事件流，HTML 扩展只接管 `codeFenced` 的进出：语言沿默认处理器的转义结果，正文自己转义。GFM 去掉脚注（`disable.null` 关三个构造）。`htmlFlowData`、`htmlTextData` 恢复成默认写法，即停用 GFM tagfilter，原始 HTML 去留仍由清洗器定。
  - 空白输入仍为空，但不再先 trim 全文。
- CR（`&#13;`）与单独 CR 的 `<br>`。正文里的 CR 先暂存成 NUL；清洗器的 `textFilter` 只在 `code` 文本里把它写成 `&#13;`，别处直接去掉。Micromark 与 HTML 解析都把输入里的 NUL 和 `&#0;` 变成 U+FFFD，所以输入造不出 CR。**实测补充**：Chrome 156 把 `white-space: pre` 里单独的 CR 画成空格（CSS Text 3 的规定），CR-only 的代码会显示成一行。所以单独的 CR 后面加一个 `<br>`：不进 `textContent`，复制按钮读的原文不变；CRLF 不加。用选区手动复制时，浏览器会把 `<br>` 写成换行，这一点和 LF 的块不同。
- 着色与 Coding 分块。`/highlight` 的行注释、字符串、HTML 引号值、YAML 行首都在 LF、CR 处停；`growCodeTokens` 的回改起点取 LF 或 CR 的最后一个，CRLF 从 CR 算起，所以后来补上 LF 的 CR 会和它一起重分。Coding painter 的 `throughLine` 认 LF、CRLF、CR，回改起点同上。含单独 CR 的片段画成一个 span，CR 后跟 `<br>`；测试投影只读文本节点，结果不变。
- 依赖。SDK 的可选 peer 换成 `micromark@^4.0.2`、`micromark-extension-gfm@^3.0.0`、`sanitize-html@^2.17.7`，开发依赖同步，去掉 `marked`。Coding、Feed 的直接依赖和 `molis-work.extraDependencies` 同样换掉；README 已改。`apps/workbench/package.json` 里旧的 `marked`／`sanitize-html` 声明没有动：工作台源码不导入 `/rich-text`，要不要删交统筹。Pages 自己的 Marked 不涉及。
- 性能（B27SRC-07）。Node 24.15 下，同一份 Coding 式 Markdown（标题、列表、链接、30 行 ts 围栏交替），取中位数：

  | 规模 | Marked | Micromark |
  | --- | --- | --- |
  | 1.5 万字符 | 0.55 ms | 2.26 ms |
  | 9 万字符 | 2.85 ms | 14.6 ms |
  | 40 万字符 | 12.2 ms | 63.9 ms |

  与设计时的估计一致，约慢 5 倍。Coding 每次回答路由都把所有轮次重新画一遍，所以在 `plugins/native/coding/src/rich-html.ts` 加了按原文缓存的 HTML（先进先出，原文加 HTML 合计 400 万字符封顶）。刷新时只有正在流的那一轮会重新解析，长会话的实际成本比换包前低。页面端的着色帧与首次布局门槛（`tests/code-scale.e2e.test.ts`）照旧通过。
- 可见差异（待用户确认）。逐字比较 45 份样本（Feed 混合正文、安全样本、GFM 各构造、Coding 回答），忽略空白后只有设计预期的两处不同，都按 CommonMark 读：
  - 以四个空格开头的整段文字，现在是缩进代码；以前先 trim 全文，读成段落。
  - 闭围栏那一行后面还有字（如 ```` ```~ ````）时，它不算闭合，围栏一直开到结尾；Marked 以前把它当闭合。

  另外，围栏的尾 LF 不再强加，这是本项的目的。
- 证据：
  - `tests/plugin-sdk-rich-text.test.ts`（B27SRC-01、02：spec 表与更多容器、行尾样本，同文异行尾的两个围栏，原始 HTML 与缩进代码，语言与正文作数据，NUL／`&#0;`，清洗、GFM、两处差异）
  - `tests/plugin-sdk-subpaths.test.ts`、`tests/coding-rich-html.test.ts` PG062-07、`tests/plugin-sample.e2e.test.ts`（B27SRC-03：peer 一致、Coding 页面包不带解析器、离线安装能加载 `/highlight`，不装 peer 时 `/rich-text` 报 `ERR_MODULE_NOT_FOUND`）
  - `tests/code-incremental-colour.test.ts`（B27SRC-04）
  - `tests/code-scale.e2e.test.ts` B27SRC-05：9 万字符 LF、CRLF、CR 三份，渲染出的 HTML 与 Coding 分片着色都逐字读回、显示 1823 行同高；一个单独 CR 先到、LF 后到也不出现重行。
  - 消费者回归 `tests/code-incremental.e2e.test.ts`、`tests/assistant-text-html.e2e.test.ts`、`tests/code-diff-reader.e2e.test.ts`、`tests/feed-rich-content.test.ts` 均通过（B27SRC-06）。
- 还没做：真实 Host 中 Coding 的 CR-only 回合实操（B27SRC-05 只在组件板页面用生产 painter 证明），以及第 56 批的真实规模复验。
