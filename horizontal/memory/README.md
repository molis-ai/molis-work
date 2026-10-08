# 平台记忆

个人与项目记忆的平台服务：开关与策略、确定性写入门、召回编排、待认可的建议、最近变动与撤销、界面信号计数。记忆正文、版本、删除与作用域隔离都在 Prologue Memory（经 Agent Host），本服务不保存第二份正文，也不调用模型。

包名：`@molis-ai/molis-work-service-memory`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

助理的一轮开始前，Host 以“助理”这个使用方调用 `MemoryService.recall`：服务按用户的开关确定能读哪些范围（个人、当前项目），从 Prologue Memory 读出条目，结合 Host 记下的类别、适用情境、状态和有效期逐条过滤，用中文两字片段与英文词打分，按上限与字数预算取用，把用上的和因预算没带上的都记成使用回执（设置里显示“最近用于”）。用户说“以后都……”时，`write` 经写入门：开关、秘密形状、像指令的文字、范围、重复与冲突，最后才写入 Prologue Memory 并记一条“最近变动”。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/service.ts](src/service.ts) | `MemoryService`：列出、召回、写入门、修改与移动、候选、最近变动与撤销、界面信号、整理与维护 |
| [src/prefs.ts](src/prefs.ts) | 开关的默认值、补全与使用方权限 |
| [src/text.ts](src/text.ts) | 召回关键词、同文判断、原话是否真在本人说的话里、秘密形状与像指令的文字（确定性规则） |
| [src/follows.ts](src/follows.ts) | `followsFrom`：写进去的内容是否能整个由本人原话里的片段拼出来，否定、数字、地址都照原话所在的那一句（“亲口说的”的核对，中英文） |

合同在 `@molis-ai/molis-work-contracts/services/memory`（`memory.*` 动作、旁表端口）。旁表由 `@molis-ai/molis-work-storage` 的 `openMemoryLedger` 实现；Host 装配（Prologue 后端、动作注册、`/api/memory/*`）在 [apps/local-host/src/memory/memory-host.ts](../../apps/local-host/src/memory/memory-host.ts)。

## 接入与边界

使用方只经 `memory.*` 动作或 Host 进程内的服务调用；使用方身份来自可信调用上下文（受众），不从输入读。插件只能读到被允许的类别；外部 AI 客户端默认读不到个人记忆。

工作区依赖：`@molis-ai/molis-work-contracts`。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-service-memory typecheck
pnpm --filter @molis-ai/molis-work-service-memory build
```

## 开发要求

- 负责：开关与使用方权限、写入门（开关、秘密、像指令的文字、范围、重复与冲突、记作“亲口说的”的核对、自动写入的决定表）、召回的过滤与排序与预算、使用回执、候选的规则（同文只提一次、每项工作最多 3 条、14 天过期）、最近变动与撤销、版本历史、界面信号计数与门槛、第一版数据迁移。
- 不负责：记忆正文的存储、版本号、墓碑与作用域隔离（Prologue Memory）；模型调用与提炼（Agent Host）；交互规则（助理规则引擎）；项目说明（Goals）；设置页面（Workbench）。
- 公开入口：`@molis-ai/molis-work-service-memory`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/services/memory`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同与同目录适配端口；不决定业务状态（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 模型只提议不批准：自动写入由确定性的写入门决定，规则版本写进来源与最近变动。
  - 单次行为、仅靠推断的内容、背景事实、像指令的文字、形似秘密的文字都不会被自动写入；推断不能覆盖用户明确说过的。
  - 停用、暂停、过期、不适用的记忆不会被召回；某使用方的开关关掉后它拿不到记忆。
  - 删除后存储、旁表（历史、使用记录）、最近变动的正文、重启之后都不再带出该条。
  - 模型说“和之前那条一样”（`same_as`）只是指路：写入门只按文字认同文（同样的话才算重复），否则新的话单独成一条建议，两条都留给本人，不替它自动记住别的，也不丢掉新的。措辞相近不等于意思相同，所以不用相似度去认。
  - 记作“用户亲口说的”（来源 `said`）要对得上：原话要是本人在这项工作里写过的一整句（助理工具核对宿主存的原话；一两个字不算），写进去的内容要整个由这句原话里的片段拼出来。写入门按句核对，不分长短（`src/follows.ts`）：原话和内容都按标点、换行、两个汉字之间的空格，以及“和、并且、and、or”这类连接词和“但是、不过、而是、but、however”这类转折词断成一句句话；内容里的每个字、词、数字（阿拉伯数字和中文数字）、地址，连同它有没有被否定，都要和原话里的一段连续的话对上。虚词、“用户/偏好/以后”这类记忆的口吻、英文虚词和词形变化不算；“别、不要、不能、禁止、避免、拒绝”和 not、don't、never、avoid、refuse、stop、without 算同一种否定，“除了、除非、代替”和 except、unless、instead of 对它们点名的东西也是否定；否定管到它所在那一句的句末，连接词不断、转折词和标点断（“删文件前要问我，改名前不用问我”里的“问我”一个要问、一个不用，不能把一个的说法放到另一个上）。
  - 拼的规矩（同在 `src/follows.ts`）：每个来源（原话、项目名、被纠正的那条记忆）的第一段不算；之后全篇至多一次改动：把同一句里的两段接起来（漏掉中间的几个字或前后对调；漏掉的不能是否定）；把原话里的一整句接在任何一段后面（上一句的话题带进下一句：“周报别放最后，先写风险”→“周报先写风险”；漏掉一句或换个顺序）；或在同一句里多放一个原话里有的汉字（“NSM 是北极星指标”→“NSM 指北极星指标”）。原话里本来相邻的句子接在一起不算改动，但数字后面的字不能不断句就接上（“……五十万，人数……”不能写成“……五十万人数……”）；从一句的中间跳到另一句的中间不行。数字、中文数字和地址要整个照原话，不能紧挨着任何一处改动，同一句里的改动也不能落在它前面的三个字词之内；一段话从一句的中间开始时，那一句里排在它前面、被漏掉的部分不能有否定，也不能有数字或地址。别的来源的词不能掩盖原话里两段之间的改动，内容里至少要有一个词是原话的。
  - 被纠正的那条记忆（`replaces`）的词只有它是本人自己的（说过、认可过、手动加的、导入的）、并且新内容不只是把它原样重说一遍时才借给这次纠正；助理自动记下的那条的词不借。“再说一遍”要让已有的自动记忆变成“他说的”，也只按原话和项目名核对，不借被纠正的那条记忆的词。对不上就不记成“他说的”，只作为助理的建议等本人认可，已有的自动记忆也不会因此变成“他说的”。
  - 机械核对分不出同样的字词拼出的另一层意思：一句话里没有标点也没有连接词、并排放着两件事；纠正时把旧记忆的话题配上原话里另一件事的说法；“可以、尽量、通常”这类程度词或“如果……”这类条件被拿掉。所以原话会留在这条记忆上让本人自己看。只有助理的工具有宿主存的本人原话可对；经 `memory.write` 动作调用的其他 Agent，宿主没有它和本人的对话，写入门只核对内容出自它交来的原话，不核对那是不是本人写过的。
  - 用户自己说过、认可过、替换或改过的记忆，不会被撤销之前的某次自动写入而删掉或覆盖：之后这些自动记录不再可撤销，撤销时也再核对一次这条还是不是自动的。
  - 助理只能把记忆停用（记作助理的变动，本人可撤销）；改正文和彻底删除只有本人，在设置里做。
  - 召回的使用回执（最近用于）是这次调用的副作用：调用被取消或撤权后不写（`recall` 在写回执前走调用自己的 `beforeEffect`）。
  - 个人记忆的出处不写项目里的工作名；个人记忆只归本人。
- 改动后必跑：`node scripts/run-tests.mjs tests/memory-service.test.ts tests/memory-learning.test.ts tests/memory-actions.test.ts tests/assistant-memory.test.ts tests/memory-text.test.ts`
- 相关手册：[specs/archive/memory-system/spec.md](../../specs/archive/memory-system/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/services/memory`
- Migration Goals: `goal-reorg-f2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
