# 第 12 批合同设计稿：输入框上方的提示行、项目规则的信任与来源

状态：设计稿第 4 版（2026-11-13）：§7「插件声明可承接上手材料」待合审；第 3 版（§1～§6）合审通过（评审台兼公共合同台／D 轨，第 3 轮）。第 2 版复核为「有条件通过」，新阻塞一条（「本人再选一次」在选择器里点不到、`trusted` 变了修订号不变），第 3 版改成规则菜单里的「确认」（§3.2、§3.4），并加外键、改文案、写明哈希来源与子任务继承。第 1 版经评审台兼公共合同台（C 轨）、D 轨合审为「有条件通过」：阻塞五条（冻结来源做不出来、「用户选的」判断有漏洞、存储与修订号、信任怎样交给一轮与安全登记、旧一轮与项目层提示），第 2 版逐条改在第 3 节，非阻塞的画法、读屏、验收与文字也一并改进；改完再复核一次后写合同代码。属[第 12 批](../post-anticorruption-roadmap/reference/batches/12.md)第 1 项；定样与用户决定见[需求书 §11](spec.md#11-决策记录)。验收编号：CHO-06、CHO-38、BCD-01～BCD-14（第 4 节）。

## 1. 为什么要改平台

两件事 Coding 自己做不了，按「插件缺什么就补进平台」补：

1. **只读提示行（R3 定样 A）**：讨论、规划、评审下，输入框上方常显一行「『讨论』只读……」和「换成修改」，输入框描边换成只读色。自统一输入（O2、O3）以后 Coding 不画自己的输入框：前台页面是工作台底栏那一个输入框的接收方，页面里画的东西不在输入框旁边。所以「输入框上方一行、带一个按钮、能改描边」要由平台输入框提供。别的页面（助理的 Character 只读、表单的待补项）以后也会用同一处，不为 Coding 开私路。
2. **项目规则（R3、CHO-06）**：SDK 只在 `projectTrusted === true` 时把仓库里的说明文件放进每一轮，Molis 从来没传，所以这些文件现在没有进过任何一轮。信任由 Host 决定（R3「项目可信性由 Host 决定」），不由插件在输入里报。

## 2. 输入框的提示行（`notice`）

### 2.1 合同（`packages/plugin-sdk` 的 `page-globals`，公开 API）

```ts
/** One line above the box: what holds for the next send, with at most one way out. Read again on every draw, like `controls`. */
export interface ComposerNotice {
  text: string;
  /** `readonly`: the next send changes nothing; the box's outline takes the read-only colour. `info`: a plain line. */
  tone: "readonly" | "info";
  icon?: PluginIconName;
  action?: { label: string; run(): void };
}
// ComposerCommonOptions
notice?: () => ComposerNotice | null;
```

- 只给一行、一个动作：多于一件事的说明不该挤在输入框上方。
- 文字由页面给（Coding 今天用 `uiText`，第 16 批起换 `t()`），平台照原样画、转义。
- 不碰发送：`notice` 不拦发送，拦发送仍是 `required`。
- `page-globals.ts` 里「每次画时重读」的那份清单加上 `notice`。

### 2.2 跨框（`apps/workbench/src/browser/plugin-frame/composer-bridge.ts`）

- 上行 `ComposerSnapshot.notice: { text; tone; icon? ; action: { label } | null } | null`，函数不过框。
- 下行沿用 `composer-act`，新增 `act: "notice"`（无 `key`）。
- 页面挂载与重读不变：`notice` 与 `controls` 一样每次画时重读。

### 2.3 画法（`packages/design-system` 的 composer，组件板新增）

- 位置：`.mw-composer__box` 正上方，在状态行之上。静止单行状态（`data-rest`）下也常显，仍在框上方，不并进框里那一行。
- 进场用 `craft-rise`（`--dur-move`、`--ease-quint`），写进组件现有的「减少动态效果」规则：减少时不做进场。
- `tone="readonly"`：根上 `data-notice="readonly"`，描边是 `--accent` 22% 混 `--line`（与定样一致），和失败描边一样用 `color-mix` 写在组件规则里，不另加基线变量：两套皮肤、深浅色都由现有的 `--accent` 与 `--line` 推出，加变量要在两套皮肤各写死四个值（实施时改，见第 6 节），同时盖住 `:focus-within` 的描边；失败状态的描边优先于只读。文字前一个锁图标（`aria-hidden`）。
- 窄处：用组件已有的容器查询（480px），说明换行、按钮另起一行；按钮触控高度照组件现有规则 44。
- 读屏：这一行是常显的条件，不是一次的消息，**不用 `role="status"`**（状态行已经是）。节点保持不变、文字变了才更新；输入框以 `aria-describedby` 指向它，聚焦输入框时读到。
- 组件板加一节「输入框提示行」：只读、普通、带按钮、窄处、静止单行五个标本（D 轨合审）。

### 2.4 Coding 怎么用

`READ_ONLY_INTENTS = ["discuss", "plan", "review"]`；模式在其中时给 `{ tone: "readonly", icon: "lock", text: 「{模式}」只读…, action: 换成修改 }`，运行时不提供修改模式时不给按钮。不按消息内容判断、不自动换模式（定样否掉 B、C 的理由）。

## 3. 项目规则：信任与本轮来源

### 3.1 用户决定（2026-11-13）

**选了输出目录就算信任**：项目的输出目录是用户自己选的文件夹时，视为信任这个项目，每一轮读仓库里的说明文件；项目设置里可以关。信任只决定读不读，不加任何权限（定样 R3 A）。否掉「开关＋就地开启，默认关」（多一步）和「每个文件夹单独信任」（要另做按文件夹的设置与管理页）。

### 3.2 什么算「用户自己选的」（合审第 2 条）

`trusted` 三条同时成立才为真，每次读、每一轮开始都按当前状态现算，不存：

1. 输出不是项目的默认输出目录（`projectOutputId`）。改回默认，立刻不信任。
2. 这个输出是本人选的：关联是本人建的（`isPersonMembership`，即 `bound_by` 为本人），或本人对**这一个**输出目录点过「确认」（存在设置行的 `confirmed_workspace_id`，等于当前输出的 `workspace_id`）。工具会话关联的（`binding:<actor>`）和目录库 1→2 升级时按「只有一个文件夹」自动设成输出的，`bound_by` 不是本人，要本人确认一次才算；输出换成别的文件夹，确认不跟过去。确认的入口在 Coding 的规则菜单（「规则没加载」那一段的「读取这个文件夹的说明文件」）和项目设置的同一个开关上，调的是 `set_instructions`，不改 `set_output`（选择器把当前输出排除在外，不为认领开第二条路）。Coding 里的按钮和 `set_output` 一样经工作台的插件框桥（`plugin-frame/workspaces.ts`）由本人点击发出，不走 Coding 后端，所以 §3.4「插件不能调」仍然成立。确认按文件夹（目录的 id）记：输出换走时文件夹仍是项目的输入，换回来确认还在；只做输出的文件夹换走时就离开了项目，再加回来是新的关联，要重新确认。
3. 这个项目的「读取仓库说明文件」没有关。关了以后换输出目录，仍然是关的（开关属于项目，不属于文件夹）。

另外写明：只作输入的文件夹不会成为一轮的根，所以不会被读（`horizontal/agent-host/src/index.ts` 的 `authorizedDirectories` 只有输出）；Host 建的工作树按它所属的输出算。

**提示注入**：项目说明在上下文里排在用户消息之前；输出目录选成一个刚克隆的第三方仓库也会被信任（用户的决定就是如此）。兜底是：信任不放宽审查、联网、授权或执行模式，「规则 N」让人看得见本轮读了什么、读的是哪一版。

### 3.3 存储（合审第 3 条）

- 主人：项目（`modules/projects`），和输出目录同一处，是本机事实，跟着本机的输出目录走，不进项目的同步投影（`portable-project.ts`）。
- 新表 `project_instruction_settings(project_id TEXT PRIMARY KEY REFERENCES projects ON DELETE CASCADE, off INTEGER NOT NULL, confirmed_workspace_id TEXT)`：没有行就是默认（读、未确认），删项目时跟着删。目录库（`projects/catalog.db`）从第 3 版升第 4 版，升级段只建表，不 `ALTER TABLE`、不补数据；补第 3 版的金样，跑 `pnpm schemas:update`。
- `revisionOf` 把这一行（`off`、`confirmed_workspace_id`）和「输出是否本人建的」都算进去：`trusted` 一变修订号就变，开着的页面会刷新，带 `expected_revision` 的提交也挡得住并发修改。

### 3.4 读写合同

- 读：`ProjectDirectories` 加 `instructions: { off: boolean; trusted: boolean }`。`PROJECT_DIRECTORIES_SCHEMA` 带 `additionalProperties:false`、由 7 个目录动作共用，所以这 7 个动作的输出一起变（同一版本、阶段一原地改），跑 `pnpm actions:update`、`pnpm api:update`；读它的 Coding、Files、Git 不受影响。
- 写：`DirectoryChange` 新增 `{ kind: "set_instructions"; off: boolean }`：`off: false` 同时把当前输出记为本人确认的（`confirmed_workspace_id`），`off: true` 只关；走现成的 `directoryCommand`，新动作 `projects.directories.set_instructions@1`，`audiences: ["user"]`（Agent、MCP、工作流、插件都不能调），按 `expected_revision` 提交。

### 3.5 交给一轮（合审第 4 条）

- 信任放进 `AgentStartAuthority.directories`，加 `instructions_trusted: boolean`，与 `reply_language` 同一个模式：只由 Host 从上下文给，`AgentStartRequest` 里没有这一项；请求里出现未知字段一律拒绝。适配器（`prologue-run.ts` 的 `sdkStart`）把它作为 SDK 上下文的 `projectTrusted` 传进去。
- 子任务（委派、子 Agent）继承这一轮的 `projectTrusted`，不另算；它们的根在这一轮的输出或 Host 的工作树里，与 §3.2 一致。
- 说明文件名沿用 SDK 配置的默认（`AGENTS.md`、`CLAUDE.md`、`.prologue/instructions.md`），Molis 不另下发；Molis 不传 `homeInstructions`。
- 安全不变量：在 `docs/system/SECURITY-INVARIANTS.md` 新登记一条语义 ID（`S-project-instructions-trust`），写明：信任只由 Host 从上下文给；`set_instructions` 只有用户能调；说明文件的文字不放宽审查、联网、授权或执行模式。每条有断言拒绝的测试。

### 3.6 冻结记录里的来源（合审第 1、5 条）

- SDK 打包上下文时自己读说明文件，宿主不调 `selectInstructions`；冻结记录在开跑之前就写了。所以来源取 `startAgentRun` 返回的 `pack` 里来源是项目说明的那几项，**开跑之后补记一次、只写一次**，写在冻结记录的 `instructions` 上：

```ts
instructions: { trusted: boolean; files: { path: string; chars: number; truncated: boolean; sha256: string }[] }
```

- `sha256` 按打包进上下文的那段文字算，不按磁盘文件算；`chars` 与 `truncated` 也取打包的结果。补记失败（SDK 没返回、写入失败）时这一轮不带 `instructions`，按旧一轮显示。
- 每份带内容哈希，R3 要的「本轮仍按 10:02 的版本」由它和这一轮的开始时间给出；文件之后改了，旧一轮显示的来源不变（不伪造旧运行的规则来源）。不信任时 `files` 为空。
- 同时改 `packages/contracts/src/services/agent-host.ts` 的 `frozenOutput`（`instructions` 可选），跑 `pnpm actions:update`。
- **旧一轮**：没有 `instructions` 的是这个改动之前的一轮，显示「这一轮没有记录规则来源」，不显示「规则没加载」。
- **项目层提示 `project_prompts`**（冻结记录里 `layer: "project"` 的那几项）：是项目自己确认的说明，不是仓库文件，不算进「规则 N」。规则菜单里分两段：上面「项目说明」列 `project_prompts`，下面「仓库说明文件 N」列文件；上下文里的先后照 SDK 现有顺序（项目层提示在角色提示之后，仓库说明文件由 SDK 打包在上下文里），不改。

### 3.7 页面

Coding 输入框底部「规则 N」（N = 本轮实际读到的仓库说明文件份数），点开列项目说明与文件、字数、是否截断、读的是哪一版；不信任时写「仓库说明文件没加载」（不说「规则没加载」，以免被理解成项目说明也没用上）和原因：输出是默认位置（给「去项目设置选文件夹」）、输出不是你选的（给「读取这个文件夹的说明文件」，即确认）、你关了（给同一个按钮）。文字键：`coding.composer.readonly-notice`、`coding.composer.switch-to-edit`、`coding.rules.count`、`coding.rules.not-loaded`、`coding.rules.not-loaded-default`、`coding.rules.not-loaded-unconfirmed`、`coding.rules.not-loaded-off`、`coding.rules.confirm`、`coding.rules.unrecorded`、`coding.rules.open-settings`，中英各一份（实现时另加的文字与位置见第 6 节）。

## 4. 验收

| 编号 | 条件 | 证明 |
| --- | --- | --- |
| BCD-01 | 页面给了 `notice` 时输入框上方出现这一行，`readonly` 时描边换色且聚焦时仍是只读色；`notice` 返回 null 后这一行消失 | design-system composer 用例 |
| BCD-02 | 框里的页面给的 `notice` 经桥画在底栏，按钮按下后页面的 `run` 被调一次；函数不过框 | 工作台 plugin-frame 用例 |
| BCD-03 | Coding 在讨论、规划、评审下有只读行，修改、执行下没有；按「换成修改」后模式变成修改、只读行消失 | Coding 浏览器用例 |
| BCD-04 | 本人选的输出 `trusted` 为真；默认输出、工具会话关联的、升级得来（非本人）的输出、关掉时为假；关掉后换输出仍为假；对非本人的输出确认后为真、修订号变；确认后换输出，新输出不随之为真 | projects 模块用例 |
| BCD-05 | 信任的项目，一轮的模型请求里带仓库的 `AGENTS.md`；不信任的不带；只作输入的文件夹里的不带 | agent-host 请求接缝用例（CHO-06） |
| BCD-06 | `AgentStartRequest` 里带 `projectTrusted`、`instructions_trusted` 或任何未知字段被拒；Agent、MCP 调 `set_instructions` 被拒 | 安全不变量用例（拒绝本身） |
| BCD-07 | 冻结记录写本轮实际读到的文件与哈希；文件之后改了，旧一轮显示的来源不变 | agent-host 用例 |
| BCD-08 | 「规则 N」「规则没加载」按冻结记录显示，中英文、深浅色、三种宽度 | Coding 浏览器用例＋截图 |
| BCD-09 | `set_instructions` 用旧修订号提交被拒；开关、确认、输出是否本人建的都进 `revision`；删项目时设置行跟着删 | projects 模块用例 |
| BCD-10 | 没有 `instructions` 的旧一轮显示「这一轮没有记录规则来源」 | Coding 浏览器用例 |
| BCD-11 | 静止单行状态下提示行仍在框上方；减少动态效果时没有进场动画 | design-system composer 用例 |
| BCD-12 | 提示行文字不变时重画不重新播报；输入框 `aria-describedby` 指向它 | design-system composer 用例 |
| BCD-13 | 目录库 3→4 升级只建表，第 3 版金样回放通过 | golden-replay |
| BCD-14 | 项目说明（`project_prompts`）与仓库说明文件在规则菜单里分开列，「规则 N」只数文件 | Coding 浏览器用例 |

## 5. 对别人的影响

- 插件作者：`ComposerOptions` 多一个可选项，不给就和现在一样。
- 7 个 `projects.directories.*` 动作的输出多 `instructions`；读它的插件不受影响。冻结记录多可选的 `instructions`。
- 第 35 批 A1（说明文件、`/init`）与本节是同一件事（35 批文件已写明「应由同一片做」）：本批交信任、读入与来源显示，35 批只剩 `/init` 和「这一轮读到的说明」在规则菜单之外的入口。开 PR 时同步改 35 批文件。

## 6. 实施偏离

| 处 | 设计稿 | 实际 | 原因 |
| --- | --- | --- | --- |
| §2.3 只读描边 | 新语义变量 `--line-readonly` | 组件规则里 `color-mix(in srgb, var(--accent) 22%, var(--line))` | 与失败描边同法；由现有变量推出，皮肤与深浅色自动一致，不在两套皮肤里各写死四个值 |
| §3.5 子任务继承信任 | 子任务继承这一轮的 `projectTrusted` | 子任务现在读不到说明文件 | vendored SDK（`subagent-dispatch.js`）派子任务时自己拼 `context`，只带压缩与窗口，不传 `projectTrusted`；改 vendored 包是红线。失败方向是不信任（少读，不多读）。要继承得等上游 SDK 把父一轮的信任带给子任务，换包时补测试 |
| §3.6 补记位置 | 冻结记录 | 写进这一轮在会话索引里的冻结意图（`attempts[i].frozen.instructions`），同一份也放进运行视图 | 冻结记录就存在那里，重启后由它恢复；新增的是可选字段，旧记录没有它，读到即「这一轮没有记录规则来源」，会话索引格式不升版本（与第 16 批给冻结意图加 `reply_locale` 同法） |
| §3.4 读合同 | `instructions: { off; trusted }` | 加可选 `why_not: "default_output" \| "off" \| "not_chosen"`（不信任时必有，依次判断） | 页面要按原因给不同的出路（去项目设置选文件夹，或确认），只凭 `off`、`trusted` 分不出默认输出与没确认；原因由宿主一处算，Coding 不另读目录行去猜 |
| §3.7 关掉的位置 | 「项目设置里可以关」 | 项目设置「输入与输出」的「产出写到哪里」下加「读取说明文件」开关；默认输出时开关不可用并说明原因，没确认的输出显示关、打开即确认；Coding 规则菜单「去项目设置」直达这一页 | 设置要有地方关；放在输出目录旁边，与它管的是同一件事 |
| §3.7 警示标题 | 「仓库说明文件没加载」 | 菜单里分组标题已是「仓库说明文件」，警示标题写「没有读取」；「仓库说明文件没加载」留作「规则」按钮的提示 | 截图里两行重复 |

## 7. 插件声明可承接上手材料（第 4 版，2026-11-13，决定 43②）

评审台退回 #2061 的挡合并点 A：12-2 采用后接 Coding 时，上手服务写死了 Coding（`context-onboarding-service.ts` 的 `CODING_PLUGIN`、页面的 `?openPlugin=coding` 与「交给 Coding」文字）。用户 2026-11-13 定（[决定 43](../post-anticorruption-roadmap/reference/decisions.md#decision-43)②，本批弹窗再确认「本批补上声明」）：接续的目标由插件声明「可承接上手材料」，平台按声明调用，宿主和上手服务里不写 Coding 的 id；Coding 第一个声明，本批只落最小形式，第 44 批再把 Todo、Pages 迁到同一声明。

### 7.1 Manifest 声明（`packages/contracts/src/platform/plugin-manifest.ts`）

```ts
/**
 * 可承接上手材料 (decision 43②): what this plugin can take from onboarding, and its own action that takes it. Only the kind
 * `code_root` today: a folder the person chose that has project files at its top. Batch 44 adds the kinds Todo and Pages take.
 */
onboarding?: { takes: ReadonlyArray<{ kind: "code_root"; capability_id: string; version: number }> };
```

- 写法照 `demo_seed`：声明点名插件**自己**的一个动作（`actions` 里有同一 `capability_id@version`，manifest 校验拒绝点名别人的或不存在的，错误码沿用 `plugin.manifest_invalid`）。同一 kind 一个插件最多一条。
- 不分内置与装上的插件（插件同等待遇）：Manifest 解析与校验在 SDK 一处（`parseManifest` 与声明检查），平台各层取同一份。

### 7.2 承接动作的合同（`packages/contracts/src/platform/onboarding.ts`，新 subpath 之下导出）

```ts
export interface OnboardingCodeRootTake {
  /** The journey and this take: a retry with the same id returns what the first call did, writes nothing again. */
  request_id: string;
  /** The person's own folder, already the project's output when the plugin is called; the plugin checks it against `projects.directories.get@1`. */
  code_root: { workspace_id: string };
  /** The materials this round brought, by exact reference (fixed 成果 versions), at most 30. */
  materials: ReadonlyArray<{ ref: MaterialRef; title: string }>;
}
export interface OnboardingTakeResult {
  /** Where the person goes on: the plugin's own item to open, or null for the plugin's page as it opens. */
  open: { item_id: string; title: string } | null;
}
```

- 动作：`command`、`scope: project`、`write`，受众 `["user"]`（只有本人的上手在新项目里以本人身份调它；Agent、工作流程和 MCP 没有「上手交接」这件事，不开给它们；插件、Agent、MCP 调不了，被拒 `actions.forbidden`）。身份（actor、项目、安装）从调用上下文来。不等模型，不声明 `concurrent`。
- 被取消、撤权、停用的调用不写业务记录（照硬约束）；处理器开始之前被拒只留「未执行」诊断行。

### 7.3 平台怎样找承接者、怎样调（`apps/local-host`）

- 新函数 `onboardingTakers(kind)`（与 `artifactProducerSources()` 同法）：本构建带的插件登记（`PLATFORM_PLUGIN_REGISTRATIONS`，已装的读已装 Manifest）加上 Home 里装上且在生效的插件；挑出声明了这个 kind 的，返回 `{ plugin_id, project_plugin_id, name, name_text?, take }`。个人插件（`personal`）与常开以外的规则不变：只列能加进项目的插件。
- 复查页：journey 读回时多一个 `takers: [{ plugin_id, name }]`（只在有代码根时给）。页面每个承接者一行勾选「把 {folder} 交给 {plugin}」，插件名取 Manifest 的显示名；默认不勾（ONB-44 不变）。一个也没有就不出这一行。
- 采用：请求带 `take: { plugin_id }`（替换现在的 `coding_root: true`）。宿主只认 `onboardingTakers("code_root")` 里有的 `plugin_id`，代码根仍只从这一轮本人选的文件夹算（`codingRoot`，改名 `codeRoot`），不从请求读路径。顺序：建项目 → 加 Pages → 加这个插件（`project_plugin_id`）→ 把文件夹设为输出（本人的选择，归 Projects，由宿主写，不交给插件）→ 导入材料（现有 Pages／成果库步骤）→ 以本人身份调插件的承接动作，`request_id = onboarding:<journey>:take`，`materials` 是这一轮导入的成果版本（`journey.artifact_references`），超过 30 份只给前 30 份。
- 记录：`journey.adoption.take = { plugin_id, project_plugin_id, code_root }`；承接返回后 `journey.take_result = { open }`。重试时已有结果就不再调；调用失败时 journey 记失败、已建的项目与材料保留，重试从承接这一步接着做（同现有 Pages 步骤）。
- 落点：完成后页面去 `/projects/<id>/?openPlugin=<project_plugin_id>`，有 `open` 时加 `&openItem=<item_id>&openTitle=<title>`；宿主和页面里没有 `coding` 字样。

### 7.4 Coding 怎么承接（`plugins/native/coding`）

- Manifest：`onboarding: { takes: [{ kind: "code_root", capability_id: "coding.onboarding.take", version: 1 }] }`，动作在 `registration` 里声明一次。
- 处理器：读 `projects.directories.get@1`，确认 `code_root.workspace_id` 是现在的输出（不是就拒 `coding.onboarding_root_mismatch`，conflict）；建一个会话（标题「从上手开始」），把 `materials` 存为这个会话下一轮的材料（`materials:<session>`，与委派建会话同法）；同一 `request_id` 重试返回同一会话（存 `onboarding:<request_id>` → session_id）。返回 `{ open: { item_id: session_id, title } }`。
- 不碰输出目录与信任：输出由宿主设，信任仍按 §3（本人选的输出即信任）。

### 7.5 对别人的影响与不做的

- 新可选 Manifest 字段与一个新 subpath；API 快照、动作快照（`coding.onboarding.take@1`）刷新。第三方插件同样可以声明。
- Todo、Pages 仍是上手服务里钉住的提供方（`shipped(...)`），第 44 批迁到同一声明并加 kind；本批不动。
- 文字：「交给 Coding」两句改成带 `{plugin}` 参数的通用句，中英各一。

### 7.6 验收

| 编号 | 验收 | 用例 |
| --- | --- | --- |
| BCD-15 | Manifest 声明点名自己没有的动作、点名别人的动作、同一 kind 两条：都被拒 | SDK manifest 用例 |
| BCD-16 | 上手服务只按声明找承接者：一个声明了 `code_root` 的测试插件出现在复查页，Coding 不声明时不出现；源码里 `context-onboarding-*` 与页面不含 `coding` 字面 | 上手服务用例＋门禁式断言 |
| BCD-17 | 采用时请求里的 `plugin_id` 不在承接者里被拒、路径不从请求读；成功后输出是本人的文件夹、插件已加、承接动作以本人身份被调一次，重试不再调 | 上手服务用例 |
| BCD-18 | `coding.onboarding.take@1` 只给本人；`workspace_id` 不是输出时被拒；同一 `request_id` 返回同一会话；会话的下一轮材料是传来的成果版本 | Coding 用例、安全不变量用例 |
| ONB-44、ONB-46 | 浏览器用例照旧走通「复查 → 勾选 → 落在 Coding 的新会话」 | `tests/context-onboarding-coding.e2e.test.ts` |

### 7.7 合审条件（合同台 2026-11-13「有条件通过」，头 `93ca673772`）

- **C1 权限来自声明**：上手服务调承接动作用 `bindLocalWebAction(host, ref, definition)`（`local-web-actions.ts`），只带被点名动作自己声明的权限、只能调这一个动作，与 `plugin-demo-seed.ts` 同法；`web-onboarding.ts` 的固定权限名单不加任何承接者的权限。
- **C2 形状由 SDK 的 Manifest 检查管**：点名的动作必须是 `scope: project` 的 `command`、受众正好 `["user"]`，输入是只含 `request_id`、`code_root`、`materials` 的封闭对象，输出与 `OnboardingTakeResult` 相同；不满足就 `plugin.manifest_invalid`。BCD-15 覆盖这些拒绝。
- **C3 改掉的名字**：宿主 `codingRoot`→`codeRoot`、`CODING_PLUGIN` 删、`input.coding_root`→`input.take`、错误句改通用；存档 `adoption.coding_root`→`adoption.take`（只在本分支，不兼容）；页面 `codingPicked`／`codingFolder`／`codingChoice`／`cx-coding-root`／`data-coding-root` 改成 `take*`／`code-root`；语言键 `hand-folder-to-coding(-hint)` 换成通用句 `hand-folder-to(-hint)`，提示句不再描述某个插件；contracts `codeRootFile` 注释不点名 Coding。BCD-16 扫 `apps/local-host/src/*onboarding*`、`apps/workbench/src/scripts/context-onboarding*.ts` 与 `workbench.context-onboarding.*` 的键和文字，不分大小写不含 `coding`。
- **采纳的非阻塞意见**：承接者多于一个时是单选组（N1，请求只带一个 `take`）；超过 30 份材料时如实说交了几份（N2）；Coding 先写 `onboarding:<request_id>` 再建会话、会话 id 由 `request_id` 推出，重试不会多建（N3）；落点 `openItem` 打不开时退回插件页（N5）。
