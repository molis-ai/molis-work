# 草稿与返回：从哪里来、回到哪里、接着做什么（路线书 12 第三项）

状态：设计稿（2026-11-07），没有实现，也没有改合同代码。第 13 批统筹按用户 11-07 的安排派写手写稿；第 11 节的用户拍板项与统筹可定项都还没定，第 13 批⑤等本项合入后接入。需求维护与本稿：Claude（第 13 批统筹派的写手）；实现片的写手按第 8 节由统筹派。

- **档位**：大需求（新的平台能力、改 `UiPluginClientHost` 合同、跨工作台外壳、设置页与多个插件）。
- **类型**：横向能力（主），产品线（工作台、服务连接、模型设置、各插件），体验与效果。
- **决策**：要决策：第 11.1 节五项要用户拍板（含返回条定样），第 11.2 节九项由统筹定。
- **相邻的线**：第 13 批⑤「连完回到原处」是第一个消费者；④c 原处连接卡（[服务接入需求][ASC] §13.5）已经覆盖在原处就地连，本项只管「进了设置页再回来」；第 07 批工作台导航（S1 [#1853][PR1853]、S2 [#1867][PR1867]）管窗格、标签、召回与覆盖层，本项只调它的公开入口，边界见第 10 节；第 18 批 P3 的防遮盖模块只与④c-2 有关，本项不碰。
- **需求来源**：[12 第三项][B12]；[治理核查 PF-A07][AUDIT]；[治理需求][PFG] 的 PFG-04～06；[13 的核账][B13]「六、连好之后能不能回到原来的工作」「七、实现时要做的」。

## 0. 给人讲清楚

在 Cognia、Coding、工作流程这些地方，缺模型或缺账号时会给一个「打开模型设置」之类的入口。点进去配好以后，现在常常要自己找回原来的地方，刚才按下的那一步也要重新点；从齿轮进去的、刷新过的、在系统浏览器里登录的，情况又各不一样。各个插件还各写了一份「回来以后怎么办」。

这一项做一份平台共用的「回程」：从哪里进的设置、配好后回到哪里、回来后接着做哪一步。配好了就自动回到原处并说一声；没配好、出错或改主意，就留在设置里或者带你回去，原来写的东西都不动。各插件不再各写一份，只告诉平台「我这一步缺什么」。

需要你定的：回来后要不要自动做刚才那一步、刷新和重开以后怎么接、设置页顶上那条「从哪里来 · 现在回去」长什么样、开始使用页连模型是不是改成在本页里连（第 11.1 节）。

## 1. 要解决的问题与范围

### 1.1 现在怎样（main `c39746b20`）

先说一个前提：设置是**盖在工作台上的覆盖层**（`exclusive`，`apps/workbench/src/scripts/client/settings-directory.ts` 打开，`host.closeCover()` 关），不是另一页。在同一个标签页里从插件点进设置，插件页面就在覆盖层下面活着，输入和选中都还在；所以大多数情况下「回到原处」就是在对的时候关掉覆盖层。真正丢东西的是下面这些情况。

| 来处 | 现在 | 缺什么 | 证据 |
| --- | --- | --- | --- |
| 插件页里的普通链接（Cognia、工作流程、Coding、Alchemist、创作台、Jelly、Dataset、Form、PPT、Schedule、Shelf） | 链接 `/settings/models` 经框架转发（`apps/workbench/src/browser/plugin-frame/parent.ts` 的 `openSettings`）发 `molis-work:open-settings-path`，设置盖上来。只在「第一个能用的模型」保存时，`settings-directory.ts` 的 `modelReady` 用 `sentFromPage` 先关覆盖层、提示「模型已连接，可以继续了。」，再发 `molis-work:model-ready` | 换模型、修好坏掉的模型、第二个供应商都不回去；`sentFromPage` 只是内存里的一个布尔，刷新就没了；事件不带原来的任务、输入、选中；插件不知道人是为哪一步去的，只能靠事件重读整页 | `settings-directory.ts:101-108,368`；`packages/contracts/src/platform/dom-events.ts:260` |
| 齿轮、菜单、地址直接进 | 不回去 | 按设计就没有来处，不算缺陷；但现在和「从页面来」分不清的地方只有 `fromPage` 一个参数 | `settings-directory.ts:404-441` |
| 设置的连接页 | 登录在新标签（`target=_blank`），原窗口每 2 秒读授权记录；回调把新标签带到 `/settings/connectors?connected=…`，写「请回到原来的应用窗口继续」 | 原窗口连好以后不回到来处；新标签是一整份工作台，在桌面壳里是系统浏览器 | `apps/workbench/src/scripts/connectors-settings.ts:180-215,620`；`apps/local-host/src/web-connector-api-methods.ts:36`、`web-connector-methods.ts:37` |
| 连接页「连好以后」 | 一段往前走的链接（「打开 Feed，添加来源」，`?openPlugin=`） | 是往下一步走，不是回到来处；有来处时两者会打架 | `connectors-settings.ts:621-628`；`apps/workbench/src/settings-connectors.ts:70` |
| 连接页「高级」 | 没保存的改动留在这个窗口，回来时提示「接着改」「放弃改动」（ASC-76） | 这是设置页自己的草稿，本项不改，返回提示照它的样子做 | `connectors-settings.ts:529-549`；`tests/connections-page.e2e.test.ts` 的 ASC-76 |
| 助理对话 | `connectors.setup.prepare@1` 给「继续接入」（`/capabilities/connections?setup=<授权号>`）；授权完成后 `molis.connector-setup@1` 的等待把那项工作接着做一次（§4.7） | 工作会接着做，人不会被带回那项工作 | `apps/local-host/src/connector-setup.ts`；[服务接入需求][ASC] §4.7 |
| 连接提醒 | 助理提醒 `kind: "connection"` 带只许 `/settings/` 的 `settings_path`（#1861） | 去了设置，连好不回 | `apps/workbench/src/scripts/client/assistant-notices.ts:13` |
| Onboarding | Gmail 的 OAuth 有自己的回程：等待写在引导记录里，回调带 `oauth=connected|cancelled|failed` 回到那一步（`OAuthReturn`）；连模型在新标签开设置，经同名 `BroadcastChannel('molis-work:model-ready')` 得知 | OAuth 这一半已经好了；模型这一半在桌面壳里新标签交给系统浏览器，收不到 | `apps/local-host/src/connector-oauth-return.ts`；`apps/workbench/src/scripts/context-onboarding.ts:776-781` |
| Feed | 链到 `/settings/connectors?connector=…&project=…`，回来靠人 | ④c-2 改成原处连接卡后，这条链接只剩「还不能一键连接」 | `plugins/native/feed/src/ui.ts:421-426` |
| Images | 自己记 `resumeConnection`：对话框里点设置链接时记下正在编辑的连接，回来再开对话框时接着编辑 | 一个插件自己写的回程；④c-2 的卡取代缺密钥那一处之后可以删 | `plugins/native/images/src/browser/commands.ts:126-130`；`connections.ts:131-134` |
| 工作流程 | 连接浮层里「打开模型设置」是普通链接；`ui.returnTo` 是工作流程自己「从运行回到编辑再回运行」的返回 | 去设置这一段没有回程；`returnTo` 是它自己的事实，不归本项 | `plugins/native/workflows/src/browser/link.ts:46-56` |
| 已有的草稿 | 插件页在不透明来源的沙箱框里，`sessionStorage`／`localStorage` 经外壳按安装加前缀转存（`parent.ts` 的 `stored`）；另有平台的 `host.drafts`（Cache，按安装与项目分开，关掉应用也在） | 草稿本身不缺，缺的是「回来时知道该拿哪份、接着做哪一步」 | `parent.ts:27-38,250-253`；`apps/workbench/src/browser/plugin-frame/drafts.ts`；`packages/contracts/src/platform/ui.ts` 的 `UiPageDrafts` |

### 1.2 缺的就三样

1. **一张记着来处的单子**，由平台写、平台读，刷新还在；
2. **「好了」的判断**：去设置要补的那件事，回来前由平台向它的主人读一次，不凭设置页一句「保存了」，也不凭点过按钮；
3. **一条把结果交回来处的路**：插件拿到「好了／没好」和它当初说的那一步，只接着做那一步。

### 1.3 范围

做：

- 回程的形状、存法、期限、谁能读；
- 从插件页面、平台界面（助理、提醒、原处连接卡）和普通链接进设置，三种发起方式；
- 两个落点：模型设置、服务连接页（含助理的「继续接入」）；
- 成功、失败、取消、人自己关设置、刷新、关掉应用重开、在新标签或系统浏览器里登录；
- 各消费者的接入清单（第 4 节）和拆片（第 8 节）。

不做：

- **不存业务内容**：草稿正文、密钥、地址、选中对象的标题都不进回程；草稿仍在各自主人那里（插件的 `host.drafts`／存储、助理工作的草稿、连接页「高级」、引导记录）。
- **不造第二份模型或账号状态**（PF-A07）：「好了没有」每次向主人读。
- **不替插件重放任何一步**：和④c 第 1 项同一条规则，平台只告诉插件「好了，你刚才说的是这一步」。
- **不改原处连接卡**（④c）：就地连仍是首选；卡里「还不能一键连接」去连接页那一下才用到回程。
- **不改工作台的窗格、标签、召回、覆盖层与返回历史**（第 07 批）：本项只调它们的公开入口。
- **不把链接改成弹窗**（PF-A07 明写）：设置仍是一处，各插件不各开一个设置对话框。Onboarding 用的是已有的独立 Home 模型设置对话框（第 11.1 节 U5），不是新做一个。
- 从齿轮、菜单、地址直接进设置：没有来处，不回去（第 3.2 节）。
- 后台作业缺配置：仍走 #1870 的提醒；Agent、MCP 要连接仍走 `connectors.setup.prepare@1` 加等待。

## 2. 合同提案

### 2.1 一张「回程」

名字：**回程**（return trip）。它只回答三件事：从哪里来、去补什么、回来以后交还什么。

```ts
// 外壳内部的记录（apps/workbench，不是公开合同）。存法见 2.2。
interface ReturnTrip {
  v: 1;
  id: string;                 // 外壳生成，crypto.randomUUID()
  project: string;            // 工作台页面自己的项目；没有项目的 Home 页面是 ""
  from:                       // 外壳按可信信息写下，见 2.3
    | { kind: "page"; page: string; scope: string; plugin: string; surface: string; pane: string | null;
        object?: { kind: string; id: string } }      // 插件页面：页面授权号、install:project、插件、界面、所在栏
    | { kind: "assistant"; work_id: string }         // 助理对话里的一项工作
    | { kind: "under-cover" };                       // 平台界面里的普通链接（提醒等）：回去就是关掉覆盖层
  need:                       // 去补什么；「好了」只按它向主人读
    | { kind: "model" }                              // 有一个能跑的文字模型（模型目录的 health）
    | { kind: "connection"; service_id: string; slot?: { slot_id: string; record_key?: string } }
    | { kind: "setup"; authorization_id: string }    // 一次接入授权到了 connected
    | { kind: "none" };                              // 只回来，不判断
  met_at_open: boolean;       // 打开时需要是否已经满足；已满足的不自动回去（3.2）
  carry?: { draft_key?: string; step?: string };     // 插件给的两个名字，原样交还，外壳不解读
  cover: string;              // 打开的设置位置（noteCover 记的那一项），刷新后据它重新接上
  opened_at: number; expires_at: number;
  outcome?: { status: "ready" | "not_ready"; at: number; delivered: boolean };
}
```

- **草稿引用**是 `carry.draft_key`：插件自己 `host.drafts` 里的键（≤256 字符，同 `UiPageDrafts` 的键长），外壳不去读它；草稿正文从不进回程。
- **在等的工作**：插件的是 `carry.step`（≤128 字符，`[A-Za-z0-9._:-]`，插件自己起名，如 `send:<幂等键>`）；助理的就是已登记的 `molis.connector-setup@1` 等待，回程只记 `work_id` 和授权号，不另记一份等待。
- **选中对象**是 `from.object`（`kind` 与 `id`，不带标题）：来处页面已经不在时，外壳据它把那条记录打开回来（3.1 第 7 步）。
- 合同里不出现地址：回程**没有任何 URL 字段**，回去的位置由外壳从 `from` 算出（2.3）。

### 2.2 谁存、存在哪、存多久、谁能读

| 问题 | 提案 | 理由 |
| --- | --- | --- |
| 谁存 | 工作台外壳的一个新页面状态主人 `settings-return`（新文件 `apps/workbench/src/scripts/client/settings-return.ts`，存取与形状检查放 `apps/workbench/src/browser/return-trips.ts`，框架宿主与它共用这份代码）。插件、助理、设置页都只经它 | 回程里记的是栏、标签、页面授权号这些**浏览器里的布局事实**，它们的主人本来就在外壳（工作区状态也存在浏览器里）；放到宿主就是给浏览器布局在宿主里另记一份。`settings-directory.ts` 已经 463 行，不往里加 |
| 存在哪 | 这个标签页的 `sessionStorage`，一个键 `molis-work:return-trips`，里面按项目分开（第 11.1 节 U3 的推荐 A） | 刷新还在；一个窗口一份，别的标签页（含 OAuth 回调落地的那一页）看不到，不会抢着回去或抢走结果。插件框的存储转存一律加 `molis-plugin-page:<scope>:` 前缀（`parent.ts:250-253`），碰不到这个键 |
| 存多久 | 开着的 24 小时；有了结果、还没交出去的 1 小时；交出去即删。每个项目最多 8 张，同一来处再开一张就替换旧的。形状不对、`v` 不是 1 的整张丢掉，不兼容、不迁移 | 回程只是便利：丢了不丢任何事实，草稿和配置都在各自主人那里。数字由统筹定（第 11.2 节 C1） |
| 谁能读 | 只有外壳的同源代码（外层文档、窗格文档）。插件页拿不到回程本身，只拿到交给它的那一份结果（2.4），而且只在它是来处时 | 插件框是不透明来源，读不到外壳存储（S-21、S-47 的前提） |
| 同一用户同一项目 | `project` 取自工作台页面自己；交给插件页时，按页面授权（宿主给的 `page_id` 与 `storage_scope` = `install:project`）比对，安装、插件、界面、项目都对上才交；本机只有一个人，回程在这个人的这个窗口里 | 可信身份从调用上下文来：页面授权是宿主按实际激活、安装、项目与本人发的，页面给不出、改不了 |
| 关掉应用再打开 | 回程不在了（`sessionStorage` 随窗口结束）；草稿（`host.drafts`）与新配置都在，来处读回事实就能接着用，只是不自动做那一步 | 第 11.1 节 U3：若用户要重开后也问一句「接着做」，改存 `localStorage` 并加「哪个窗口的」归属规则，见那里的方案 B |

### 2.3 来处只由外壳写下；回去只到工作台内部

- **插件页面**：页面只交「需要什么」「交还什么」（`need`、`carry`）。`from` 由框架宿主（`parent.ts`）按它自己持有的页面授权（`grant.page_id`、`grant.storage_scope`）、Manifest 身份（`pack.plugin_id`）和根元素的位置（界面、所在栏）填，不读页面消息里的任何身份字段。窗格文档里的页面经窗格的那一条转发（`workbench-open-settings`，S-30 只认那个框自己的窗口）。
- **平台界面**：助理按它此刻显示的工作填 `work_id`；提醒和其他平台界面里的普通链接是 `under-cover`。
- **普通链接**（第 2.4 节第三种）：外壳的链接处理按链接所在的可信文档位置算来处，`need` 按地址查一张封闭的表（C3）：`/settings/models` → `model`；连接页带 `connector=<id>` → `connection`；带 `setup=<授权号>` → `setup`；其余 → `none`。
- **回去的位置只在工作台内部**：外壳从 `from` 算——来处还在覆盖层下面就只关覆盖层；来处在别的栏、右侧或已经不在，就走工作台已有的对象链接入口（`?openPlugin=<界面>&openItem=<对象>`，框架宿主的 `navigate` 与深链接同一条，07-S2 合入后它经召回落到已开的那一份）；助理就发已登记的 `molis:assistant-open { work_id }`。界面名、对象 `kind`／`id` 按现有的格式检查（`navigate` 的 `^[a-z][a-z0-9-]{0,100}$`），不合的整张丢掉。
- **地址里不放回程号**：回程跟着覆盖层走（外壳内存加 `cover` 字段），刷新后按 `cover` 接上，不需要在任何地址里带 `return=`。OAuth 回调的去向不变，由宿主按授权记录算，从不读回程。这样就没有开放跳转的入口：没有一个字段能写进外部地址，也没有一个地址参数能指定回到哪里。若统筹保留 Onboarding 开新标签（U5 选否），新标签里的设置页可带 `return=<id>` 只作查找，查不到、不是本项目、已过期就什么都不做（第 5 节 `S-return-trip-destination` 一并守住）。

### 2.4 三种发起方式：为什么是页面宿主方法加两条页面事件，不是动作

**一、插件页面：页面宿主方法 `host.returns`**（改 `packages/contracts/src/platform/ui.ts` 的 `UiPluginClientHost`，SDK 只再导出类型名）：

```ts
/** What the settings have to make true. The first version has a text model only; a connection is asked in place (`connectionNeed`). */
export type UiReturnNeed = { readonly kind: "model" };

/** Names the page wants back, never content: a key of its own `host.drafts`, and the one step to do on return. */
export interface UiReturnCarry {
  readonly draft_key?: string;   // ≤ 256
  readonly step?: string;        // ≤ 128, [A-Za-z0-9._:-]
  readonly object?: { readonly kind: string; readonly id: string };
}

export interface UiReturnOutcome {
  /** `ready` only after the platform read the need back from its owner; `not_ready` when the person came back without it. */
  readonly status: "ready" | "not_ready";
  readonly carry: UiReturnCarry;
}

export interface UiPageReturns {
  /**
   * Opens the settings for `need` over the workbench, remembering this page as where the person came from. Resolves when the
   * person is back here. Rejects with an `AbortError` when `signal` aborts, the view changes or the page closes (an outcome that
   * arrives later waits for `arrived()`), and with one fixed message when unavailable or the carry is refused, whatever the reason.
   */
  go(need: UiReturnNeed, carry?: UiReturnCarry, options?: { signal?: AbortSignal }): Promise<UiReturnOutcome>;
  /** Once per mount: the outcome that settled for this page while it was not there (rebuilt, reloaded, moved); afterwards `null`. */
  arrived(): Promise<UiReturnOutcome | null>;
}
// UiPluginClientHost 加一行：readonly returns: UiPageReturns;
```

插件拿到 `ready` 后的规矩照④c 第 1 项（用户 11-06 定），写进插件开发 Skill：先自己再读一次（如 `services.model.availability()`），只把 `step` 那一件做一次，用原来那一步的幂等键；本来要确认的照原样再问，原来没有的不新加；写之前照旧 `beforeEffect()`。拿到 `not_ready` 什么都不做，页面照常显示「没有模型」。

**二、平台界面：扩一条已登记的请求、加两条**（第 2.6 节）。助理、原处连接卡、提醒在外层文档里，直接经 `molis-work:open-settings-path` 带上 `need` 与来处。

**三、普通链接：不改任何消费者**。插件页里、平台界面里所有指向 `/settings/…` 的普通链接，外壳照样打开设置，同时按 2.3 的表开一张回程（`carry` 为空，不交结果给页面）。这样 Alchemist、创作台、Jelly、Dataset、Form、PPT、Schedule、Shelf 一行不改也能回到原处；要「接着做那一步」的才改用 `host.returns.go`。`docs/platform/PROLOGUE-AI.md` 与 `skills/molis-prologue-ai/SKILL.md` 步骤 6「入口都是普通链接，页面不为某个入口单写返回逻辑」那句仍然成立，补一句「要回来接着做哪一步时用 `host.returns.go`」。

**为什么不是动作**（与④c 统筹 11-06 对 `connectionNeed` 的理由相同）：「能力注册一次」管的是供页面、工作流、Agent、MCP 用的能力；回程是界面的挂法，离开页面没有意义，动作也没有「位置」可言。Agent、MCP 要配置已有 `connectors.setup.prepare@1` 加等待；回程判断「好了」时读的仍是已注册的动作和设置路由（`connectors.connections.read@1`、`connectors.authorization.read@1`、模型设置路由），不新加动作，也不进动作合同快照。

**为什么不只靠一条宣告**：`molis-work:model-ready` 是广播，谁显示过「没有模型」谁重读；回程是点对点的，只交给来处那一页，还要带回它当初说的一步。两者分开，见 2.5。

### 2.5 与 `molis-work:model-ready` 和连接的返回怎样统一

- **回程管回去，`molis-work:model-ready` 只管重读**。`settings-directory.ts` 里 `sentFromPage` 这段（「从页面来的先关覆盖层、提示，再发事件」）挪进回程：覆盖层若有开着的回程，先按回程结算（关覆盖层、提示），再发 `molis-work:model-ready`，顺序与现在登记的一致。事件的名字、载荷（无）、发的时机（第一个能跑的模型）都不变，只改登记里说明「谁先关覆盖层」的那一句。
- **换模型、修好模型、第二个供应商**：不再需要这条事件去带人回来，回程按需要读事实（有能跑的文字模型）就结算；打开时已经有模型的（`met_at_open: true`）不自动回去，只留返回条（3.2）。是否让 `model-ready` 在「模型从不能用变成能用」的每一次都发，是另一件事（13 的核账提过），本项不改，列为统筹可定 C7 的附带项。
- **连接**：连接页和原处连接卡都不另发「连好了」的页面事件。§13.5 第三节第 6 条草拟的 `molis-work:connection-settled` **不再需要**：连接页要随卡刷新的情况由同一个回程模块结算，不加这条。
- **OAuth 回调**：去向照旧由宿主按授权记录算；Onboarding 的 `OAuthReturn` 是引导记录自己的事实，保留不动。设置里发起的登录，原窗口靠已有的授权监视（连接页每 2 秒、页面可见时）得知 `connected`，交给回程结算；回调落地的那一页只把文案改成「已连上。回到 Molis Work 的窗口，刚才的事会接着做；这一页可以关掉。」（13⑤ 那一片）。
- **跨标签页的 `BroadcastChannel('molis-work:model-ready')`**：Onboarding 改用本页对话框后（U5），这条唯一的跨标签通道没有监听者，随 R5 删掉（C7）。

### 2.6 对登记与快照的影响

| 东西 | 改动 | 哪一片 |
| --- | --- | --- |
| `packages/contracts/src/platform/ui.ts` | 加 `UiReturnNeed`、`UiReturnCarry`、`UiReturnOutcome`、`UiPageReturns`；`UiPluginClientHost` 加 `returns`。`pnpm api:update` 刷新 contracts 的 `platform/ui` 快照与插件 SDK 快照 | R0 |
| `packages/plugin-sdk` | 只再导出上面几个类型名，不加运行代码 | R0 |
| `apps/workbench/src/browser/plugin-frame/child.ts` | `returns.go` 与 `returns.arrived` 先给固定的拒绝（「暂不可用」）占位，和④c C1 同一做法 | R0 |
| `packages/contracts/src/platform/dom-events.ts`（与发它的代码同一个改动登记，所以在 R1） | ① `molis-work:open-settings-path`（请求，主人 `settings-directory`）的载荷从 `{ href }` 扩成 `{ href, need?, from?, carry?, return_id? }`：`return_id` 由主人同步回填，发的人据此认出自己的回程。② 新增请求 `molis-work:return-arrival`（主人 `settings-return`，`on: "document"`，载荷 `{ page, outcome? }`，主人同步回填 `outcome`，同 `molis-work:plugins-changed` 让监听者回填的写法）。③ 新增宣告 `molis-work:return-settled`（主人 `settings-return`，`{ return_id, status }`，发在外层文档与各窗格框架文档）。④ `molis-work:model-ready` 只改说明那一句。`pnpm api:update` 刷新 dom-events 快照 | R1 |
| 动作合同快照 `tooling/gates/actions/` | 不变：不加动作、不改动作的 schema | — |
| `apps/workbench/src/settings-address-params.ts` | 不变：地址里不带回程号（若 U5 选否，`HOME_SETTINGS_QUERY_EXTRAS` 的 `/settings/models` 加 `return`，只作查找） | R1 或不改 |
| 框架与外壳之间的 MessagePort 消息（`types.ts` 的 `FrameUp`／`FrameDown`） | 加 `return-go`、`return-arrived`、`return-result` 三种；不在页面事件登记的范围里 | R1 |
| 安全不变量 | 新增三条，见第 5 节 | R1（宿主一半）、R1 浏览器用例 |
| 页面资源 | `workbench.js` 预计增长几 KB、`plugin-frame.js` 约 1 KB，以 R1 实测为准；单项一次超过 10 KB 先问用户 | R1 |

### 2.7 否掉的做法

| 做法 | 为什么不用 |
| --- | --- |
| 宿主里建一张回程表（新的 horizontal 包、库表、动作或路由） | 记的是浏览器布局事实，放宿主是给布局另记一份；要升库版本、写升级步骤、加清理与授权路由，换来的只是「关掉应用再开还在」，而那时草稿和配置本来就在。用户若在 U3 选 C，再按这条做 |
| 回程存 `localStorage` | 所有标签页共用，OAuth 回调落地的那一整份工作台也会看到，要另加「哪个窗口的」归属与存活判断；只在 U3 选 B 时采用 |
| 返回地址放进设置地址（`?return=/projects/…`） | 开放跳转的来源；地址里的位置会和工作区状态各说各的 |
| 只扩 `molis-work:model-ready`，带上来处与步骤 | 广播会让所有页面都拿到别人的步骤；连接、接入授权也要一条，事件越扩越杂 |
| 把每个「打开设置」改成插件自己的对话框 | PF-A07 明写不能只把链接改成弹窗；设置会分成很多份 |
| 平台重放插件那一步 | 平台不知道那一步现在还该不该做；④c 第 1 项已定由插件按幂等键自己做 |

## 3. 调用链

### 3.1 主路径（插件页缺模型，`host.returns.go`）

1. **发起**：Coding 的输入框，人按发送，Coding 发现没有能跑的模型（`services.model.availability()`），把输入存进自己的 `host.drafts`（键 `composer:<会话>`），调 `host.returns.go({ kind: "model" }, { draft_key: "composer:<会话>", step: "send:<幂等键>" }, { signal })`。
2. **框架宿主**收到 `return-go`：检查 `carry`（长度、字符），按自己的页面授权与根元素填 `from`，发 `molis-work:open-settings-path { href: "/settings/models", need, from, carry }`。
3. **外壳**（`settings-directory` 打开设置，调回程模块）：向模型设置主人读一次当前是否已有能跑的模型，记下 `met_at_open`；写回程，回填 `return_id`；设置盖上来，设置顶上出返回条「从 Coding 来 · 配好后自动回去 · 现在回去」（定样 U4）。
4. **在设置里**：人填好、保存；模型设置页报告保存结果（现在给 `ready` 回调的那一处，`settings-directory.ts` 的 `bindEmbed`）。
5. **读回事实**：回程模块再向主人读一次「有没有能跑的文字模型」。有：结算为 `ready`；没有：留在设置，返回条照旧。
6. **回去**：覆盖层还显示着回程打开的那一处时，先关覆盖层、提示「模型已连接，回到 Coding 接着做」（现有 toast），再按 2.5 发 `molis-work:model-ready`；人在设置里已经走到别的页（比如去看了外观），不关，返回条改成「已经好了 · 回去」。
7. **来处不在眼前时**：来处页面在别的栏、右侧，或者页面已经重建，用 2.3 的对象链接入口回到它；页面已经关了且没有 `object`，只关覆盖层，提示「原来的页面已经关了，配好的设置都在」。
8. **交还**：回程模块发 `molis-work:return-settled { return_id, status }`；那一页的框架宿主认出自己的 `return_id`，经 MessagePort 交 `return-result`，`go()` 的 Promise 答 `{ status: "ready", carry }`，回程标为已交出并删除。
9. **只接着做那一步**：Coding 自己再读一次模型是否可用，取回草稿，按 `send:<幂等键>` 发送一次（U1 定下的规则），原来有的确认照问。

### 3.2 成功、失败、取消、人自己关

| 情况 | 设置里 | 回程 | 来处拿到 |
| --- | --- | --- | --- |
| 配好（需要从没有变成有） | 自动关覆盖层、提示 | `ready`，交出即删 | `ready` 带 `carry` |
| 打开时就已满足（`met_at_open: true`，比如已有模型还点了「打开模型设置」） | 不自动关，返回条写「回去」 | 人回去时读一次 | `ready` |
| 出错（密钥被拒、登录失败、限流、检查没通过） | 留在设置，错误就地写，填的还在（#1903 的先查后存）；返回条照旧 | 不结算 | 还在等 |
| 人点「现在回去」 | 关覆盖层 | 读一次：满足就 `ready`，不满足 `not_ready` | 对应结果；`not_ready` 时什么都不重做 |
| 人自己关设置（Esc、返回、标题栏） | 关 | 同上，读一次再结算 | 同上 |
| 登录中途取消（连接页「取消这次接入」） | 连接页照 §4.6.1 处理 | 不结算，人回去时读一次 | 多半 `not_ready` |
| 来处的插件停用、卸载、页面授权撤了、项目删了 | 设置照常 | 交不出：安装与项目对不上就不交，到期删 | 什么都拿不到 |
| 从齿轮、菜单、地址进来 | 没有返回条，不自动关 | 不开回程 | — |

### 3.3 刷新、重开、新标签与系统浏览器

- **在设置里刷新**：覆盖层按 `noteCover` 重开，回程模块按 `cover` 找到这一项项目里开着的回程，返回条重新出现；来处页面也重建了，3.1 第 8 步交不出去，结果留着，等它挂上后 `arrived()` 取一次（第二次为 `null`）。刷新后拿到结果的页面是「接着做」还是「问一句」，按 U2。
- **在来处刷新（设置没开）**：开着的回程没有覆盖层可接，外壳启动时读一次事实结算（满足就留给 `arrived()`，不满足就删）。
- **关掉应用再打开**：按 U3 的推荐 A，回程不在了；草稿在 `host.drafts`，配置在主人那里，来处读回事实显示可用，人自己再点一次。重开后要不要也接着做，是 U3 的选项 B、C。
- **在新标签或系统浏览器里登录**：登录链接带 `noopener`，新标签不复制本窗口的 `sessionStorage`，看不到回程；原窗口的连接页靠授权监视得知完成，按 3.1 第 5 步起结算。回调落地的那一页（新标签里的一整份工作台，或桌面壳交出去的系统浏览器）只改文案（2.5），不另做一遍回去。
- **桌面壳里的模型设置新标签**：Onboarding 改用本页对话框（U5）后不再开新标签。
- **窗格文档**：嵌在工作台里的窗格页与外层共用一个 `sessionStorage`；结算与覆盖层只在外层文档，`arrived()` 在窗格文档里也能答（同一份存储），`molis-work:return-settled` 像现在的 `model-ready` 一样发进各窗格框架文档。

### 3.4 一次操作发几个请求（开工前检查第 9 项）

| 动作 | 请求 |
| --- | --- |
| 发起（写回程、打开设置） | 打开时读一次需要（模型 1 次、连接 1 次、接入授权 1 次）；设置页自己的加载照旧 |
| 设置里保存后 | 读一次需要；不重复读设置页刚拿到的同一份（模型设置的保存响应已带 `health` 时直接用，不再请求） |
| 回去 | 0（关覆盖层、发事件都是本地）；来处插件自己再读一次可用性，算插件自己的 |
| 刷新、启动时有开着的回程 | 每张 1 次，至多 8 次 |
| 设置隐藏或标签页在后台 | 0：不轮询；只有连接页已有的授权监视照旧（可见时 2 秒一次） |

## 4. 消费者接入清单

「片」见第 8 节。「不改」的，靠 2.4 第三种（普通链接）自动得到回到原处，不交结果给页面。

| 消费者 | 现在 | 要改什么 | 片 |
| --- | --- | --- | --- |
| **模型设置**（落点） | 第一个模型保存时 `sentFromPage` 关覆盖层 | 保存结果交给回程模块结算；`sentFromPage` 删掉；顶上出返回条 | R1（结算）、R2（返回条） |
| **服务连接页**（落点） | 回调写「请回到原来的应用窗口继续」；「连好以后」往前走的链接 | 授权监视得知完成、保存密钥通过后交回程结算；有回程时「连好以后」那段让位给返回条；回调落地页改文案；`setup=` 进来的按 `setup` 需要判断 | R4（13⑤） |
| **助理对话**（来处） | 「继续接入」去连接页，工作会续，人不回 | 「继续接入」以 `from: assistant` 开回程；连好后关覆盖层并 `molis:assistant-open { work_id }`，在等的工作照 §4.7 只续一次（宿主一侧不改）；④c-2 之后多数情况在原处出卡，链接只剩卡画不出的情况 | R4（13⑤） |
| **连接提醒**（来处） | 去设置，不回 | 普通链接即可（`under-cover`），提醒照原规则消掉；不改提醒合同 | R4（只验收） |
| **原处连接卡的「还不能一键连接」**（来处） | 卡里给去连接页的入口，离开原处 | 卡以来处页面开回程（`need: connection` 带槽），回来后卡用 C2 的 `read` 再读一次，接着它自己的流程 | R4，排在④c-2 之后 |
| **Feed** | `connectorSettingsHref` 链到连接页，回来靠人 | ④c-2 改成原处连接卡；剩下「还不能一键连接」走上一行；`connectorSettingsHref` 若还留着，普通链接自动回来 | 随④c-2，本项只验收 |
| **Images** | 自己的 `resumeConnection` | ④c-2 的卡取代缺密钥那一处后，删 `resumeConnection` 与设置链接；若对话框里仍留去设置的链接，改用 `host.returns.go`，`step` 记「重开连接对话框」 | 随④c-2 或 R3 |
| **Cognia** | 「模型设置」普通链接 + 听 `model-ready` 重读 | 缺模型挡住的那一问改用 `host.returns.go`，`step` 记那一问，草稿放 `host.drafts`；`model-ready` 监听保留 | R3 |
| **工作流程** | 连接浮层「打开模型设置」普通链接；`ui.returnTo` 是自己的返回 | 改用 `host.returns.go`，`carry.object` 是这条流程、`step` 记连接序号；回来重开那个浮层、重读可不可以交接；`returnTo` 不动 | R3 |
| **Coding** | `data-coding-model-setup` 与设置页的模型链接；输入草稿在转存的 `sessionStorage` | 缺模型挡住的发送改用 `host.returns.go`（3.1 的例子），草稿改存 `host.drafts` 才能过「重开后继续」；工作目录（「角色执行另选工作目录」）第一版不在 `UiReturnNeed` 里，走普通链接 | R3 |
| **Onboarding** | Gmail OAuth 已有自己的回程；连模型开新标签 + `BroadcastChannel` | 按 U5：连模型改用已有的独立 Home 模型设置对话框（`apps/workbench/src/scripts/home-model-settings.ts`），以引导为来处开回程，好了以后引导自己重读 `/api/onboarding/context` 接着那一步；`OAuthReturn` 不动；删 `BroadcastChannel` | R5 |
| **Alchemist**（构建期例外） | 普通链接 `/settings/models` + 听 `model-ready` | **只写边界，不改代码**：它的链接经同一个转发，自动回到原处；不用 `host.returns`，`step` 那一半等 BL-377 重做时接 | 不改 |
| **插件创作台**（同为构建期例外） | `host.openSettings` 经 `molisWorkOpenExternalUrl` 走框架转发 | 同 Alchemist：自动回到原处，不改代码 | 不改 |
| Jelly、Dataset、Form、PPT、Schedule、Shelf | 普通链接 + 听 `model-ready` | 不改；要接着做某一步时再各自改用 `host.returns.go` | 不改 |

## 5. 安全不变量提案

格式照 [安全不变量记录](../../docs/system/security-invariants/README.md)：每条一个 `S-<语义名>.md`，一行五列；下面是拟写的「不变量（拒绝什么）」与测试计划，代码位置随实现填。

| ID | 拒绝什么 | 断言「拒绝」的测试（计划） |
| --- | --- | --- |
| `S-return-trip-source` | 回程的来处只由可信外壳写：框架宿主按自己持有的页面授权（`page_id`、`storage_scope`）、Manifest 身份与根元素位置填 `from`；页面经 MessagePort 发来的 `return-go` 只许 `need` 与 `carry`，多一个字段（来处、安装、项目、界面、栏、地址）整条拒绝、不打开设置；`carry` 超长、字符不合、`need.kind` 不在封闭集合里同样拒绝；窗格转发只认那个窗格框自己的窗口（S-30）；插件框的存储转存碰不到 `molis-work:return-trips`（键一律加 `molis-plugin-page:<scope>:` 前缀） | `tests/security-invariants-return-trips.e2e.test.ts`：① 页面发带 `from`／`project` 的 `return-go`，设置没开、存储里没有回程；② `carry.step` 129 字符、含 `/`、`<`，`draft_key` 257 字符，`need: { kind: "connection" }`，都拒；③ 页面经存储转存写 `../molis-work:return-trips` 与同名键，外壳的键不变；④ 别的窗格或不是框的窗口发 `workbench-open-settings` 带来处，丢掉 |
| `S-return-trip-destination` | 回去只到工作台内部：回程没有 URL 字段，位置只由外壳从 `from` 算（关覆盖层、已登记的对象链接入口、`molis:assistant-open`）；界面名、对象 `kind`／`id` 不合现有格式的整张回程丢掉、不导航；存储里被改成带地址、带 `javascript:`、带外部 origin 的回程按形状检查丢掉；地址里不认 `return=`（U5 选否时，`return=` 只查同一窗口同一项目、未过期的回程，查不到什么都不做）；OAuth 回调的去向从不读回程 | `tests/security-invariants-return-trips.test.ts`（形状检查与位置计算，单元）：⑤ 回程 `from.surface` 为 `../x`、`https://evil.example`，`object.id` 含 `?`、`#`，丢掉且不导航；⑥ 多出 `href`、`url` 字段，丢掉；⑦ `v: 2`、缺字段，丢掉。浏览器用例：⑧ 设置地址带 `return=https://evil.example`、`return=<别的项目的回程号>`，设置照常、不回去、不跳转 |
| `S-return-trip-delivery` | 结果只交给来处：页面授权的安装、插件、界面、项目都对上才交，一次，交出即删；页面授权撤了、插件停用或卸载、换了安装、项目不同，一律不交；`ready` 只在回程模块向主人读回需要之后才给，设置页一句「保存了」、页面自己发的消息、别的回程的结算都不算；回程里不存草稿正文、密钥、地址的查询串 | 浏览器用例：⑨ 同一插件两个安装（或两个项目）各开一页，A 的回程结算后 B 的 `arrived()` 为 `null`；⑩ 结算后来处页面重建两次，只有第一次 `arrived()` 拿到；⑪ 停用插件后再启用，旧回程不交；⑫ 让模型设置路由返回保存成功但 `health` 不是 `ready`，回程不结算为 `ready`；⑬ 结算后读 `sessionStorage`，没有草稿正文与密钥字样 |

这三条都在外壳里，宿主没有新路由，所以没有宿主一侧的拒绝测试；判断「好了」时用的读（`connectors.connections.read@1`、`connectors.authorization.read@1`、C2 的 `read`、模型设置路由）沿用它们已有的不变量（S-37、`S-plugin-connection-card` 等），不放宽。

## 6. 产品检查与开工前检查

### 6.1 产品检查（开发流程第 3 节）

- **从用户的结果倒推**：用户在原处按下一步 → 缺配置 → 进设置补上 → 自动回到原处 → 那一步接着做完。中断（出错、改主意、刷新、关掉应用）后，原处的输入都在、配置都在，最多再点一次。
- **每一步都要站得住**：返回条回答「我从哪来、配好会怎样」，不是新的确认；「现在回去」让人随时退出；回来后不再问「要继续吗」（U1、U2 定下之前按推荐写）。
- **已有的授权和选择接着用**：回程不带授权；插件那一步原有的确认照问，不新加。
- **AI**：不涉及模型调用；模型能力不影响回程。
- **归谁**：回程是平台能力（工作台外壳）；草稿、步骤的含义、在等的工作各归原主人。
- **别漏掉的路径**：齿轮进入、空状态（没有任何模型）、失败与恢复、第一次和第二次进入（`met_at_open`）、中英文、窄屏的返回条（R2 定样）。

### 6.2 开工前检查（开发流程第 4 节）

| # | 回答 |
| --- | --- |
| 1 事实主人 | 新事实只有回程本身，主人是工作台外壳的 `settings-return`；模型可用归模型设置（宿主模型目录），连接与接入授权归连接主人，草稿归各插件或助理，引导记录归 Onboarding。回程只存引用，向主人读事实，不出现第二个主人 |
| 2 插件同等待遇 | `host.returns` 在所有插件共用的页面宿主上，不按插件名；普通链接的回程对所有插件一样；不加构建期接线；Alchemist、创作台不改代码也一样得到回到原处 |
| 3 能力注册 | 不加动作（2.4）；判断「好了」只读已注册的动作与设置路由；可信身份取自页面授权；不涉及 `scheduling` |
| 4 合同 | 改 `platform/ui`（加类型与 `returns`）、`platform/dom-events`（扩一条、加两条、改一句说明）；M1 之前不留兼容期；合同先单开 R0（只有类型与拒绝占位），页面事件与发它的代码同一个改动（R1） |
| 5 放在哪个包 | `apps/workbench`（外壳）与 `packages/contracts`；不进宿主，不新建 horizontal 包（回程是浏览器布局的事实，2.2） |
| 6 表与存储 | 不加库表；浏览器 `sessionStorage` 一个键，主人 `settings-return` |
| 7 兼容与迁移 | 不加；形状不对的回程整张丢掉 |
| 8 安全边界 | 碰「地址与路径校验」（开放跳转）与插件页面的通道：新增三条不变量（第 5 节） |
| 9 调用次数 | 见 3.4：发起 1 次读、结算 1 次读、回去 0 次；后台不轮询 |
| 10 升级与数据 | 不涉及库；回程不跨应用重开（U3 推荐 A），升级不影响 |
| 11 成果与过程项 | 不涉及：回程不是成果，也不交给别的插件 |
| 12 页面与外壳 | 插件不出整页，设置仍是外壳的覆盖层；新页面事件在 `dom-events.ts` 登记；页面资源增长在 R1 写明 |
| 13 错误 | 外壳一侧不加错误码；`go()` 的拒绝是固定文字（同 `connectionNeed`）。若 R1 需要宿主读路由补字段，新码用 `defineErrorCodes` |
| 14 冲突面 | 枢纽 `dom-events.ts`、`apps/workbench/src/i18n/en.ts`：07-S1～S5 依次叠分支在改，R1 与它们排时段（第 10 节）；`settings-directory.ts`、`plugin-frame/parent.ts`、`child.ts`、`types.ts` 不在 07-S1、S2 的文件里；`tab-workspace*.ts`、`tab-workspace-ops.ts`、`immersive-shell.ts` 不碰；④c-2 也改 `plugin-frame/` 下的文件，R1 与④c-2 串行 |

## 7. 验收标准

1. **DRT-01** 从插件页面的普通链接进模型设置，配好第一个能跑的模型（需要从没有变成有）：覆盖层先关、回到来处、提示一句，之后才发 `molis-work:model-ready`；来处的输入、选中、滚动位置不变，页面没有重建。
2. **DRT-02** 从齿轮、菜单或地址直接进设置：不开回程、不出返回条、保存后不自动关。
3. **DRT-03** 打开时需要已经满足（已有模型还点了模型设置）：保存后不自动关，返回条写「回去」；点了回到来处。
4. **DRT-04** 设置里出错（密钥被拒、登录失败、限流、检查没通过）：留在设置，填的还在，返回条还在；人点「现在回去」或自己关设置，来处拿到 `not_ready`，什么都不重做。
5. **DRT-05** `host.returns.go` 带 `draft_key`、`step`：配好回来时 Promise 答 `ready` 并原样带回 `carry`；插件只把那一步做一次（同一幂等键），原有确认照问；`not_ready` 时不做。
6. **DRT-06** 在设置里刷新：覆盖层重开后返回条还在，配好后照 DRT-01 回去；来处页面重建后 `arrived()` 拿到一次结果，第二次为 `null`。
7. **DRT-07** 来处在别的栏或右侧：回去时落到已开的那一份，不新开第二份；带 `object` 且来处页面已关时，打开到那条记录；没有 `object` 时只关覆盖层并说明。
8. **DRT-08** 来处的插件停用、卸载、页面授权撤了，或换了项目：结果不交给别的安装、别的项目；设置照常关。
9. **DRT-09** 关掉应用再打开（U3 推荐 A 的口径）：来处的草稿与新配置都在，读回事实显示可用；那一步不自动做；没有残留的回程。
10. **DRT-10** 助理对话的「继续接入」进连接页并连好：回到那项工作；在等的工作只接着做一次（§4.7）；取消接入则回到工作、不重做。
11. **DRT-11** 连接提醒进设置并连好：关掉覆盖层回到原处，提醒按原规则消掉。
12. **DRT-12** 在新标签或系统浏览器里完成 OAuth：原窗口得知完成后照 DRT-01 回去；回调落地那一页写「可以关掉」，不在那一页另做一遍回去，也看不到原窗口的回程。
13. **DRT-13** 原处连接卡「还不能一键连接」去连接页并连好：回到卡所在的页面，卡再读一次后接着它自己的流程。
14. **DRT-14** Onboarding 连模型（U5 推荐的口径）：在本页的设置对话框里连，连好后引导自己重读并接着那一步；桌面壳里同样可用；Gmail 的 OAuth 回程不变。
15. **DRT-15** 回程里没有草稿正文、密钥、地址；`carry` 超长或字符不合、`need` 不在集合里的 `go()` 被拒，设置不开。
16. **DRT-16** 一个窗口一份：另一个标签页看不到、不处理这个窗口的回程。
17. **DRT-17** 请求数按 3.4：发起与结算各读一次需要，回去不发请求，设置隐藏或标签页在后台时不轮询（用例里数同源请求）。
18. **DRT-18** Alchemist、插件创作台不改代码：从它们的模型链接进设置、配好后回到原处。
19. **DRT-19** 安全：`S-return-trip-source`、`S-return-trip-destination`、`S-return-trip-delivery` 三条的拒绝测试全部通过。
20. **DRT-20** 返回条与回来后的提示在中英文、浅深色、1440／1024／390 下成立，读屏能听到「从哪里来」和状态变化，键盘能走到「现在回去」。
21. **DRT-21** [人工] PF-A07 的退出证据：第 4 节每个要改的消费者各走一遍——进入设置、失败返回、取消返回、成功返回、重开后继续；工程、实操、本人验收分三级记在本 spec 的证据节。共享实现通过不替代消费者接入的验证。

## 8. 拆片

按开发流程第 1.1 节「大需求」：合同先行，服务其次，界面与消费者叠在后面。PR 粒度照路线书的规矩：一项交付完整做完、或别的片真要先用到时才开 PR，同一片的后续步骤叠在一个分支上。全量由统筹在集成分支跑，写手不跑全量；单跑用 `node scripts/run-tests.mjs <文件…> --jobs 1`，先用 `node scripts/affected-tests.mjs` 选。

| 片 | 内容 | 文件范围 | 前置 | 要跑的测试 |
| --- | --- | --- | --- | --- |
| **R0 合同** | `UiReturnNeed`、`UiReturnCarry`、`UiReturnOutcome`、`UiPageReturns` 与 `UiPluginClientHost.returns`；`child.ts` 的固定拒绝占位；SDK 再导出类型名；`pnpm api:update` | `packages/contracts/src/platform/ui.ts`、`packages/plugin-sdk/src/`（类型再导出处）、`apps/workbench/src/browser/plugin-frame/child.ts`、`tooling/gates/api/` | 第 11 节的 U1、C4 定了 | `pnpm health:check`（API 快照、文档引用）、`tests/plugin-sample.e2e.test.ts` 的类型检查一半（SDK 只依赖 contracts） |
| **R1 外壳回程（服务）** | 回程的存取与形状检查、发起（`go`、普通链接、平台界面）、结算（模型设置的保存、人回去、人自己关、刷新与启动时）、回去（关覆盖层、对象链接入口、`molis:assistant-open`）、交还（`return-settled`、`arrived()`）；`sentFromPage` 挪进回程；三条页面事件登记与 `model-ready` 说明；三条安全不变量与它们的测试；文档（`docs/platform/UI-PLATFORM.md`、`docs/platform/PROLOGUE-AI.md`「第一次配置」、`skills/molis-plugin-dev`、`skills/molis-prologue-ai` 步骤 6、`apps/workbench/README.md`） | 新 `apps/workbench/src/scripts/client/settings-return.ts`、`apps/workbench/src/browser/return-trips.ts`；改 `settings-directory.ts`、`plugin-frame/parent.ts`、`child.ts`、`types.ts`、`packages/contracts/src/platform/dom-events.ts`、`apps/workbench/src/i18n/en.ts`（提示语）、`docs/system/security-invariants/S-return-trip-*.md`、新测试 | R0；与④c-2 串行（同改 `plugin-frame/`）；与 07 在 `dom-events.ts`、`en.ts` 上排时段 | `tests/model-first-setup.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`、`tests/model-ready-cross-tab.e2e.test.ts`、`tests/cognia-embedded-settings.e2e.test.ts`、`tests/security-invariants-plugin-pages.test.ts`、`tests/security-invariants-plugin-pages.e2e.test.ts`、新 `tests/settings-return-trips.e2e.test.ts`（DRT-01～09、15～18）、新 `tests/security-invariants-return-trips.test.ts` 与 `.e2e.test.ts`（DRT-19）；`pnpm health:check`（页面事件、页面资源、巨大单元） |
| **R2 返回条（界面）** | 先定样（U4），再做成组件板标本，再进设置的两处落点；回来后的提示用现有 toast | 组件板与设置外壳的样式和渲染（具体文件随定样定）；`DESIGN.md` 设置一节 | U4 定样；R1 | 新用例里的 DRT-20 部分、`tests/connections-page.e2e.test.ts`（ASC-76 的「接着改」不受影响）、组件板快照 |
| **R3 模型消费者** | Cognia、工作流程、Coding 改用 `host.returns.go`（第 4 节）；Coding 的输入草稿改存 `host.drafts`；各插件 README「改动后必跑」补用例 | `plugins/native/cognia/src/`、`plugins/native/workflows/src/browser/`、`plugins/native/coding/src/browser/`、各自的 README 与测试；`skills/molis-plugin-dev` 的例子 | R1（R2 可并行） | `tests/cognia-embedded-settings.e2e.test.ts`、`tests/workflows-plugin.test.ts`、`tests/coding-model-controls.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`，各插件新增的 DRT-05 用例 |
| **R4 13⑤ 接入** | 连接页作为落点（授权监视与保存结算、「连好以后」让位、回调落地页文案、`setup` 需要）；助理「继续接入」与提醒作为来处；原处连接卡「还不能一键连接」开回程 | `apps/workbench/src/scripts/connectors-settings.ts`、`apps/workbench/src/settings-connectors.ts`、助理的「继续接入」画法处、`apps/workbench/src/browser/plugin-frame/` 里卡的那部分 | R1、R2；卡的那一行等④c-2 合入 | `tests/connections-page.e2e.test.ts`、`tests/security-invariants-connection-card.test.ts`、新用例里的 DRT-10～13 |
| **R5 Onboarding** | 连模型改用独立 Home 模型设置对话框并开回程；删 `BroadcastChannel('molis-work:model-ready')`（若没有别的监听者） | `apps/workbench/src/scripts/context-onboarding.ts`、`apps/workbench/src/scripts/home-model-settings.ts`、`apps/workbench/src/scripts/settings-models.ts`、`dom-events.ts` 里 `model-ready` 的说明 | R1；U5 | `tests/onboarding-journey.e2e.test.ts`、`tests/model-ready-cross-tab.e2e.test.ts`（删或改）、`tests/model-first-setup.e2e.test.ts`、DRT-14 |
| Images、Feed | 删 `resumeConnection`、去设置的链接让位给卡 | 随④c-2 | ④c-2 | 随④c-2 |

本稿这一步只改文档，没有跑测试。

## 9. 界面：组件板能覆盖什么、要定样的

| 界面 | 组件板现有的能不能覆盖 | 结论 |
| --- | --- | --- |
| 回来后的一句提示（「模型已连接，回到 Coding 接着做」） | 能：现有 toast（`host.showToast`，`settings-directory.ts` 已在用） | 不定样，只加文案 |
| 设置顶上的返回条「从 Feed 来 · 连好后自动回去 · 现在回去」，三种状态（等着、已经好了、原来的页面已关） | 不能：组件板没有这一条；最接近的是 13 定样原型里块 ③ 方案 B 的顶条（`docs/design/service-connections/`），用户 11-04 选了 A（原处就地连），B 没有进组件板 | **要定样**（U4）：推荐照 B 的顶条，用 `mw-alert` 的信息档加一个 `mw-btn` 次要按钮，补成组件板标本后进设置 |
| 刷新或重开后在原处问一句「刚才去配了模型，已经好了 · 接着发送／不用了」 | 能：同连接页「高级」的「接着改／放弃改动」（`settings-connector-draft`，`mw-alert` 加两个按钮）；画在插件自己的页面里，插件已有 `mw-alert` | 只有 U2 选「问一句」时才用；不定样 |
| 原处连接卡「还不能一键连接」的去连接页入口 | 能：#1862 的卡标本已有这一种 | 不定样 |
| 回调落地页文案 | 能：现有连接页的反馈行 | 不定样，只改文案 |

## 10. 与在途工作的边界

**第 07 批 S1（[#1853][PR1853]，右侧并入窗格，暂停中）、S2（[#1867][PR1867]，打开、召回与布局，叠在 S1 上）**。看过两份 diff 的文件清单与 S2 的说明：

| 07 管 | 本项管 | 交界怎么处理 |
| --- | --- | --- |
| 窗格、标签、右侧、独看、跨栏召回（`openSurfaceEntry` → `recall`）、「返回」历史、工作区状态 `molis-work-tab-workspace:<项目>`、覆盖层的 `closeCover`／`noteCover`（`tab-workspace-places.ts`） | 回程：来处、需要、交还；设置覆盖层上的返回条；什么时候关覆盖层 | 本项只调已有的 `host.closeCover()`、`host.noteCover`，和对象链接入口（`?openPlugin=`），不改 `tab-workspace*.ts`、`tab-workspace-ops.ts`、`immersive-shell.ts`；S2 合入后对象链接入口自动经召回，本项不用跟着改 |
| 标题栏的「返回」箭头走窗格自己的历史 | 「回到原处」不是历史后退，不往窗格历史里加条目 | 两者分开：关覆盖层不算窗格里的一步 |
| `plugin-frame/navigation.ts`（S1 改） | `plugin-frame/parent.ts`、`child.ts`、`types.ts` | 不改同一个文件 |
| 枢纽 `dom-events.ts`、`i18n/en.ts`（S1、S2 都改） | R1 也改 | R1 的这两处排在 07 的叠分支之外的时段；冲突由统筹按批落规则一次解 |

**不等 07**：07 暂停到第 13、18、02 批完成，而 13⑤ 在等本项；本项若等 S2 的召回就会互相卡住。所以 R1 用今天就有的对象链接入口，S2 合入后同一入口改走召回，DRT-07 的「不新开第二份」在 S2 之前按现有打开行为验，S2 之后补测一次（C6）。

**第 13 批④c**：④c-1 宿主路由已合；④c-2（外壳画卡、Feed 与 Images 接卡）改 `plugin-frame/` 下的文件，与 R1 串行；卡内的流程不改，R4 只加「还不能一键连接」去连接页那一下的回程。

**第 18 批 P3**：防遮盖模块（`framed-area.ts`）只与④c-2 有关；返回条在设置覆盖层里（可信文档、不在插件框外贴着），不用它。

没有发现必须写成待决的文件冲突；`dom-events.ts` 与 `en.ts` 的时段归统筹排（C9）。

## 11. 待决

### 11.1 要用户拍板

| # | 事 | 推荐 | 理由 |
| --- | --- | --- | --- |
| U1 | 配好回到原处后，刚才按下的那一步要不要自动做一次（模型与设置页返回，和④c 原处连接卡同一条规则） | **要**：同一窗口里回来就做那一步一次，插件按原幂等键做，原来就要确认的（花钱的、不可撤回的）照原样再问，原来没有的不新加 | 用户 11-06 对④c 已经这样定；两种回来的方式规则一样，人不用记哪种会接着做；PFG-05「只有真正依赖新配置的步骤继续」 |
| U2 | 刷新以后（页面重建过）拿到「已经好了」，是自动做那一步，还是在原处问一句「接着发送／不用了」 | **问一句**：一行提示加两个按钮，照连接页「接着改／放弃改动」的样子 | 刷新可能隔了一段时间，人未必记得刚才按过什么；自动做一件可能花钱的事会吓人；不刷新的常见情况仍按 U1 自动做 |
| U3 | 关掉应用再打开之后怎么接：A 回程只活在这个窗口（刷新还在，重开不在），重开后草稿与配置都在、人自己再点；B 回程存本机浏览器，重开后在原处问一句；C 回程存在宿主 | **A** | PF-A07 的「重开后继续」靠草稿和读回的配置就做到了，不丢东西；B 要给所有标签页加「哪个窗口的」归属判断，OAuth 回调那一页也会看到；C 要新库表、升级步骤和授权路由，只为多问一句 |
| U4 | 设置顶上的返回条长什么样（定样） | **照 13 原型块 ③ 方案 B 的顶条**：「从〈来处〉来 · 配好后自动回去 · 现在回去」，三种状态（等着／已经好了／原来的页面已关），做成组件板标本 | 11-04 已经画过、用户看过；③ 选了 A 不影响这一条：A 管原处就地连，这一条只在真进了设置页时出现 |
| U5 | 开始使用页「连接文字模型」改成在本页的设置对话框里连（已有的独立 Home 模型设置对话框），不再开新标签 | **改** | 桌面壳把新标签交给系统浏览器，那边收不到「连好了」（13 的核账）；对话框已经存在，不是新做；连好后引导照旧自己重读，接着那一步 |

### 11.2 统筹可以定

| # | 事 | 推荐 |
| --- | --- | --- |
| C1 | 回程期限与上限 | 开着的 24 小时，有结果未交的 1 小时，每项目 8 张，同一来处替换 |
| C2 | 页面事件 | 扩 `molis-work:open-settings-path`、加 `molis-work:return-arrival`（请求，同步回填）与 `molis-work:return-settled`（宣告），`molis-work:model-ready` 只改说明；不加 §13.5 草案的 `molis-work:connection-settled` |
| C3 | 普通链接的需要推断表 | 只三条：模型设置 → `model`；连接页带 `connector` → `connection`；带 `setup` → `setup`；其余 `none` |
| C4 | `UiReturnNeed` 第一版的范围 | 只有 `model`；连接一律走 `connectionNeed`；工作目录等设置类需要以后另开合同 |
| C5 | 页面状态主人 | 新主人 `settings-return`，不并进 `settings-directory` |
| C6 | 回到别的栏用什么入口 | 用现有对象链接入口，不等 07-S2；S2 合入后补测 DRT-07 |
| C7 | `BroadcastChannel('molis-work:model-ready')` | R5 后没有监听者就删；`model-ready` 是否在每次「从不能用变成能用」都发，另议，本项不改 |
| C8 | 回调落地页文案 | 「已连上。回到 Molis Work 的窗口，刚才的事会接着做；这一页可以关掉。」，随 R4 |
| C9 | 片的写手与时段 | R0、R1 由工作台外壳的写手做，R4 交 D·13 连接会话，R5 交 Onboarding 的主人；R1 与 07 在 `dom-events.ts`、`en.ts` 上排时段，与④c-2 串行 |

## 12. 决策记录

（还没有。用户与统筹定了以后按日期写在这里，正文跟着改。）

## 13. 证据

本稿：只读核查 main `c39746b20`（文件与行号见第 1.1 节），看过 [#1853][PR1853]、[#1867][PR1867] 的文件清单与 #1867 的说明；没有改产品代码，没有跑测试，没有启动 Home。

[B12]: ../post-anticorruption-roadmap/reference/batches/12.md#batch-12-item-3
[B13]: ../post-anticorruption-roadmap/reference/batches/13.md#batch-13-item-1
[AUDIT]: ../product-flow-governance/audit-2026-10-27.md
[PFG]: ../product-flow-governance/spec.md
[ASC]: ../assistant-service-connections/spec.md
[PR1853]: https://github.com/molis-ai/molis-work/pull/1853
[PR1867]: https://github.com/molis-ai/molis-work/pull/1867
