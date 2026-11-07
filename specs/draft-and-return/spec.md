# 草稿与返回：从哪里来、回到哪里、接着做什么（路线书 12 第三项）

状态：设计稿（2026-11-07），没有实现，也没有改合同代码。第 13 批统筹按用户 11-07 的安排派写手写稿。评审台第一轮（[#1928 评论][REVIEW1]）、第二轮（[#1928 评论][REVIEW2]）与第三轮（[#1928 评论][REVIEW3]）的意见已按统筹裁定改进本稿，见第 12 节；第三轮剩下的一条挡合并已改，等评审台核。第 11.1 节四项用户 11-07 已定，第 11.2 节由统筹定。第 13 批⑤等本项合入后接入。本稿由 Claude（第 13 批统筹派的写手）维护；实现片的写手按第 8 节由统筹派。

- **档位**：大需求。新的平台能力，改 `UiPluginClientHost` 合同，跨工作台外壳、设置页与多个插件。
- **类型**：横向能力（主）；产品线（工作台、服务连接、模型设置、各插件）；体验与效果。
- **决策**：第 11.1 节四项用户已定（含返回条定样的方向）；第 11.2 节由统筹定。
- **相邻的线**：
  - 第 13 批⑤「连完回到原处」是第一个消费者。
  - ④c 原处连接卡（[服务接入需求][ASC] §13.5）覆盖在原处就地连；本项只管「进了设置页再回来」。④c-2 先合，本项在它之上变基（第 8 节）。
  - 第 07 批工作台导航（S1 [#1853][PR1853]、S2 [#1867][PR1867]）管窗格、标签、召回与覆盖层。本项在 `tab-workspace.ts` 的窗格转发处、`tab-workspace-places.ts` 的位置宣告处各改最小的一处，先于 S1、S2 合入，边界见第 10 节。
  - 第 18 批 P3-1（[#1929][PR1929]）的防遮盖模块只与④c-2 有关，本项不碰。
- **需求来源**：[12 第三项][B12]；[治理核查 PF-A07][AUDIT]；[治理需求][PFG] 的 PFG-04～06；[13 的核账][B13]「六、连好之后能不能回到原来的工作」「七、实现时要做的」。

## 0. 给人讲清楚

在 Cognia、Coding、工作流程这些地方，缺模型或缺账号时，页面会给一个「打开模型设置」之类的入口。现在的问题有三个：

- 点进去配好以后，常常要自己找回原来的地方，刚才按下的那一步也要重新点；
- 从齿轮进去的、刷新过的、在系统浏览器里登录的，各是各的情况；
- 各个插件还各写了一份「回来以后怎么办」。

这一项做一份平台共用的「回程」，记三件事：从哪里进的设置，配好后回到哪里，回来后接着做哪一步。

- 配好了，就自动回到原处，并说一声。
- 没配好、出错或改了主意，就留在设置里，或者带你回去，原来写的东西都不动。
- 各插件不再各写一份，只告诉平台「我这一步缺什么」。

你 11-07 定了四件事（第 11.1 节）：

1. 配好以后都回去。只有插件明说「这一步缺模型」的，才自动把刚才那一下做掉。
2. 刷新以后先问一句。
3. 只记在当前窗口。
4. 设置页顶上用 11-04 方案 B 那条顶条，做成组件板的标准件。

## 1. 要解决的问题与范围

### 1.1 现在怎样（main `c39746b20`）

先说一个前提：设置是**盖在工作台上的覆盖层**（`exclusive`），不是另一页。`apps/workbench/src/scripts/client/settings-directory.ts` 打开它，`host.closeCover()` 关它。在同一个标签页里从插件点进设置，插件页面还在覆盖层下面活着，输入和选中都在。所以大多数情况下，「回到原处」就是在对的时候关掉覆盖层。真正丢东西的，是下面这些情况。

| 来处 | 现在 | 缺什么 | 证据 |
| --- | --- | --- | --- |
| 插件框里的普通链接（Cognia、工作流程、Coding、Jelly、Dataset、Form、PPT、Schedule、Shelf） | 链接 `/settings/models` 经框架转发（`apps/workbench/src/browser/plugin-frame/parent.ts` 的 `openSettings`）发 `molis-work:open-settings-path`。窗格文档里的页面经窗格转发：`tab-workspace.ts:64-71` 拦下点击，`:487-490` 外层只带 `{ href }` 再发。只在「第一个能用的模型」保存时，`settings-directory.ts` 的 `modelReady` 用 `sentFromPage` 先关覆盖层、提示「模型已连接，可以继续了。」，再发 `molis-work:model-ready` | 换模型、修好坏掉的模型、加第二个供应商，都不回去。`sentFromPage` 只是内存里的一个布尔，刷新就没了。事件不带原来的任务、输入、选中。插件不知道人是为哪一步去的，只能靠事件重读整页 | `settings-directory.ts:101-108,368`；`packages/contracts/src/platform/dom-events.ts:260` |
| 外层文档里的客户端：Alchemist、插件创作台（两个构建期例外） | Alchemist 的链接由 `settings-directory.ts:414-433` 的点击处理接住。创作台在网页里直接在外层文档发 `open-settings-path`；在桌面壳里用 `molisWorkOpenExternalUrl` 把设置交给系统浏览器（`plugins/native/plugin-builder/src/agent-studio.ts:525`） | 同上。创作台在桌面壳里根本不在这个窗口打开设置 | 同左 |
| 齿轮、菜单、地址直接进 | 不回去 | 按设计就没有来处，不算缺陷。但现在分辨它和「从页面来」，只靠 `fromPage` 一个参数 | `settings-directory.ts:404-441` |
| 设置的连接页 | 登录时先 `window.open('', '_blank')` 占一个新标签：打开时带着 opener，之后才 `popup.opener = null`（`connectors-settings.ts:167-172`）。原窗口每 2 秒读一次授权记录。回调把新标签带到 `/settings/connectors?connected=…` 或 `/capabilities/connections?setup=…`，页面写「请回到原来的应用窗口继续」 | 原窗口连好以后不回到来处。新标签是一整份工作台，带着**复制来的** `sessionStorage`：带 opener 打开时，浏览器会复制打开者的会话存储，事后清掉 opener 也不撤回。在桌面壳里，登录在系统浏览器里完成 | `apps/workbench/src/scripts/connectors-settings.ts:167-215,620`；`apps/local-host/src/web-connector-api-methods.ts:34-36`、`web-connector-methods.ts:37` |
| 连接页「连好以后」 | 一段往前走的链接（「打开 Feed，添加来源」，`?openPlugin=`） | 这是往下一步走，不是回到来处；有来处时，两者会打架 | `connectors-settings.ts:621-628`；`apps/workbench/src/settings-connectors.ts:70` |
| 连接页「高级」 | 没保存的改动留在这个窗口，回来时提示「接着改」「放弃改动」（ASC-76） | 这是设置页自己的草稿，本项不改；返回提示照它的样子做 | `connectors-settings.ts:529-549`；`tests/connections-page.e2e.test.ts` 的 ASC-76 |
| 助理对话 | `connectors.setup.prepare@1` 给「继续接入」（`/capabilities/connections?setup=<授权号>`）。授权完成后，`molis.connector-setup@1` 的等待会把那项工作接着做一次（§4.7） | 工作会接着做，人不会被带回那项工作 | `apps/local-host/src/connector-setup.ts:24`；[服务接入需求][ASC] §4.7 |
| 连接提醒 | 助理提醒 `kind: "connection"` 带一个 `settings_path`，只许 `/settings/` 开头（#1861） | 去了设置，连好不回 | `apps/workbench/src/scripts/client/assistant-notices.ts:13` |
| Onboarding | **已经在引导里就地连模型**：「连接文字模型」交给 `molisWorkOnboardingModel.act`（`context-onboarding.ts:756`），界面在 `apps/workbench/src/scripts/onboarding-model-slide.ts`，就地保存（#1310；已归档的 [onboarding-model-link][ONBMODEL] 的 ONB-MODEL-01）。Gmail 的 OAuth 有自己的回程（`OAuthReturn`，记在引导记录里的等待）。引导页还在听 `BroadcastChannel('molis-work:model-ready')`（`context-onboarding.ts:776-781`），发它的是模型设置脚本（`settings-models.ts:13`） | 不缺回程。那条跨标签通道现在只服务一种情况：引导开着时，人在另一个标签页的设置里配好了模型。`docs/platform/PROLOGUE-AI.md:204` 与 `dom-events.ts:262` 写的「开始使用页在新标签打开设置」已经过时 | 同左 |
| 独立 Home 的模型设置对话框 | 在没有项目的 Home 页面上，它是 `open-settings-path` 的第二个监听者，只接 `/settings/models`、`/settings/connectors`、`/capabilities/connections`（`home-model-settings.ts:83`） | 没有插件框，也没有工作区；本项第一版不在这里开回程（第 4 节） | 同左 |
| Feed | 链到 `/settings/connectors?connector=…&project=…`，回来靠人 | ④c-2 改成原处连接卡后，这条链接只剩「还不能一键连接」那一种 | `plugins/native/feed/src/ui.ts:421-426` |
| Images | 自己记 `resumeConnection`：在对话框里点设置链接时，记下正在编辑的连接；回来再开对话框时接着编辑 | 这是一个插件自己写的回程。它缺的是图像服务，不是文字模型。④c-2 的卡取代缺密钥那一处之后，这段可以删 | `plugins/native/images/src/browser/commands.ts:126-130`；`connections.ts:131-134` |
| 工作流程 | 连接浮层里的「打开模型设置」是普通链接。`ui.returnTo` 是工作流程自己「从运行回到编辑、再回运行」的返回 | 去设置这一段没有回程。`returnTo` 是它自己的事实，不归本项 | `plugins/native/workflows/src/browser/link.ts:46-56` |
| 已有的草稿 | 插件页在不透明来源的沙箱框里，`sessionStorage`／`localStorage` 经外壳按安装加前缀转存（`parent.ts` 的 `stored` 与 `:250-253`）。另有平台的 `host.drafts`：存在 Cache 里，按安装与项目分开，关掉应用也在 | 草稿本身不缺。缺的是回来时知道该拿哪份、接着做哪一步 | `parent.ts:27-38,250-253`；`apps/workbench/src/browser/plugin-frame/drafts.ts`；`packages/contracts/src/platform/ui.ts` 的 `UiPageDrafts` |
| 覆盖层关掉或换掉 | 每次 `apply()` 收尾都调 `announcePlace`，发 `molis-work:place-changed { paneId, place, previous }`。有覆盖层时，`place` 是 `cover:<kind>|…`，所以关掉、换成别的覆盖层、在设置里换页，都会宣告 | 宣告的 `place` 是 `tab-workspace` 私有的格式，别的主人不该拆它；载荷里也没有一个字段直接说「现在是哪个覆盖层」 | `tab-workspace-places.ts:22,206-214`；`tab-workspace-panes.ts:312`；`dom-events.ts:275-278` |

### 1.2 缺的就三样

1. **一张记着来处的单子**：由平台写、平台读，刷新以后还在，只属于开它的那个窗口。
2. **「好了」的判断**：去设置要补的那件事，回来之前由平台向它的主人读一次。不凭设置页一句「保存了」，也不凭点过按钮。
3. **一条把结果交回来处的路**：插件认领「好了／没好」和它当初说的那一步，只接着做那一步。

### 1.3 范围

做：

- 回程的形状、存法、期限、窗口归属、谁能读。
- 三种发起方式：从插件页面、从平台界面（助理、提醒、原处连接卡）、从普通链接进设置。
- 两个落点：模型设置；服务连接页（含助理的「继续接入」）。
- 各种情况：成功、失败、取消、人自己关设置、人自己离开来处、刷新、关掉应用重开、在弹出的标签页或系统浏览器里登录。
- 各消费者的接入清单（第 4 节）和拆片（第 8 节）。

不做：

- **不存业务内容**。草稿正文、密钥、地址、选中对象的标题都不进回程。草稿仍在各自主人那里：插件的 `host.drafts` 或存储、助理工作的草稿、连接页「高级」、引导记录。
- **不造第二份模型或账号状态**（PF-A07）。「好了没有」每次都向主人读。
- **不替插件重放任何一步**。这与④c 第 1 项是同一条规则：平台只告诉插件「好了，你刚才说的是这一步」。
- **不改原处连接卡**（④c）。就地连仍是首选；只有卡里「还不能一键连接」去连接页那一下，才用到回程。
- **不改工作台的窗格、标签、召回、返回历史**（第 07 批）。只在窗格转发与位置宣告处各改最小的一处（第 10 节）；关覆盖层沿用现有 `closeCover` 的历史语义。
- **不把链接改成弹窗**（PF-A07 明写）。设置仍是一处，各插件不各开一个设置对话框。
- **不改 Onboarding**。它已经就地连模型（#1310）；Gmail 的 OAuth 回程是引导记录自己的事实。
- **不改登录弹窗的打开方式**，不改成 `noopener`。原因：`noopener` 会让 `window.open` 返回 `null`，拿到授权地址以后就没法再给弹窗换地址；要改成同步打开一个本源的开始地址，就得让一个 GET 带副作用，那会碰 OAuth 的几条安全不变量。复制来的存储由 2.2 的窗口归属挡住。
- **浏览器崩溃后恢复的标签页，不保回程**。这样的标签页启动时读不到离开记号（2.2），按新窗口处理，回程丢掉。后果只是少一次自动回去：草稿和配置都在。这与 U3 选 A 一致。
- 从齿轮、菜单、地址直接进设置：没有来处，不回去（第 3.2 节）。
- 后台作业缺配置：仍走 #1870 的提醒。Agent、MCP 要连接：仍走 `connectors.setup.prepare@1` 加等待。
- 创作台在桌面壳里把设置交给系统浏览器：本项不改（它是构建期例外，BL-377 重做时再接）。

## 2. 合同提案

### 2.1 一张「回程」

名字叫**回程**（return trip）。它只回答三件事：从哪里来，去补什么，回来以后交还什么。

```ts
// 外壳内部的记录（apps/workbench，不是公开合同）。存法与窗口归属见 2.2。
interface ReturnTrip {
  v: 1;
  id: string;                 // crypto.randomUUID()；插件框的由框架宿主生成，其余由主人生成
  window: string;             // 开它的那个窗口的窗口号（2.2）；对不上的回程这个窗口只读、不结算、不认领
  project: string;            // 工作台页面自己的项目；没有项目的 Home 页面第一版不开回程（第 4 节）
  from:                       // 外壳按可信信息写下，见 2.3
    | { kind: "page"; mount: string; scope: string; plugin: string; surface: string;
        place: { pane: string; surface: string } | null }
        // 插件页面：本次挂上时框架宿主生成的随机号、宿主给的 install:project、Manifest 身份、界面，
        // 以及页面所在的窗格与界面（算法见 2.3，不记框的键；侧栏格为 null）
    | { kind: "assistant"; work_id: string }         // 助理对话里的一项工作
    | { kind: "under-cover" };                       // 平台界面或外层文档里的普通链接：回去就是关掉覆盖层
  claim: boolean;             // 只有 host.returns.go 开的为 true：结果要交给来处页面认领；普通链接开的为 false，结算即删
  need:                       // 去补什么；「好了」只按它向主人读（2.5、3.4）
    | { kind: "model" }                              // 有一个能跑的文字模型（模型目录的 health）
    | { kind: "connection"; service_id: string; slot?: { slot_id: string; record_key?: string } }
    | { kind: "setup"; authorization_id: string }    // 一次接入授权到了 connected；只由平台界面明确给出
    | { kind: "none" };                              // 只回来，不判断，永远不自动关
  met_at_open: boolean;       // 打开时需要是否已经满足；已满足的不自动回去（3.2）
  carry?: { draft_key?: string; step?: string; object?: { kind: string; id: string } };  // 插件给的名字，原样交还
  cover: string;              // 打开的设置位置（noteCover 记的那一项），刷新后据它重新接上
  opened_at: number; expires_at: number;
  outcome?: { status: "ready" | "not_ready"; at: number };   // 已结算、等认领（只有 claim 为 true 的才会留着）
}
```

- **草稿引用**是 `carry.draft_key`：它是插件自己 `host.drafts` 里的键（≤256 字符，与 `UiPageDrafts` 的键长相同）。外壳不读它，草稿正文从不进回程。
- **在等的工作**：
  - 插件的是 `carry.step`（≤128 字符，`[A-Za-z0-9._:-]`，插件自己起名，如 `send:<幂等键>`）。
  - 助理的就是已登记的 `molis.connector-setup@1` 等待。回程只记 `work_id` 和授权号，不另记一份等待。
- **选中对象**是 `carry.object`。`kind` 原样交还给插件，外壳不用。外壳要把人带回那条记录时，只用 `from.surface` 加 `object.id` 拼对象链接（2.3）。
- **来处只记本次挂上的随机号，不记页面授权号**。页面授权号（`parent.ts:106` 取得，`:159` 当 `x-molis-plugin-page` 头）是凭据一样的东西，而且每次挂上都换新的。重建以后，按 `scope`、`surface` 与 `place` 认领就够了（2.4）。
- **合同里不出现地址**。回程**没有任何 URL 字段**，回去的位置由外壳从 `from` 算（2.3）。

### 2.2 谁存、存在哪、存多久、谁能读，属于哪个窗口

| 问题 | 定法 | 理由 |
| --- | --- | --- |
| 谁存 | **只有一个写入方**：外层文档里新的页面状态主人 `settings-return`（新文件 `apps/workbench/src/browser/settings-return.ts`）。形状检查与窗口号放在 `apps/workbench/src/browser/return-trips.ts`，只供这个主人用。框架宿主、窗格文档、助理、设置页都不直接读写存储，一律经页面事件（2.6）。窗格文档里不装这个模块（嵌入时什么都不做）。主人在外层文档脚本启动时**同步**初始化，在工作区挂上任何框之前就能回答认领 | 回程里记的是栏、标签、挂载这些**浏览器里的布局事实**，它们的主人本来就在外壳；放到宿主，就是给浏览器布局在宿主里另记一份。只有一个写入方，「交出即删」和「留给重建后认领」才不会互相打架。`settings-directory.ts` 已经 463 行，不往里加 |
| 存在哪 | 这个标签页的 `sessionStorage`，用三个键：`molis-work:return-trips`（按项目分开）、`molis-work:return-window`（窗口号）、`molis-work:return-window-handoff`（离开记号）。这是 U3 已定的 A | 刷新以后还在。插件框的存储转存一律加 `molis-plugin-page:<scope>:` 前缀（`parent.ts:250-253`），碰不到这三个键 |
| 属于哪个窗口 | 每个窗口在 `sessionStorage` 里记一个随机的窗口号，回程带上它。窗口号会随会话存储一起被复制：带 opener 打开的标签页、浏览器的「复制标签页」都会复制。分辨的办法是**离开时留记号**：<br>• `pagehide` 时写 `molis-work:return-window-handoff = { id, at }`；页面从往返缓存里回来（`pageshow` 且 `persisted`）时，把这个记号删掉。<br>• 启动时读出记号就删。记号在外层脚本最早的时候同步读，不等页面加载完。读到的是本窗口号、且 10 秒以内的，就是这个标签页自己刷新或站内跳转，沿用窗口号。读不到、或者过期了，就是新标签或复制出来的：换一个新窗口号，把存储里的回程全部删掉。<br>• 从往返缓存回来时，除了删记号，主人还要**从存储里重读回程**：这期间同一个标签页的另一份文档可能已经认领或删掉了回程，内存里那份已经过时。<br>• 浏览器「重新打开刚关掉的标签页」在 10 秒内恢复时会沿用窗口号，算同一个标签页接着用，可以接受。<br>• 不用跨标签通道，也不用等 | 复制发生时，原窗口还开着，存储里没有记号（启动时已经删了），所以弹出的标签页和复制出来的标签页**一定**换号；刷新**一定**沿用。启动是同步的，返回条和 `arrived()` 不用等。崩溃恢复的标签页也会换号（1.3 不做） |
| 回调落地页 | 授权回调带回来的文档，启动时**无条件**换号、清掉回程，不出返回条。这里指：开机地址里带 `connected`、`connection_error`、`setup`，由宿主重定向而来，`?settingsPath=` 开机，`fromPage=false` | 弹窗里的第一份工作台文档一定是落地页：`popup.location.replace` 先去授权页，回调再 302 到这两个地址（`web-connector-api-methods.ts:34-36`）。所以这一条靠确定的规则挡住，与上一条的记号互相独立 |
| 存多久 | 开着的 24 小时。已结算、等认领的 1 小时，认领即删。普通链接开的回程（`claim: false`），结算时就删。主人给每张回程挂到期计时，到期就删掉，并发 `return-settled { status: "ended" }`，在等的 `arrived()` 随之答 `null`，不会挂一整天。每个项目最多 8 张；同一来处再开一张，就替换旧的。形状不对、或 `v` 不是 1 的，整张丢掉，不兼容、不迁移 | 回程只是便利：丢了它，不丢任何事实，草稿和配置都在各自主人那里。数字由统筹定（C1） |
| 谁能读 | 只有主人。插件页拿不到回程本身，只能认领交给它的那一份结果（2.4），而且只在它是来处时 | 插件框是不透明来源，只经可信父页附加的页面身份说话（S-47 的前提）；存储转存带前缀 |
| 同一用户、同一项目 | `project` 取自工作台页面自己。认领时比对宿主给的 `storage_scope`（`install:project`）、Manifest 身份、界面和 `place`，都对上才交。本机只有一个人，回程就在这个人的这个窗口里 | 可信身份从调用上下文来：`storage_scope` 是宿主按实际激活、安装、项目与本人发的，页面给不出、也改不了；`place` 由框架宿主按 2.3 的同一个算法从可信的 DOM 位置取，不读页面消息 |
| 关掉应用再打开 | 回程不在了（`sessionStorage` 随窗口结束）。草稿（`host.drafts`）和新配置都在，来处读回事实就能接着用，只是不自动做那一步 | U3 用户已定 A |

### 2.3 来处只由外壳写下；回去只到工作台内部

- **插件框**：页面只交「需要什么」和「交还什么」（`need`、`carry`）。`from` 由框架宿主（`parent.ts` 接一行进新模块 `plugin-frame/returns.ts`）填：
  - `mount` 是它本次挂上时生成的随机号；
  - `scope` 取自宿主给的 `grant.storage_scope`；
  - `plugin` 取自 `pack.plugin_id`；
  - `surface` 取自根元素。

  框架宿主不读页面消息里的任何身份字段。看不见的页面（`parent.ts` 的 `visible()` 为假）调 `go()`，直接拒绝，不盖上设置。
- **窗格文档里的插件框**：
  - 窗格的框架宿主经 `workbench-open-settings` 交给外层（S-30 只认那个窗格框自己的窗口）。
  - 外层（`tab-workspace.ts:487-490`）把 `need`、`carry`、`from` 转进 `open-settings-path`，并把 `from.place.pane` **改写成那个窗格框的 `dataset.paneOwner`**，不信窗格发来的值。
  - 窗格文档里拦下的普通 `/settings` 链接（`tab-workspace.ts:64-71`）只带 `href`。来处按那个窗格算：`under-cover`，加上 `place`。
- **来处所在的窗格（`place`）只有一个算法**，写在 `apps/workbench/src/browser/return-trips.ts` 的 `placeOf(root, surface)`。框架宿主在 `go()` 与认领时都用它，外层转发时用同一个函数核对：
  - 外层文档里的页面（单栏时插件页直接挂在外层文档，`tab-workspace-panes.ts:239,261`）：`root.closest("[data-tab-pane]")?.dataset.tabPane`。
  - 窗格框里的页面：`window.frameElement.dataset.paneOwner`（窗格框与外层同源，`frameElement` 可信）。
  - 两者都取不到（侧栏格 `#side-panel iframe[data-side-frame]` 等不在窗格布局里的位置）：`place` 为 `null`。
  - `place.surface` 就是 `from.surface`。不记框的键：`paneFrameKey` 有标签时是标签 id，作为视图显示时是 `<pane>:view`，S2 还会改它。
- **平台界面**：助理按它此刻显示的工作填 `work_id`，并明确给出 `need`（「继续接入」给 `setup`）：助理岛在「继续接入」被点时自己发 `molis-work:open-settings-path`，带上它此刻显示的工作号与宿主画链接时写下的授权号（`data-return-setup`），回程主人不读助理的列表。提醒和其他平台界面里的普通链接，是 `under-cover`。
- **外层文档里的同源代码**（含 Alchemist、创作台两个构建期例外）能直接发带任意 `from`、`carry` 的 `open-settings-path`。这不是新的口子：它们本来就能读写所有 `molis-plugin-page:` 存储与控制令牌。`S-return-trip-source` 只守插件框与窗格转发。外层文档发的回程一律 `claim: false`。
- **普通链接**（第 2.4 节第三种）：外壳的链接处理按链接所在的可信文档位置算来处，`need` 按地址查一张封闭的表（U1 已定）：
  - `/settings/models` → `model`；
  - 连接页带 `connector=<id>` → `connection`；
  - 其余 → `none`。

  另外三条约束：
  - `setup=<授权号>` **不从链接推断**，因为链接是页面写的；只认助理和平台界面明确给的。
  - `none` 永远不自动关。
  - 设置里面的链接（`inSettingsShell`）不开新回程，也不替换已有的。
- **回去的位置只在工作台内部**。外壳从 `from` 算位置：
  - 来处还在覆盖层下面：只关覆盖层，沿用 `closeCover` 的历史语义——在「关掉就是后退一步」时把历史退一步（`tab-workspace-places.ts:131`）。
  - 来处在别的栏、右侧，或已经不在：走工作台已有的对象链接入口（`?openPlugin=<界面>&openItem=<对象>`）。它与框架宿主的 `navigate`、深链接是同一条；07-S2 合入后，它会经召回落到已开的那一份。
  - 助理：发已登记的 `molis:assistant-open { work_id }`。

  地址里的值这样检查：
  - 界面名按现有格式 `^[a-z][a-z0-9-]{0,100}$` 检查。
  - 对象 id 现在 `navigate` 不检查（`parent.ts:66` 的正则只看 `openPlugin`），本项给它定：不超过 256 个字符，不含控制字符，拼链接时一律 `encodeURIComponent`，所以 `?`、`#`、`&` 带不出多余参数。R1a 开工前，先把各搜索来源现有的对象 id 形状列一遍，确认都放得进。
  - 不合的，整张回程丢掉，不导航。
- **地址里不放回程号**。回程跟着覆盖层走（主人内存，加上 `cover` 字段），刷新后按 `cover` 接上，不需要在任何地址里带 `return=`。设置地址的过滤表（`settings-address-params.ts`）不加参数。OAuth 回调的去向不变，由宿主按授权记录算，从不读回程。

  所以没有开放跳转的入口：没有一个字段能写进外部地址，也没有一个地址参数能指定回到哪里。

### 2.4 三种发起方式：为什么是页面宿主方法加页面事件，不是动作

**一、插件页面：页面宿主方法 `host.returns`**。改 `packages/contracts/src/platform/ui.ts` 的 `UiPluginClientHost`；SDK 只再导出类型名。

```ts
/** What the settings have to make true. The first version has a text model only; a connection is asked in place (`connectionNeed`). */
export type UiReturnNeed = { readonly kind: "model" };

/** Names the page wants back, never content: a key of its own `host.drafts`, the one step to do on return, what was selected. */
export interface UiReturnCarry {
  readonly draft_key?: string;   // ≤ 256
  readonly step?: string;        // ≤ 128, [A-Za-z0-9._:-]
  readonly object?: { readonly kind: string; readonly id: string };   // id ≤ 256, no control characters
}

export interface UiReturnOutcome {
  /** `ready` only after the platform read the need back from its owner; `not_ready` when the person came back without it. */
  readonly status: "ready" | "not_ready";
  readonly carry: UiReturnCarry;
}

export interface UiPageReturns {
  /**
   * Opens the settings for `need` over the workbench, remembering this page as where the person came from. Resolves when the
   * person is back here. Rejects at once, with one fixed message whatever the reason, when the page is not visible, the carry is
   * refused or returns are unavailable. Rejects with an `AbortError` when the page aborts `signal` or this mount ends: the trip
   * then ends as `not_ready`, and a setting finished after that stays with its owner. Whether a later mount of this page gets the
   * outcome is decided by the platform from the workbench layout, never by the page (see `arrived`).
   */
  go(need: UiReturnNeed, carry?: UiReturnCarry, options?: { signal?: AbortSignal }): Promise<UiReturnOutcome>;
  /**
   * Once per mount. When a trip opened by `go` on an earlier mount of this page, in the same place, was kept because the page
   * was rebuilt without the person leaving it (a reload, a pane frame the workbench let go of), this waits until that trip
   * settles and resolves with its outcome, or resolves `null` when it ends without one or this mount ends first. With no such
   * trip it resolves `null` at once. Show the outcome with the platform's resume prompt; never redo the step unasked.
   */
  arrived(): Promise<UiReturnOutcome | null>;
}
// UiPluginClientHost 加一行：readonly returns: UiPageReturns;
```

插件拿到结果以后：

- **`go()` 答 `ready`**：规矩照④c 第 1 项（用户 11-06 定），写进插件开发 Skill。
  1. 先自己再读一次（如 `services.model.availability()`）；
  2. 只把 `step` 那一件做一次，用原来那一步的幂等键；
  3. 本来要确认的照原样再问，原来没有的不新加；
  4. 写之前照旧 `beforeEffect()`。
- **`arrived()` 答 `ready`**：按 U2（用户已定「先问一句」），用平台给的「接着做」共用件问一句（第 9 节），人点了才照上面的规矩做。
- **答 `not_ready`**：什么都不做，页面照常显示「没有模型」。

**人自己离开与没选择的重建，由回程主人按布局事实判断**。这对齐④c 第 3 项「卡收起之后才登录完的，不再接回去，只留下连接」。框架宿主自己分不出这两种：

- `parent.ts` 没有关闭原因：`:131` 的 `closing` 是页面登记的动作，`:140` 的 `invalidated` 是「藏着时被要求刷新」的标记。
- `packages/ui-host/src/client-lifecycle.ts` 的 `dispose()` 不带原因。
- 窗格框被移除时，窗格文档里的清理根本不跑。会移除窗格框的情况有：窗格关了（`tab-workspace-panes.ts:200`）；同一窗格换了显示的插件（`:237`）；隐藏的框超过 `KEPT_PANE_FRAMES` 被逐出（`:204`）。

所以规则只看布局：

| 什么时候判断 | 怎样判断 | 结果 |
| --- | --- | --- |
| 回程（`claim: true`）结算、而那时没有挂着的页面来认领 | 主人发同步请求 `molis-work:layout-holds { pane, surface }`，由 `tab-workspace` 按自己的内存状态回答：这个窗格还在，并且它还有这个界面的视图或标签（`pane.viewPlugin === surface \|\| pane.tabs.some((tab) => tab.plugin === surface)`）。不依赖框的键名 | 在：算**重建**，结果留着，等那个位置新挂上的页面用 `arrived()` 认领（1 小时）。不在：算**人离开了**，按 `not_ready` 删掉；配好的设置只留在设置的主人那里 |
| 没人回答 `layout-holds`（主人同步初始化，可能比 `tab-workspace` 的监听先装好，`answer` 仍未填） | 不判断 | 留着，不当成「不在」；交给之后的结算或到期处理 |
| 来处 `place` 为 `null`（侧栏格等） | 没有布局事实可查 | 一律算离开：只交给还挂着的那一页，不留给 `arrived()` |
| 框架宿主在同一文档里清理时（`scope.own` 会跑：页面中止 `signal`、外层文档里的框卸载、插件停用卸载、页面授权撤了） | 发 `molis-work:return-claim { return_id, drop: true }`，这是快路 | 按 `not_ready` 删掉 |
| 插件重启、宿主把视图重画 | 走上一行（同一文档里的清理会跑） | 算离开（统筹定，C11）：少见，后果只是少一次自动接着做 |
| 刷新、崩溃前留下的回程在启动时补读 | 主人启动后，对开着的回程各读一次事实；结算时按第一行判断（刷新后布局已恢复，所以判断照旧成立） | 同第一行 |

**二、平台界面：扩一条已登记的请求、加三条，并给一条已登记的宣告加字段**（第 2.6 节）。助理、原处连接卡、提醒都在外层文档里，直接经 `molis-work:open-settings-path` 带上 `need` 与来处。

**三、普通链接：不改任何消费者**。插件框里、平台界面里、外层文档里所有指向 `/settings/…` 的普通链接，外壳照样打开设置，同时按 2.3 的表开一张回程（`claim: false`，`carry` 为空，结算即删，不交结果给页面）。这样：

- Jelly、Dataset、Form、PPT、Schedule、Shelf 和 Alchemist 一行不改，也能回到原处；
- 要「接着做那一步」的，才改用 `host.returns.go`；
- `docs/platform/PROLOGUE-AI.md` 与 `skills/molis-prologue-ai/SKILL.md` 步骤 6 里「入口都是普通链接，页面不为某个入口单写返回逻辑」那句仍然成立，只补一句「要回来接着做哪一步时用 `host.returns.go`」。

**为什么不是动作**：理由与④c 统筹 11-06 对 `connectionNeed` 的相同。

- 「能力注册一次」管的是供页面、工作流、Agent、MCP 用的能力。回程是界面的挂法，离开页面就没有意义，动作也没有「位置」可言。
- Agent、MCP 要配置，已经有 `connectors.setup.prepare@1` 加等待。
- 回程判断「好了」时读的，仍是已注册的动作背后的设置路由（3.4）。所以不新加动作，也不进动作合同快照。

**为什么不只靠一条宣告**：`molis-work:model-ready` 是广播，谁显示过「没有模型」，谁就重读。回程是点对点的：只交给来处那一页，还要带回它当初说的一步，并且要靠认领才知道交到了。两者分开，见 2.5。

### 2.5 与 `molis-work:model-ready`、覆盖层变化和连接的返回怎样统一

- **回程管回去，`molis-work:model-ready` 只管重读**。
  - `settings-directory.ts` 里 `sentFromPage` 这段（「从页面来的，先关覆盖层、提示，再发事件」）挪进回程。覆盖层上有开着的回程时，先按回程结算（关覆盖层、提示），再发 `molis-work:model-ready`，顺序与现在登记的一致。
  - 这条事件的名字、载荷（无）、发的时机（第一个能跑的模型）都不变，只改登记里说明「谁先关覆盖层」的那一句。
- **换模型、修好模型、加第二个供应商**：不再需要这条事件把人带回来。回程按需要读事实（有没有能跑的文字模型），读到就结算。打开时已经有模型的（`met_at_open: true`）不自动回去，只留返回条（3.2）。至于要不要让 `model-ready` 在「模型从不能用变成能用」的每一次都发，是另一件事，本项不改。
- **人自己关掉或换掉设置**：不新加事件，改用已登记的宣告 `molis-work:place-changed`，在它的 detail 里加一个字段 `cover: <覆盖层类型> | null`。这是改已登记事件的载荷，与发它的代码一起在 R1a 登记。
  - 改的是 `tab-workspace-places.ts` 的 `announcePlace`：`next` 里多带 `cover: state.exclusive || null`，去重时把 `cover` 也算进去。没有焦点窗格时 `place` 恒为 `""`（`tab-workspace-places.ts:209`），只按 `paneId` 与 `place` 去重，会漏掉覆盖层的变化。
  - `previous` 是上一次宣告的对象；第一次宣告时它没有 `cover`，按 `null` 处理。
  - 现有的两个监听方（`context-bus.ts:283`、`side-panel-context.ts:76`）都不读 detail，`tests/dom-events-contract.test.ts` 只核对名字，加字段不影响它们。
  - 字段的登记与发它的代码都在 R1a，放在同一个改动里。
  - 回程主人听这条宣告：`cover` 从回程打开的设置类型（`settings` 或 `project-settings`）变成别的（`null`，或另一个覆盖层，包括从全局设置换到项目设置），而且不是主人自己关的，就读一次事实，再结算（3.2）。
  - 在设置里换页（`cover` 不变，`place` 变了）不结算。
  - 主人不拆 `place` 的私有格式。`tab-workspace-panes.ts` 不改。
- **连接**：连接页和原处连接卡都不另发「连好了」的页面事件。§13.5 第三节第 6 条草拟的 `molis-work:connection-settled` **不再需要**：连接页要随卡刷新的情况，由同一个回程模块结算。
- **OAuth 回调**：
  - 去向照旧由宿主按授权记录算。Onboarding 的 `OAuthReturn` 是引导记录自己的事实，保留不动。
  - 设置里发起的登录，原窗口靠已有的授权监视（连接页每 2 秒一次，页面可见时）得知 `connected`，交给回程结算。
  - 回调落地的那一页，启动时就换号、清掉回程（2.2），只把文案改成「已连上。回到 Molis Work 的窗口继续；这一页可以关掉。」（C8，13⑤ 那一片）。
- **跨标签页的 `BroadcastChannel('molis-work:model-ready')`**：是独立的清理项，不随本项删（C7）。
  - 现在仍有人发（模型设置脚本 `settings-models.ts:13`），也有人听（引导页 `context-onboarding.ts:776-781`），只服务「引导开着时，人在另一个标签页的设置里配好了模型」这一种情况。
  - 本项不新加跨标签通道，所以 `dom-events.ts` 开头那段与 `docs/platform/UI-PLATFORM.md:61` 写的「只有一条」照旧成立。
  - 两处过时说明（`docs/platform/PROLOGUE-AI.md:204`、`dom-events.ts:262` 里「开始使用页在新标签打开设置」）随 R0 改成现状。

### 2.6 对登记与快照的影响

| 东西 | 改动 | 哪一片 |
| --- | --- | --- |
| `packages/contracts/src/platform/ui.ts` | 加 `UiReturnNeed`、`UiReturnCarry`、`UiReturnOutcome`、`UiPageReturns`；`UiPluginClientHost` 加 `returns`（2.4 的说明原样进合同）。`pnpm api:update` 刷新 contracts 的 `platform/ui` 快照与插件 SDK 快照 | R0 |
| `packages/plugin-sdk` | 只再导出上面几个类型名，不加运行代码 | R0 |
| `apps/workbench/src/browser/plugin-frame/child.ts` | `returns.go` 与 `returns.arrived` 先给固定的拒绝（「暂不可用」）占位，与④c C1 的做法相同 | R0 |
| 过时说明 | `docs/platform/PROLOGUE-AI.md:204`，以及 `dom-events.ts:262`（`model-ready` 的 summary），改成 Onboarding 的现状。`pnpm api:update` 刷新 dom-events 快照 | R0 |
| 已登记事件的载荷 | `molis-work:place-changed` 的 detail 登记改成 `{ paneId, place, previous, cover }`，说明 `cover` 是覆盖层类型或 `null`，`previous.cover` 缺省时按 `null`；与 `announcePlace` 发它的代码在同一个改动里 | R1a |
| `packages/contracts/src/platform/dom-events.ts`（新条目与发它的代码在同一个改动里登记） | ① `molis-work:open-settings-path`（请求，主人 `settings-directory`）：载荷从 `{ href }` 扩成 `{ href, return_id?, need?, from?, carry? }`。`return_id` 只由插件框的框架宿主生成，别的发送者不填，由主人生成。② 新增请求 `molis-work:layout-holds`（主人 `tab-workspace`，`on: "document"`）：载荷 `{ pane, surface, answer? }`，同步回填 `answer: boolean`（窗格还在，并且有这个界面的视图或标签）；嵌入的窗格文档不答；没人回填时，请求方不作判断。这条请求以后归 07 维护（统筹定，第 10 节）。③ `molis-work:model-ready` 改说明里「谁先关覆盖层」那一句。④ 主人表加 `settings-return` 一行：`files` 为 `apps/workbench/src/browser/settings-return.ts`、`apps/workbench/src/browser/return-trips.ts`；`state` 为「这个窗口的回程：来处、需要、结算，存在本标签页的 `sessionStorage`」 | R1a |
| 同上 | ⑤ 新增请求 `molis-work:return-claim`（主人 `settings-return`，`on: "document"`，只在外层文档）：载荷 `{ return_id?, origin?: { scope, surface, place }, drop?, answer? }`。主人同步处理，回填 `answer`：<br>• `{ status, carry }`：交出，即删；<br>• `{ open: return_id }`：这个来处有 `go` 开的回程还开着，请等。只回给 `scope`、`surface`、`place` 都对得上的认领。等的一方收到带这个 `return_id` 的 `return-settled` 再认领一次；收到 `ended` 给 `null`，挂载结束也给 `null`；<br>• `null`：没有可认领的。<br>`drop: true` 按 `not_ready` 结掉并删除。回填和在载荷里带回调的写法都有先例：`molis-work:plugins-changed` 的 `failed`、`molis:assistant-card-target` 的 `reply`。⑥ 新增宣告 `molis-work:return-settled { return_id, status }`（主人 `settings-return`，只发在外层文档）。`status` 是 `ready`、`not_ready` 或 `ended`（没结果就删了：过期、人离开）。它只提醒「去认领」，本身不交结果；主人启动完成（对开着的回程补读完）后，对每张已结算、等认领的回程补发一次 | R1b |
| 跨标签通道 | 不加 | — |
| 动作合同快照 `tooling/gates/actions/` | 不变：不加动作，不改动作的 schema | — |
| `apps/workbench/src/settings-address-params.ts` | 不变：地址里不带回程号 | — |
| 框架与外壳之间的 MessagePort 消息（`types.ts` 的 `FrameUp`／`FrameDown`） | 加 `return-go`、`return-arrived`、`return-result`，以及第 4 种 `return-abort`（页面中止 `go()`，实现时定（统筹 11-07），见 C12），不在页面事件登记的范围里 | R1b |
| 巨大单元 | 框架宿主一侧的回程逻辑放进新模块 `apps/workbench/src/browser/plugin-frame/returns.ts`，照 `drafts.ts`、`connection-slot.ts` 的做法；`parent.ts#mountFrame` 里只接一行。`mountFrame` 登记在 `tooling/gates/giant-exceptions/apps/workbench/src/browser/plugin-frame/parent.ts.json`（现为 `size: 188`；#1929、④c-2 也会改它），每片在 diff 里写实测的新 `size` | R1a、R1b |
| 安全不变量 | 新增三条，见第 5 节 | R1a（destination）；R1b（source、delivery） |
| 页面资源 | 按任务许可文件写：`tooling/gates/page-asset-allowances/12-draft-and-return-r1a.json`、`…-r1b.json`，格式见 `docs/cli-and-development.md`「页面资源体积」。预计 `workbench.js` 增几 KB，`plugin-frame.js` 增约 1 KB，以实测为准；单项一次超过 10 KB，先问用户。**不改 `tooling/gates/page-assets.json`**：它是枢纽文件，07-S1、S2 都在改 | R1a、R1b |

### 2.7 否掉的做法

| 做法 | 为什么不用 |
| --- | --- |
| 宿主里建一张回程表（新的 horizontal 包、库表、动作或路由） | 记的是浏览器布局事实，放进宿主就是给布局另记一份。还要升库版本、写升级步骤、加清理与授权路由，换来的只是「关掉应用再开还在」，而那时草稿和配置本来就在。用户已定 U3 选 A |
| 回程存 `localStorage` | 所有标签页共用，OAuth 回调落地的那一整份工作台也会看到 |
| 只靠 `sessionStorage` 里的随机窗口号认窗口 | 带 opener 打开的标签页、复制出来的标签页，会连窗口号一起复制过去 |
| 启动时经 `BroadcastChannel` 问一声「这个窗口号有人在用吗」 | 有三个缺口：<br>• 原窗口被浏览器冻结或丢弃时答不上，复制出来的窗口就保住了号；之后原窗口刷新，反被它认走。<br>• 两个复制品同时启动时，没有确定的结果。<br>• 每次普通刷新都要白等。<br>改用 `pagehide` 记号（2.2）：不计时，结果确定 |
| 登录弹窗改用 `noopener` | `window.open` 会返回 `null`，拿不到授权地址以后没法再给弹窗换地址；改成同步打开本源的开始地址，又要让一个 GET 带副作用（1.3） |
| 框架宿主与主人共用存储代码、各自读写 | 有两个写入方，「交出即删」与「留给重建后认领」会打架；改成只经认领请求 |
| 让框架宿主按清理时的「结束原因」区分人离开与重建 | main 上没有这种原因；窗格框被移除时，窗格文档里的清理根本不跑（2.4）。改由主人按布局事实判断 |
| 新加 `molis-work:cover-closed`，只在覆盖层「从有到无」时发 | 会漏掉「直接换成别的覆盖层」和「全局设置换到项目设置」，回程会一直开着。`molis-work:place-changed` 本来每次都宣告，给它加一个 `cover` 字段即可，也少改 07 的一个文件 |
| 回程主人直接拆 `place-changed` 的 `place`（`cover:<kind>|…`） | 那是 `tab-workspace` 私有的格式；改成由主人在 detail 里明给 `cover` |
| 返回地址放进设置地址（`?return=/projects/…`） | 是开放跳转的来源；地址里的位置也会和工作区状态各说各的 |
| 只扩 `molis-work:model-ready`，带上来处与步骤 | 广播会让所有页面都拿到别人的步骤；连接、接入授权也要各来一条，事件会越扩越杂 |
| 把每个「打开设置」改成插件自己的对话框 | PF-A07 明写不能只把链接改成弹窗；设置会分成很多份 |
| 平台重放插件的那一步 | 平台不知道那一步现在还该不该做；④c 第 1 项已定由插件按幂等键自己做 |
| 用 MutationObserver 看设置界面藏没藏起来 | 这是读别的主人的 DOM 状态，正是页面事件规则要收掉的写法 |

## 3. 调用链

### 3.1 主路径（插件页缺模型，`host.returns.go`）

1. **发起**：人在 Coding 的输入框里按发送，Coding 发现没有能跑的模型（`services.model.availability()`）。它把输入存进自己的 `host.drafts`（键 `composer:<会话>`），然后调：

   ```ts
   host.returns.go({ kind: "model" }, { draft_key: "composer:<会话>", step: "send:<幂等键>" }, { signal })
   ```
2. **框架宿主**（`plugin-frame/returns.ts`）收到 `return-go`：
   - 页面看不见，就拒；
   - 检查 `carry`（长度、字符）；
   - 生成 `return_id`，按 2.3 填 `from`；
   - 发 `molis-work:open-settings-path { href: "/settings/models", return_id, need, from, carry }`。在窗格文档里，经窗格转发，由外层补 `from.place`。
3. **外壳**：`settings-directory` 打开设置，并调回程主人。主人：
   - 向模型设置的主人读一次当前是否已有能跑的模型，记下 `met_at_open`；
   - 写回程（`claim: true`，带本窗口号）。

   设置盖上来，顶上出返回条「从 Coding 来 · 配好后自动回去 · 现在回去」（U4）。
4. **在设置里**：人填好、保存。模型设置页报告保存结果，就是现在给 `ready` 回调的那一处（`settings-directory.ts` 的 `bindEmbed`）。
5. **读回事实**：回程主人再向主人读一次「有没有能跑的文字模型」。有，结算为 `ready`；没有，留在设置里，返回条照旧。
6. **回去**：
   - 覆盖层还显示着回程打开的那一处：先关覆盖层，提示「模型已连接，回到 Coding 接着做」（现有 toast），再按 2.5 发 `molis-work:model-ready`。
   - 人在设置里已经走到别的页（比如去看了外观）：不关，返回条改成「已经好了 · 回去」。
7. **来处不在眼前时**：
   - 来处页面在别的栏、右侧，或页面已经重建：用 2.3 的对象链接入口回到它。
   - 页面已经关了，又没有 `object`：只关覆盖层，提示「原来的页面已经关了，配好的设置都在」。
8. **认领**：
   1. 回程主人先给这张回程拍快照，在外层文档发 `molis-work:return-settled { return_id, status }`。
   2. 各框架宿主都用 `scope.listen` 在 `window.top.document` 上听这条宣告——窗格文档里的、右侧格里的都一样。手上正有这个 `return_id` 在等 `go()` 的那一个，在派发中同步发 `molis-work:return-claim { return_id, origin }`。
   3. 主人比对来处（`scope`、`surface`、`place`），回填 `answer`，删除回程。
   4. 框架宿主经 MessagePort 交 `return-result`，`go()` 答 `{ status: "ready", carry }`。这时 MessagePort 已经关了、交不出去的，结果丢掉（回程已删，不重试）。
   5. 派发结束后，主人看快照里的回程还在不在。还在，就是没人认领（页面正在重建），按 2.4 的表判断：留给 `arrived()`，还是按离开删掉。
9. **只接着做那一步**：Coding 自己再读一次模型是否可用，取回草稿，按 `send:<幂等键>` 发送一次（U1 已定），原来有的确认照问。

### 3.2 成功、失败、取消、人自己关、人自己离开

| 情况 | 设置里 | 回程 | 来处拿到 |
| --- | --- | --- | --- |
| 配好（需要从没有变成有） | 自动关覆盖层、提示 | `ready`；`go` 开的认领即删，普通链接开的结算即删 | `go()` 答 `ready` 带 `carry`；普通链接不交结果 |
| 打开时就已满足（`met_at_open: true`，比如已有模型还点了「打开模型设置」） | 不自动关，返回条写「回去」 | 人回去时读一次 | `ready` |
| 需要是 `none`（地址里看不出要补什么） | 永远不自动关，返回条写「回去」 | 人回去时结算，不读事实 | 普通链接不交结果 |
| 出错（密钥被拒、登录失败、限流、检查没通过） | 留在设置，错误就地写，填的还在（#1903 的先查后存）；返回条照旧 | 不结算 | 还在等 |
| 人点「现在回去」 | 关覆盖层 | 读一次：满足就 `ready`，不满足 `not_ready` | 对应结果；`not_ready` 时什么都不重做 |
| 人自己关设置（Esc、返回、标题栏、Dock、历史），或换成了别的覆盖层、换到项目设置 | 主人经 `molis-work:place-changed` 的 `cover` 得知 | 同上，读一次再结算 | 同上 |
| 登录中途取消（连接页「取消这次接入」） | 连接页照 §4.6.1 处理 | 不结算，人回去时读一次 | 多半 `not_ready` |
| 页面自己中止 `signal`，或来处在同一文档里卸载（插件停用、卸载、重启，页面授权撤了） | 设置照常 | 框架宿主发 `drop`，按 `not_ready` 删除 | `go()` 以 `AbortError` 拒绝；以后什么都拿不到 |
| 来处的窗格或标签已经不在布局里（人关了它、同一窗格换了插件、换了项目） | 设置照常 | 结算时主人问 `layout-holds` 得「不在」，按 `not_ready` 删除；配好的只留在设置的主人那里 | 什么都拿不到，下次挂上也拿不到 |
| 来处的窗格和标签还在，只是页面被重建（刷新、窗格框被逐出后重新显示） | 设置照常 | 留着；结算后等认领 1 小时 | 新挂上的页面用 `arrived()` 等到结果，按 U2 问一句 |
| 从齿轮、菜单、地址进来 | 没有返回条，不自动关 | 不开回程 | — |

### 3.3 刷新、重开、弹出的标签页与系统浏览器

- **在设置里刷新**：
  - `pagehide` 留下记号，新文档启动时沿用窗口号。覆盖层按 `noteCover` 重开，主人按 `cover` 找到本窗口、本项目开着的回程，返回条重新出现。
  - 设置下面的来处页面也重新挂上了，它调 `arrived()`。主人答 `{ open: return_id }`，`arrived()` 就一直等着。单栏时，覆盖层下面的页面可能要等覆盖层关掉才挂上（视图按可见与否延后挂上）；那样回程先结算，页面挂上后直接认领到，结果相同。
  - 人配好以后，回程结算，发 `return-settled`；在等的框架宿主认领，`arrived()` 答结果。来处用平台的「接着做」共用件问一句（U2），人点了才做。
  - 第二次调 `arrived()` 为 `null`。这就是 DRT-06。
- **在来处刷新（设置没开）**：开着的回程没有覆盖层可接。主人启动后读一次事实再结算：满足，就按 2.4 的表留给 `arrived()`；不满足，就删。
- **刷新时回程已经结算**：结果在存储里。新挂上的页面调 `arrived()`，直接认领到；主人启动完成后还会补发一次 `return-settled`，保证启动过程中先挂上、先问过的框架宿主也能认领。
- **关掉应用再打开**：按 U3（A），回程不在了。草稿在 `host.drafts`，配置在主人那里；来处读回事实，显示可用，人自己再点一次。
- **在弹出的标签页里登录**：设置页 `window.open('', '_blank')` 打开的标签页，带着复制来的 `sessionStorage`，连窗口号也一样。
  - 它的第一份工作台文档是回调落地页，启动时无条件换号、清掉回程（2.2）。
  - 就算不是落地页，存储里也没有离开记号，照样换号。
  - 原窗口的连接页靠授权监视得知完成，从 3.1 第 5 步起结算。浏览器的「复制标签页」同理。
- **桌面壳里在系统浏览器登录**：系统浏览器是另一份存储，看不到回程。回调落地页只改文案（2.5）；原窗口照上一条结算。
- **窗格文档与右侧格**：
  - 嵌在工作台里的窗格页与外层共用一个 `sessionStorage`，但不写它。
  - 结算、覆盖层、宣告都只在外层文档；各框架宿主都在 `window.top.document` 上听、在那里认领（同源、同步）。所以右侧格（`#side-panel iframe[data-side-frame]`）里的页面也收得到，主人只发一份。

### 3.4 一次操作发几个请求（开工前检查第 9 项）

判断「好了」，读的是外壳已经在用的设置路由，以本人身份：

- 模型 → `/api/settings/models`（`health` 里有 `ready`）。
- 连接 → 连接页的 `/api/settings/connectors/connections?service_id=…`，背后是 `connectors.connections.read@1`。
- 接入授权 → 连接页现在用的 `/api/settings/connectors/authorizations/<授权号>`（`connectors-settings.ts:62` 的 `api` 加 `:208` 的读法）。不经 `connectors.authorization.read@1` 的动作网关，因为那个动作只认发起它的人、项目与运行会话（S-37）。
- 带槽的连接（原处连接卡）→ 按服务读（与上面「连接」同一条路由：这个服务有已连上的账号就算配好），见 C17。槽上绑哪个账号仍归卡：回到原处后，卡用 C2 的 `read` 再读一次，接着走它自己的流程（选账号、绑上）。

| 动作 | 请求 |
| --- | --- |
| 窗口启动时认窗口 | 0：只读写本标签页的 `sessionStorage` |
| 发起（写回程、打开设置） | 读一次需要：模型 1 次、连接 1 次、接入授权 1 次，`none` 0 次。设置页自己的加载照旧 |
| 设置里保存后 | 读一次需要；模型设置的保存响应已经带 `health` 时直接用，不再请求 |
| 人回去、人自己关或换掉设置 | 读一次需要（`none` 0 次） |
| 回去、认领、问布局 | 0：关覆盖层、发事件、问 `layout-holds` 都在本地。来处插件自己再读一次可用性，算插件自己的 |
| 刷新或启动时有开着的回程 | 每张 1 次，至多 8 次 |
| 设置隐藏或标签页在后台 | 0：不轮询；只有连接页已有的授权监视照旧（可见时 2 秒一次） |

## 4. 消费者接入清单

「片」见第 8 节。标「不改」的，靠 2.4 第三种（普通链接）自动回到原处，不交结果给页面。

| 消费者 | 现在 | 要改什么 | 片 |
| --- | --- | --- | --- |
| **模型设置**（落点） | 第一个模型保存时，`sentFromPage` 关覆盖层 | 保存结果交给回程主人结算；删掉 `sentFromPage`；顶上出返回条 | R1a（结算）、R2（返回条） |
| **服务连接页**（落点） | 回调写「请回到原来的应用窗口继续」；「连好以后」是往前走的链接 | • 授权监视得知完成、保存密钥通过后，交回程结算。<br>• 有回程时，「连好以后」那段让位给返回条：配好就回去，属于 U1 已定的行为，不另问。<br>• 回调落地页改文案（C8），启动时换号清回程。<br>• `setup` 需要按 3.4 的路由读 | R4（13⑤） |
| **助理对话**（来处） | 「继续接入」去连接页，工作会续，人不回 | • 「继续接入」以 `from: assistant`、`need: setup` 开回程（`claim: false`）。<br>• 连好后关覆盖层，发 `molis:assistant-open { work_id }`；在等的工作照 §4.7 只续一次（宿主一侧不改）。<br>• ④c-2 之后，多数情况在原处出卡，链接只剩卡画不出的情况 | R4（13⑤） |
| **连接提醒**（来处） | 去设置，不回 | 普通链接即可（`under-cover`）；提醒照原规则消掉，不改提醒合同 | R4（只验收） |
| **原处连接卡的「还不能一键连接」**（来处） | 卡里给去连接页的入口，人离开原处 | 卡以来处页面开回程（`need: connection` 带槽，框架宿主的 `return_id`，可认领），落点是 `/settings/connectors?connector=<服务>`。不论怎样结束（配好、没配好、结束），卡在原处、看得见时只再读一次（C2 的 `read`），接着走它自己的流程。实现：`plugin-frame/returns.ts` 的 `connection`，`connection-need.ts` 的 `settings` 一步 | R4（④c-2 已先合） |
| **Feed** | `connectorSettingsHref` 链到连接页，回来靠人 | ④c-2 改成原处连接卡；剩下的「还不能一键连接」走上一行。`connectorSettingsHref` 若还留着，普通链接按 `connection` 推断，配好自动回来 | 随④c-2，本项只验收 |
| **Images** | 自己的 `resumeConnection` | 缺的是图像服务，不在 `UiReturnNeed` 里，**不用 `host.returns.go`**。④c-2 的卡取代缺密钥那一处后，删 `resumeConnection`。对话框里若还留着去设置的链接，保留普通链接（地址推断为 `none`，只回来、不判断） | 随④c-2 |
| **Cognia** | 「模型设置」普通链接，加上听 `model-ready` 重读 | 页面上「模型设置」那个普通入口（一个按钮，不是被某一问挡住）带着要问的话去设置：入口调 `host.returns.go`，`step: "query"`，问题仍在输入框里。配好回来后重读，用平台的「接着做」共用件问一句「接着问」，人点了才问，从不自动问（U1 第二种入口，实现时定（统筹 11-07））。没配好、取消都只回来。`model-ready` 监听保留 | R3 |
| **工作流程** | 连接浮层里的「打开模型设置」是普通链接；`ui.returnTo` 是它自己的返回 | 浮层里的「打开模型设置」改成按钮，调 `host.returns.go`：`carry.object` 是 `{ kind: "workflow", id: <流程> }`，`step` 是 `link:<连接序号>`。回来（`go()` 的答复，或重建后 `arrived()`）后打开那条流程、重读模型，再打开那个连接的浮层，重读能不能交接；不替人做交接。`returnTo` 不动 | R3 |
| **Coding** | `data-coding-model-setup` 与设置页的模型链接；输入草稿存在转存的 `sessionStorage` | 「模型设置」那个普通入口（改成按钮）先把输入框的草稿写进 `host.drafts`（键 `composer:<会话>`），再调 `host.returns.go`，`step: "send"`。配好回来后，在输入框上方用平台的「接着做」共用件问一句「发送」，人点了才把草稿填回、发出，从不自动发（U1 第二种入口，实现时定（统筹 11-07））。工作目录（「角色执行另选工作目录」）第一版不在 `UiReturnNeed` 里，走普通链接 | R3 |
| **Onboarding** | 已经就地连模型（#1310）；Gmail OAuth 有自己的回程 | **不改**。跨标签的 `BroadcastChannel` 是独立清理项（C7） | 不改 |
| **独立 Home 的模型设置对话框**（没有项目的 Home 页面） | `open-settings-path` 的第二个监听者 | 第一版**忽略新字段**，照现在打开对话框，不开回程，不出返回条。这些页面没有插件框，也没有工作区，没有「原处」可回 | R1a（只确认忽略） |
| **Alchemist**（构建期例外） | 客户端在外层文档；链接由 `settings-directory.ts:414-433` 的点击处理接住；听 `model-ready` | **只写边界，不改代码**。那段点击处理开普通链接的回程（来处按链接所在的文档位置算），配好自动回到原处。不用 `host.returns`；`step` 那一半等 BL-377 重做时再接 | 不改 |
| **插件创作台**（构建期例外） | 网页里直接在外层文档发 `open-settings-path`；桌面壳里用 `molisWorkOpenExternalUrl` 交给系统浏览器（`agent-studio.ts:525`） | **不改代码**。网页里按 `under-cover` 开回程，关覆盖层就回到原处。桌面壳里设置在系统浏览器打开，回不来，是已知缺口，留给 BL-377 | 不改 |
| Jelly、Dataset、Form、PPT、Schedule、Shelf | 普通链接，加上听 `model-ready` | 不改；要接着做某一步时，再各自改用 `host.returns.go` | 不改 |

## 5. 安全不变量提案

格式照 [安全不变量记录](../../docs/system/security-invariants/README.md)：每条一个 `S-<语义名>.md`，一行五列。下面是拟写的「不变量（拒绝什么）」与测试计划，代码位置随实现填。

- 能在 Linux 上稳定跑的检查，写成单元测试，放进 `test:security`（CI 里跑）：`return-go` 的字段检查、`return-trips.ts` 的形状与窗口归属、位置计算、`placeOf`、认领比对与 `{ open }`、布局判断、到期。
- 这些逻辑都写在 `apps/workbench/src/browser/return-trips.ts`，它是真正的 TS 模块，测试 import 得进。外层的接线写在 `apps/workbench/src/browser/settings-return.ts`，也是 TS，由 esbuild 打成 `dist/settings-return-client.js`、排在客户端启动脚本前面（健康门禁不收新的 `*_SCRIPT` 文本脚本，所以不写成模板字符串；实现时改）；`plugin-frame/returns.ts` 只接框架宿主一侧。
- 要真实浏览器的，另写浏览器用例，只在本机跑，并写明原因。

| ID | 拒绝什么 | 断言「拒绝」的测试（计划） |
| --- | --- | --- |
| `S-return-trip-source` | **插件框与窗格转发写不出别人的来处。**<br>• 框架宿主按自己持有的挂载随机号、宿主给的 `storage_scope`、Manifest 身份与根元素填 `from`。<br>• 页面经 MessagePort 发来的 `return-go`，只许带 `need` 与 `carry`；多一个字段（来处、安装、项目、界面、栏、地址），整条拒绝，不打开设置。<br>• `carry` 超长、字符不合，`need.kind` 不在封闭集合里，同样拒绝。<br>• 看不见的页面调 `go()`，拒绝。<br>• 窗格转发只认那个窗格框自己的窗口（S-30）；`from.place` 由外层按窗格框的 `dataset` 填。<br>• 插件框的存储转存碰不到 `molis-work:return-*` 三个键（键一律加前缀）。<br>外层文档里的同源代码不在本条守的范围（2.3） | **单元**（`tests/security-invariants-return-trips.test.ts`，CI）：<br>① `return-go` 带 `from`、`project`、`scope` 等多余字段，拒。<br>② 这些都拒：`carry.step` 129 字符，或含 `/`、`<`；`draft_key` 257 字符；`object.id` 257 字符或含控制字符；`need: { kind: "connection" }`。<br>**浏览器**（`tests/security-invariants-return-trips.e2e.test.ts`，本机）：<br>③ 页面经存储转存写 `../molis-work:return-trips` 与同名键，外壳的键不变。<br>④ 别的窗格、或不是框的窗口发 `workbench-open-settings` 带来处，丢掉；窗格自称别的 `pane`，外层改成它真实的那一栏。<br>⑤ 页面藏起来时调 `go()`，设置不开 |
| `S-return-trip-destination` | **回去只到工作台内部。**<br>• 回程没有 URL 字段，位置只由外壳从 `from` 算：关覆盖层、已登记的对象链接入口、`molis:assistant-open`。<br>• 界面名不合 `^[a-z][a-z0-9-]{0,100}$`、对象 id 超长或含控制字符的，整张回程丢掉，不导航；合格的 id 一律编码后再拼进链接。<br>• 存储里被改成带地址、带 `javascript:`、带外部 origin 的回程，按形状检查丢掉。<br>• 地址里不认 `return=`。<br>• OAuth 回调的去向从不读回程 | **单元**（CI）：<br>⑥ `from.surface` 为 `../x`、`https://evil.example`，丢掉，不导航。<br>⑦ `object.id` 为 `a?x=1#y&openPlugin=evil`，拼出的链接里只有一个 `openPlugin`、一个 `openItem`。<br>⑧ 多出 `href`、`url` 字段，`v: 2`，缺字段，整张丢掉。<br>**浏览器**（本机）：<br>⑨ 设置地址带 `return=https://evil.example`、`return=<别的项目的回程号>`，设置照常，不回去，不跳转 |
| `S-return-trip-delivery` | **结果只交给来处、只交一次、只在这个窗口。**<br>• 只有 `claim: true` 的回程可以认领；认领时安装（`storage_scope`）、插件、界面、`place`、项目都对上才回填，认领即删。<br>• 普通链接开的回程，结算即删，不交给任何页面。<br>• 窗口号对不上的回程，只读、不结算、不认领、不出返回条。<br>• 没有 10 秒内离开记号的窗口（复制出来的、带 opener 打开的标签页），启动时换号，删掉回程；回调落地页启动时无条件换号、删掉回程。<br>• 来处的窗格或标签已经不在布局里，或页面自己中止了，回程按 `not_ready` 删除，晚到的配置不交给这个页面，也不交给它下一次挂上。<br>• `ready` 只在主人读回需要之后才给；设置页一句「保存了」、页面自己发的消息、别的回程的结算，都不算。<br>• 回程里不存草稿正文、密钥、地址的查询串 | **单元**（CI）：<br>⑩ 两次认领同一回程，第二次 `answer` 为 `null`。<br>⑪ `storage_scope`、界面或 `place` 不同的认领，得 `null`，回程还在。<br>⑫ 窗口号不同的主人实例，对回程什么都不做。<br>⑬ `drop` 之后再结算，没有可认领的；`claim: false` 的回程结算后，认领得 `null`。<br>⑭ 存储里没有离开记号、或记号超过 10 秒，启动后换号、回程清空；有 10 秒内的记号，沿用窗口号、回程还在。<br>⑮ `layout-holds` 答「不在」时，结算后的回程被删，`arrived()` 为 `null`；答「在」时，回程留着；没人回答时，也留着。布局判断在单栏（页面挂在外层文档）与分屏（页面在窗格框里，含作为视图显示的 `<pane>:view`）下各跑一遍；`placeOf` 从两种来源得出同一个窗格。<br>**浏览器**（本机）：<br>⑯ 设置页用 `window.open('', '_blank')` 打开的标签页，带着复制来的存储与窗口号，启动后换号、删掉复制来的回程；原窗口的回程不变；它落在回调地址后，不结算，不出返回条。<br>⑰ 同一插件两个安装（或两个项目）各开一页：A 的回程结算后，B 的 `arrived()` 为 `null`。同一界面左右两栏各开一份：只有来处那一栏拿到。<br>⑱ 人在设置里时关掉来处那个标签，再配好模型；来处重开后，`arrived()` 为 `null`。<br>⑲ 让模型设置路由返回保存成功、但 `health` 不是 `ready`：回程不结算为 `ready`。<br>⑳ 结算后读 `sessionStorage`，没有草稿正文与密钥字样 |

这三条都在外壳里，宿主没有新路由，所以没有宿主一侧的拒绝测试。判断「好了」时用的读（3.4 的设置路由、C2 的 `read`）沿用它们已有的不变量（S-37、`S-plugin-connection-card` 等），不放宽。

## 6. 产品检查与开工前检查

### 6.1 产品检查（开发流程第 3 节）

- **从用户的结果倒推**：用户在原处按下一步 → 发现缺配置 → 进设置补上 → 自动回到原处 → 那一步接着做完。中途被打断（出错、改主意、刷新、关掉应用）后，原处的输入都在，配置都在，最多再点一次。
- **每一步都要站得住**：
  - 返回条回答「我从哪来、配好会怎样」，它不是新的确认。
  - 「现在回去」让人随时退出。
  - 人自己离开了来处，平台不在之后替他接着做（④c 第 3 项）。
  - 刷新以后先问一句（U2）。
- **已有的授权和选择接着用**：回程不带授权；插件那一步原有的确认照问，不新加。
- **AI**：不涉及模型调用，模型能力不影响回程。
- **归谁**：回程是平台能力（工作台外壳）；草稿、步骤的含义、在等的工作各归原主人。
- **别漏掉的路径**：齿轮进入；空状态（没有任何模型）；失败与恢复；第一次和第二次进入（`met_at_open`）；中英文；窄屏下的返回条（R2 定样）。

### 6.2 开工前检查（开发流程第 4 节）

| # | 回答 |
| --- | --- |
| 1 事实主人 | 新事实只有回程本身，主人是工作台外壳的 `settings-return`，是唯一写入方。其余各归原主：<br>• 覆盖层与布局仍归 `tab-workspace`，它发 `place-changed`、答 `layout-holds`（以后由 07 维护）；<br>• 模型是否可用归模型设置（宿主模型目录）；<br>• 连接与接入授权归连接的主人；<br>• 草稿归各插件或助理；<br>• 引导记录归 Onboarding。<br>回程只存引用，事实向主人读，不出现第二个主人 |
| 2 插件同等待遇 | `host.returns` 在所有插件共用的页面宿主上，不按插件名区分；普通链接的回程对所有插件都一样；不加构建期接线。两个构建期例外不改代码，各按它们现有的入口回到原处（创作台在桌面壳里除外，见第 4 节） |
| 3 能力注册 | 不加动作（2.4）。判断「好了」只读已有的设置路由；可信身份取自宿主给的 `storage_scope` 与页面授权；不涉及 `scheduling` |
| 4 合同 | 改 `platform/ui`（加类型与 `returns`）；改 `platform/dom-events`（扩一条，加三条，给 `place-changed` 加一个字段，改两句说明，加一个主人）。M1 之前不留兼容期。合同先单开 R0（类型、拒绝占位、过时说明）；页面事件（含 `place-changed` 的新字段）与发它的代码在同一个改动里（R1a、R1b） |
| 5 放在哪个包 | `apps/workbench`（外壳）与 `packages/contracts`。不进宿主，不新建 horizontal 包（回程是浏览器布局的事实，2.2） |
| 6 表与存储 | 不加库表。浏览器 `sessionStorage` 加三个键，主人 `settings-return`。不加跨标签通道 |
| 7 兼容与迁移 | 不加；形状不对的回程整张丢掉 |
| 8 安全边界 | 碰「地址与路径校验」（开放跳转）与插件页面的通道；新增三条不变量（第 5 节） |
| 9 调用次数 | 见 3.4：发起读 1 次，结算读 1 次，回去、认领、问布局 0 次；后台不轮询 |
| 10 升级与数据 | 不涉及库。回程不跨应用重开（U3 选 A），升级不影响 |
| 11 成果与过程项 | 不涉及：回程不是成果，也不交给别的插件 |
| 12 页面与外壳 | 插件不出整页，设置仍是外壳的覆盖层。新页面事件在 `dom-events.ts` 登记。页面资源用任务许可文件写明理由。`mountFrame` 只接一行，巨大单元登记里写新的 `size` |
| 13 错误 | 外壳一侧不加错误码；`go()` 的拒绝是固定文字（与 `connectionNeed` 相同） |
| 14 冲突面 | **改到 07 的文件**：<br>• `apps/workbench/src/scripts/client/tab-workspace.ts`：外层转发 `workbench-open-settings` 那段；<br>• `tab-workspace-places.ts`：`announcePlace` 多带 `cover`，旁边加 `layout-holds` 的回答。<br>具体交界见第 10 节：**R1a 先合，S1、S2 变基**。`tab-workspace-panes.ts` 不改。<br>**枢纽**：`dom-events.ts`、`apps/workbench/src/i18n/en.ts`（07-S1～S5 的叠分支在改）。`tooling/gates/page-assets.json` 不碰（用任务许可文件）。<br>**④c-2 与 #1929**：与本项都改 `apps/workbench/src/browser/plugin-frame/` 下的三个文件：<br>• `parent.ts`：④c-2 换掉 `connectionNeed` 的转发、接卡；本项只在 `mountFrame` 接一行进 `returns.ts`；<br>• `child.ts`：④c-2 换掉 `connectionNeed` 的占位；R0 加 `returns` 占位，R1b 换成实现；<br>• `types.ts`：两边各加 MessagePort 消息。<br>它们还都改 `parent.ts#mountFrame` 的巨大单元登记。两者串行：第 18 批 P3-1（[#1929][PR1929]）→ ④c-2 → R0 → R1a → R1b，本项在④c-2 之上变基。<br>本项不碰 `framed-area.ts`、`over-frame.ts`、`connection-slot.ts`、`tab-workspace-ops.ts`、`tab-workspace-panes.ts`、`immersive-shell.ts`、`plugin-frame/navigation.ts` |

## 7. 验收标准

1. **DRT-01** 从插件页面的普通链接进模型设置，配好第一个能跑的模型（需要从没有变成有）：覆盖层先关，回到来处，提示一句，之后才发 `molis-work:model-ready`。来处的输入、选中、滚动位置不变，页面没有重建。
2. **DRT-02** 从齿轮、菜单或地址直接进设置：不开回程，不出返回条，保存后不自动关。
3. **DRT-03** 打开时需要已经满足（已有模型还点了模型设置），或地址里看不出要补什么（`none`）：保存后不自动关，返回条写「回去」；点了就回到来处。
4. **DRT-04** 设置里出错（密钥被拒、登录失败、限流、检查没通过）：留在设置，填的还在，返回条还在。人点「现在回去」，来处拿到 `not_ready`，什么都不重做。
5. **DRT-05** `host.returns.go` 带 `draft_key`、`step`：配好回来时，Promise 答 `ready`，并原样带回 `carry`。插件只把那一步做一次（同一幂等键），原有的确认照问。答 `not_ready` 时不做。
6. **DRT-06** 在设置里刷新：
   - 覆盖层重开后，返回条还在；
   - 来处页面重新挂上后调 `arrived()`，这时回程还开着，`arrived()` 一直等着；
   - 人配好模型以后，`arrived()` 答 `ready` 带 `carry`，来处用平台的「接着做」共用件问一句，人点了才做；
   - 第二次调 `arrived()` 为 `null`；
   - 回程在刷新前就已结算的，新挂上的页面直接认领到。

   测试计划：
   - 浏览器（新 `tests/settings-return-trips.e2e.test.ts`，fixture 插件）只断言最后的结果：在设置里 `reload()`，配好模型后，来处拿到 `ready`、出现「接着做」共用件，第二次 `arrived()` 为 `null`；另一用例在结算之后刷新。单栏（默认布局）与分屏各跑一遍。单栏时页面可能等覆盖层关掉才挂上，所以浏览器用例不断言「先挂起」。
   - 单元（`return-trips.ts`）覆盖「一直等着」那一支：认领答 `{ open }`；结算后再认领拿到结果；`ended` 与挂载结束给 `null`；启动后补发的 `return-settled`；到期计时。
7. **DRT-07** 来处在别的栏或右侧：回去时落到已开的那一份，不新开第二份（S2 之前按现有的打开行为验，S2 合入后补测）。带 `object`、而来处页面已关的，打开到那条记录；没有 `object` 的，只关覆盖层，并说明。
8. **DRT-08** 来处的插件停用、卸载、页面授权撤了，或换了项目、换了安装：结果不交给别的安装、别的项目；设置照常关。
9. **DRT-09** 关掉应用再打开（U3 已定 A）：来处的草稿与新配置都在，读回事实显示可用；那一步不自动做；没有残留的回程。
10. **DRT-10** 从助理对话的「继续接入」进连接页并连好：回到那项工作，在等的工作只接着做一次（§4.7）。取消接入，则回到工作，不重做。
11. **DRT-11** 从连接提醒进设置并连好：关掉覆盖层，回到原处；提醒按原规则消掉。
12. **DRT-12** 在弹出的标签页或系统浏览器里完成 OAuth：
    - 原窗口得知完成后，照 DRT-01 回去；
    - 回调落地那一页写「可以关掉」，从不结算，不出返回条；
    - 弹出的标签页启动时换了窗口号，删掉了复制来的回程。
13. **DRT-13** 从原处连接卡「还不能一键连接」去连接页并连好：回到卡所在的页面，卡再读一次，然后接着它自己的流程。
14. ~~**DRT-14**~~ 已取消：Onboarding 已经在引导里就地连模型（#1310，ONB-MODEL-01），本项不改它。
15. **DRT-15** 回程里没有草稿正文、密钥、地址。`carry` 超长或字符不合、`need` 不在集合里、页面看不见时，`go()` 被拒，设置不开。
16. **DRT-16** 一个窗口一份：另一个标签页（含带 opener 打开的、复制出来的）不出返回条，不结算，不认领这个窗口的回程。本标签页自己刷新，沿用窗口号。
17. **DRT-17** 请求数按 3.4：发起与结算各读一次需要；回去、认领、问布局不发请求；设置隐藏或标签页在后台时不轮询（用例里数同源请求）。
18. **DRT-18** 网页里的 Alchemist、插件创作台不改代码：从它们的模型链接进设置，配好后回到原处。创作台在桌面壳里交给系统浏览器、回不来，是已知缺口，不在本条。
19. **DRT-19** 安全：`S-return-trip-source`、`S-return-trip-destination`、`S-return-trip-delivery` 三条的拒绝测试全部通过。
20. **DRT-20** 返回条、回来后的提示和「接着做」共用件：
    - 在中英文、浅深色、1440／1024／390 三种宽度下都成立；
    - 读屏能听到「从哪里来」和状态变化；
    - 键盘能走到「现在回去」。
21. **DRT-21** [人工] PF-A07 的退出证据：
    - 第 4 节每个要改的消费者各走一遍：进入设置、失败返回、取消返回、成功返回、重开后继续；
    - 工程、实操、本人验收三级分开，记在本 spec 的证据节；
    - 共享实现通过，不替代各消费者接入的验证。
22. **DRT-22** 人在设置里时离开了来处（关掉那个标签、同一窗格换了插件、页面中止 `go()`），之后才配好：来处什么都拿不到，下次挂上 `arrived()` 也是 `null`；配好的设置照常留在设置里。
23. **DRT-23** 人自己关掉设置（Esc、标题栏、Dock、历史后退），或直接换成别的覆盖层、从全局设置换到项目设置：回程经 `molis-work:place-changed` 的 `cover` 得知，读一次事实后，按 `ready`／`not_ready` 交给来处。关覆盖层沿用 `closeCover` 的历史语义。
24. **DRT-24** 没有项目的 Home 页面上的模型设置对话框：照现在打开，不开回程，不出返回条。
25. **DRT-25** 两种「两栏」：
    - **分屏的两个窗格**（主区左右两栏，靠复制标签做出，`ops.moveTab(…, copy)`）各开同一界面一份：结果只交给来处那一栏，另一栏的 `arrived()` 为 `null`。
    - 同一窗格里同一界面的另一个标签可能拿到结果：认领只比对安装、界面与窗格，不区分同一窗格里的标签（实现时补，记在这里）。
    - **侧栏格**（`workbench.side` 槽，与主区不是同一个界面）里的页面调 `go()`：仍挂着的 `go()` 能拿到结果；它的 `place` 为 `null`，重建后的 `arrived()` 按设计不交。
    - fixture 插件要同时有主区视图和侧栏视图。

## 8. 拆片

按开发流程第 1.1 节的「大需求」：合同先行，服务其次，界面与消费者叠在后面。

- PR 粒度照路线书的规矩：一项交付完整做完、或别的片真要先用到时，才开 PR；同一片的后续步骤叠在一个分支上。
- 全量由统筹在集成分支跑，写手不跑全量。单跑用 `node scripts/run-tests.mjs <文件…> --jobs 1`，先用 `node scripts/affected-tests.mjs` 选文件。

**先后**：第 18 批 P3-1（[#1929][PR1929]）→ ④c-2 → R0 → R1a → R1b → R2 → R3、R4。

- **④c-2 与 R1 串行**。P3-1 已开 PR，④c-2 比 R1 先能开工，所以**④c-2 先合，R0、R1a、R1b 在它之上变基**。两边都改的文件是 `apps/workbench/src/browser/plugin-frame/parent.ts`、`child.ts`、`types.ts`，以及 `mountFrame` 的巨大单元登记（分工见 6.2 第 14 项）。
- R0 只是类型与占位，可以和④c-2 同时写，但等④c-2 合入后再开 PR，免得 `child.ts` 来回变基。
- R1a 仍先于 07-S1、S2 合入，S1、S2 在它之上变基（第 10 节）。
- R4 里卡的那一行，自然排在④c-2 之后。

| 片 | 内容 | 文件范围 | 前置 | 要跑的测试 |
| --- | --- | --- | --- | --- |
| **R0 合同** | • 加 `UiReturnNeed`、`UiReturnCarry`、`UiReturnOutcome`、`UiPageReturns` 与 `UiPluginClientHost.returns`（2.4 的说明原样进合同）。<br>• `child.ts` 的固定拒绝占位。<br>• SDK 再导出类型名。<br>• 改两处过时说明（`docs/platform/PROLOGUE-AI.md:204`、`dom-events.ts:262`）。<br>• `pnpm api:update` | `packages/contracts/src/platform/ui.ts`；`packages/contracts/src/platform/dom-events.ts`（只改 `model-ready` 的说明）；`packages/plugin-sdk/src/`（类型再导出处）；`apps/workbench/src/browser/plugin-frame/child.ts`；`docs/platform/PROLOGUE-AI.md`；`tooling/gates/api/` | ④c-2 合入 | `pnpm health:check`（API 快照、文档引用、页面事件）；`tests/plugin-sample.e2e.test.ts` 的类型检查那一半（SDK 只依赖 contracts） |
| **R1a 回程主人、普通链接与模型结算** | • 逻辑都写在 `return-trips.ts`：存取、形状检查、窗口号与离开记号（外层脚本最早时同步读；从往返缓存回来时重读回程）、回调落地页换号、期限、上限与到期计时、`placeOf`、布局判断。`settings-return.ts` 只接线；主人同步初始化。<br>• 普通链接与平台界面开回程（2.3 的推断表，`claim: false`）。<br>• 模型设置的保存结算、人回去、经 `place-changed` 的 `cover` 得知关掉或换掉设置、刷新与启动时补读。<br>• 回去：关覆盖层、对象链接入口、`molis:assistant-open`。<br>• `sentFromPage` 挪进回程。<br>• `open-settings-path` 载荷扩展；外层转发带上 `need`、`from`、`carry` 并补 `place`；`announcePlace` 发 `cover`（去重算上 `cover`）并登记字段；`layout-holds { pane, surface }` 的回答。<br>• 框架宿主一侧给普通链接补来处：新模块 `plugin-frame/returns.ts`，`mountFrame` 接一行。<br>• 独立 Home 对话框忽略新字段。<br>• `S-return-trip-destination`；页面资源许可文件 | 新：`apps/workbench/src/browser/settings-return.ts`、`apps/workbench/src/browser/return-trips.ts`、`apps/workbench/src/browser/plugin-frame/returns.ts`。<br>改：`apps/workbench/src/browser/plugin-frame/parent.ts`（`mountFrame` 一行）、`tooling/gates/giant-exceptions/apps/workbench/src/browser/plugin-frame/parent.ts.json`（新的 `size`）、`settings-directory.ts`、`tab-workspace.ts`（外层转发）、`tab-workspace-places.ts`（`announcePlace` 与 `layout-holds`）、`packages/contracts/src/platform/dom-events.ts`、`apps/workbench/src/i18n/en.ts`（提示语）、`docs/platform/UI-PLATFORM.md`、`docs/system/security-invariants/S-return-trip-destination.md`、`tooling/gates/page-asset-allowances/12-draft-and-return-r1a.json`。<br>新测试 | R0；先于 07-S1、S2；`dom-events.ts`、`en.ts` 与 07 排时段 | `tests/model-first-setup.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`、`tests/model-ready-cross-tab.e2e.test.ts`、`tests/cognia-embedded-settings.e2e.test.ts`、`tests/security-invariants-pane-messages.test.ts`（S-30）；新 `tests/settings-return-trips.e2e.test.ts`（DRT-01～04、07～09、16～18、23、24）；新 `tests/security-invariants-return-trips.test.ts` 的 destination 一半、窗口归属一半与布局判断（⑫、⑭、⑮，单栏与分屏）；`pnpm health:check`（页面事件、页面资源、巨大单元） |
| **R1b 插件页的 `go`、认领与交还** | • 认领比对、`{ open }` 与等待的逻辑写在 `return-trips.ts`（单元测试落在这里）；`host.returns.go`／`arrived()` 的接线在 `plugin-frame/returns.ts`：生成 `return_id` 与挂载随机号、看不见的页拒绝、`carry` 检查、在 `window.top.document` 上听 `return-settled` 与认领、`arrived()` 等开着的回程。<br>• `molis-work:return-claim`、`molis-work:return-settled`；主人启动完成后补发。<br>• 按布局判断重建与离开（2.4 的表）；同一文档清理时发 `drop`。<br>• 嵌套派发与快照（3.1 第 8 步）。<br>• `S-return-trip-source`、`S-return-trip-delivery`，以及它们的单元、浏览器测试。<br>• Skill 与文档：`skills/molis-plugin-dev`、`skills/molis-prologue-ai` 步骤 6、`apps/workbench/README.md` | `apps/workbench/src/browser/plugin-frame/returns.ts`、`child.ts`、`types.ts`；`parent.ts` 与它的巨大单元登记（若 `mountFrame` 的大小又变）；`settings-return.ts`；`dom-events.ts`；`docs/system/security-invariants/S-return-trip-source.md`、`S-return-trip-delivery.md`；`tooling/gates/page-asset-allowances/12-draft-and-return-r1b.json`；新测试 | R1a（因而在④c-2 之后） | `tests/security-invariants-plugin-pages.test.ts`、`tests/security-invariants-plugin-pages.e2e.test.ts`；新 `tests/settings-return-trips.e2e.test.ts`（DRT-05、06 的单栏与分屏、15、22、25）；新 `tests/security-invariants-return-trips.test.ts` 与 `.e2e.test.ts`（DRT-19） |
| **R2 返回条与「接着做」共用件（界面）** | 先定样（U4、U2），做成组件板标本：<br>• 设置顶上的返回条；<br>• 插件页面里「刚才去配了〈什么〉，已经好了 · 接着〈那一步〉 · 不用了」的共用件（第 9 节）。<br>然后进设置的两处落点；回来后的提示用现有的 toast | 组件板与设置外壳的样式和渲染；共用件放在设计系统，由平台提供，插件只放位置（具体文件随定样定）；`DESIGN.md` 的设置一节 | 定样；R1a | 新用例里的 DRT-20 部分；`tests/connections-page.e2e.test.ts`（ASC-76 的「接着改」不受影响）；组件板快照 |
| **R3 模型消费者** | Cognia、工作流程、Coding 改用 `host.returns.go`，并用共用件接 `arrived()`（第 4 节）；Coding 的输入草稿改存 `host.drafts`；各插件 README 的「改动后必跑」补用例 | `plugins/native/cognia/src/`、`plugins/native/workflows/src/browser/`、`plugins/native/coding/src/browser/`，以及各自的 README 与测试；`skills/molis-plugin-dev` 的例子 | R1b、R2 | `tests/cognia-embedded-settings.e2e.test.ts`、`tests/workflows-plugin.test.ts`、`tests/coding-model-controls.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`，以及各插件新增的 DRT-05 用例 |
| **R4 13⑤ 接入** | • 连接页作为落点：授权监视与保存结算；「连好以后」让位；回调落地页改文案、启动时换号；`setup` 需要按 3.4 的路由读。<br>• 助理「继续接入」与提醒作为来处。<br>• 原处连接卡的「还不能一键连接」开回程 | `apps/workbench/src/scripts/connectors-settings.ts`、`apps/workbench/src/settings-connectors.ts`、助理画「继续接入」的地方、`apps/workbench/src/browser/plugin-frame/` 里卡的那部分 | R1a、R2；④c-2 已先合 | `tests/connections-page.e2e.test.ts`、`tests/security-invariants-connection-card.test.ts`，以及新用例里的 DRT-10～13 |
| ~~R5 Onboarding~~ | 已取消：引导已经就地连模型（#1310） | — | — | — |
| Images、Feed | 删 `resumeConnection`；去设置的链接让位给卡 | 随④c-2 | ④c-2 | 随④c-2 |

本稿这一步只改文档，没有跑测试。

## 9. 界面：组件板能覆盖什么、要定样的

| 界面 | 组件板现有的能不能覆盖 | 结论 |
| --- | --- | --- |
| 回来后的一句提示（「模型已连接，回到 Coding 接着做」） | 能：用现有的 toast（`host.showToast`，`settings-directory.ts` 已经在用） | 不定样，只加文案 |
| 设置顶上的返回条「从 Feed 来 · 连好后自动回去 · 现在回去」，三种状态：等着、已经好了、原来的页面已关 | 不能：组件板没有这一条。最接近的是 13 定样原型里块 ③ 方案 B 的顶条（`docs/design/service-connections/`）；用户 11-04 选了 A（原处就地连），B 没有进组件板 | **要定样**，方向用户 11-07 已定（U4）：照 B 的顶条，用 `mw-alert` 的信息档加一个 `mw-btn` 次要按钮，做成组件板标本后进设置 |
| 刷新后在原处问一句：「刚才去配了模型，已经好了 · 接着发送 ／ 不用了」 | 部分能：样子照连接页「高级」的「接着改／放弃改动」（`settings-connector-draft`，`mw-alert` 加两个按钮） | **要定样，做成共用件**（用户 11-07 定 U2，统筹定由平台提供）：放在设计系统里，插件只在自己页面里放位置、给「接着〈那一步〉」的文字，不各画一份。R2 做成组件板标本 |
| 原处连接卡「还不能一键连接」的去连接页入口 | 能：#1862 的卡标本已经有这一种 | 不定样 |
| 回调落地页文案 | 能：用现有连接页的反馈行 | 不定样，只改文案（C8） |

## 10. 与在途工作的边界

**第 07 批 S1（[#1853][PR1853]，右侧并入窗格，暂停中）、S2（[#1867][PR1867]，打开、召回与布局，叠在 S1 上）**。我看过两份 diff 的文件清单与 S2 的说明，也看过 S1、S2 在 `tab-workspace.ts`、`tab-workspace-places.ts`、`tab-workspace-panes.ts` 里的每一块改动。

| 07 管 | 本项管 | 交界怎么处理 |
| --- | --- | --- |
| 窗格、标签、右侧、独看、跨栏召回（`openSurfaceEntry` → `recall`）、「返回」历史、工作区状态 `molis-work-tab-workspace:<项目>`、覆盖层的 `closeCover`／`noteCover` | 回程：来处、需要、认领；设置覆盖层上的返回条；什么时候关覆盖层 | 本项只调已有的 `host.closeCover()`、`host.noteCover` 和对象链接入口（`?openPlugin=`），关覆盖层沿用 `closeCover` 的历史语义。S2 合入后，对象链接入口自动经召回 |
| `tab-workspace.ts` 的窗格转发 | 转发要多带 `need`、`from`、`carry`，`from.place.pane` 由外层按窗格框的 `dataset.paneOwner` 改写（与 `placeOf` 同一算法） | **最小改动一处**：外层那段（main `:487-490`）改成转发三项，并改写 `from.place.pane`。这段原文是：<br>`if (frame && event.data.type === "workbench-open-settings") { document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: event.data.href \|\| "" } })); return; }`<br>窗格文档拦 `/settings` 点击那段（main `:64-71`）内容不变；窗格页的框架宿主在 `returns.ts` 里多带三项。<br>**与 S2 冲突**：S2 的 `@@ -519,7 +529,18 @@` 一块（按 S1 头计行）以这段 `dispatchEvent` 为上下文，紧接着把下一行的消息类型名单加上 `workbench-pane-solo`，并插入右侧窗格一支。R1a 改的正是它的上下文行，S2 变基时要手工合这一块。<br>**与 S1**：S1 的 `@@ -70` 一块拿窗格拦链接那几行当上下文，R1a 不改那几行的内容，不冲突，但 S1 也要在 R1a 之上变基 |
| 位置宣告（`tab-workspace-places.ts` 的 `announcePlace`）与布局状态 | 回程要知道设置被关掉或换掉，并在结算时问来处还在不在布局里 | **最小改动一处**：`announcePlace`（main `:206-214`）的 `next` 多带 `cover: state.exclusive \|\| null`，去重时算上 `cover`；紧接着加 `molis-work:layout-holds { pane, surface }` 的同步回答：`paneById(pane)` 还在，并且 `pane.viewPlugin === surface \|\| pane.tabs.some((tab) => tab.plugin === surface)`，不依赖框的键名；嵌入的窗格文档不答。<br>**语义交界（统筹定）**：S1 把右侧并成 `paneOwner === "side"` 的窗格，S2 改了 `paneFrameKey` 和首页的 `viewPlugin`。S1、S2 变基时，由 07 的写手把 `layout-holds` 扩到 `state.side.tabs`，并按第 07 批新的布局重核一次 `placeOf` 与 `layout-holds`。这条请求以后归 07 维护<br>**与 S2 的交界**：S2 在这个文件有 `@@ -17`（`keptPlace`、`pruneHistory`、`rememberTab`）、`@@ -58`、`@@ -97`、`@@ -115`、`@@ -190`（`goHistory` 里的 `showPage`，到 main `:197` 为止）几块。R1a 改的 `:206` 以后不在其中任何一块里，变基时多半自动合上，要核一次。S1 不改这个文件 |
| `tab-workspace-panes.ts`（S1 `@@ -259`，S2 `@@ -105`、`@@ -157`） | 不改 | 无交界 |
| `plugin-frame/navigation.ts`（S1 改） | `plugin-frame/returns.ts`、`parent.ts` 一行、`child.ts`、`types.ts` | 不改同一个文件 |
| 枢纽：`dom-events.ts`、`i18n/en.ts`（S1、S2 都改）；`tooling/gates/page-assets.json`（S1、S2 都改） | R0、R1a、R1b 改前两个；不改第三个（用任务许可文件） | 时段由统筹排；冲突按批落规则一次解 |

**R1a 先合，S1、S2 变基**：07 暂停到第 13、18、02 批完成，而 13⑤ 在等本项；本项若等 07，就会互相卡住。R1a 合入后，S1、S2 在上面几处交界变基。DRT-07 的「不新开第二份」，在 S2 之前按现有的打开行为验，S2 合入后再补测一次（C6）。

**第 13 批④c**：
- ④c-1 宿主路由已合。
- ④c-2（外壳画卡、Feed 与 Images 接卡）要等第 18 批 P3-1（[#1929][PR1929]，`framed-area.ts`、`over-frame.ts` 都在里面）。P3-1 已开 PR，所以④c-2 比本项先能开工。
- 两者串行：**④c-2 先合，R0、R1a、R1b 在它之上变基**。两边都改 `apps/workbench/src/browser/plugin-frame/parent.ts`、`child.ts`、`types.ts` 和 `mountFrame` 的巨大单元登记（6.2 第 14 项）。
- 本项不碰 `framed-area.ts`、`over-frame.ts`、`connection-slot.ts`。卡内的流程不改，R4 只加「还不能一键连接」去连接页那一下的回程。

**第 18 批 P3**：防遮盖模块（`framed-area.ts`）只与④c-2 有关。返回条在设置覆盖层里，属于可信文档，不贴在插件框外，所以不用它。

## 11. 待决

### 11.1 用户拍板

四项都已定（用户 2026-11-07），都选了推荐。

| # | 问的事 | 已定（用户 2026-11-07） | 为什么 |
| --- | --- | --- | --- |
| U1 | **配好以后，要不要自动关掉设置、回到原来的地方；回去以后，要不要把刚才被挡住的那一下自动做掉？**<br>入口分两种：<br>• 插件明确说了「我这一步缺模型」，比如 Coding 你按了发送才发现没模型；<br>• 插件页面上只是一个普通的「打开模型设置」或「去连接」链接，没说是为了哪一步 | **两种入口都回去；只有第一种自动把那一下做掉。**<br>• 第一种：配好就回去，把你刚才按的那一下做一次；要花钱或不能撤回的，照它原来的样子先问你。<br>• 第二种：配好也回去，但不替你做任何事。现在只有「第一个模型配好」时才回去，以后换模型、修好模型也回去。<br>• 你本来就配好了、只是进去看看的，不自动关。<br>• 链接里看不出要配什么的（比如只是打开设置首页），永远不自动关，顶上留一个「回去」。<br>• 连接页「连好以后」那段往前走的链接，有来处时让位给回去，同属本条，不另问 | 你 11-06 对原处连接卡定过「连上后把刚才在等的事做一次」，这里用同一条，就不用记哪种会接着做。普通链接没说是为了哪一步，平台猜不出该做什么，所以只带你回去 |
| U2 | **在设置里刷新了页面，配好以后回到原处，那一下是直接做，还是先问你一句？** | **先问一句**。原处出一行「刚才去配了模型，已经好了」和两个按钮「接着发送」「不用了」，样子照连接页的「接着改／放弃改动」。<br>这一行**由平台做成共用件**，放在设计系统里，插件只放位置、给「接着〈那一步〉」的文字，不各画一份（统筹 11-07 定）；R2 做成组件板标本。<br>没刷新的常见情况，仍按 U1 直接做 | 刷新可能隔了一会儿，你未必还记得刚才按了什么；直接做一件可能花钱的事会吓人 |
| U3 | **关掉 Molis Work 再打开以后怎么接？**<br>A：只记在当前这个窗口里，刷新还在，关掉就没了；重开后，你写的东西和配好的设置都在，自己再点一次。<br>B：记在这台电脑的浏览器里，重开后在原处问你一句「接着做吗」。<br>C：记在本机的后台服务里，效果同 B | **A** | 重开以后最要紧的是东西不丢，A 已经做到：草稿和配置本来就各自保存着。B 要额外判断「这是哪个窗口的」，还会被登录时弹出的那一页看到；C 要新加数据库表和升级步骤，只为多问一句。浏览器崩溃后恢复的标签页，也按「关掉了」算 |
| U4 | **设置页顶上那条「从哪里来」的提示条长什么样？** | **照 11-04 你看过的服务连接原型里「方案 B」顶上那一条，做成组件板的标准件。**<br>• 写「从〈原来的地方〉来 · 配好后自动回去」，右边一个「现在回去」按钮；<br>• 配好了但没自动回去时，写「已经好了 · 回去」；<br>• 原来的页面已经关了时，写明 | 这条你 11-04 已经看过。当时选的是「在原处就地连」，那个照样是首选；这条只在真的进了设置页时才出现，两者不冲突 |

### 11.2 统筹可以定

| # | 事 | 推荐 |
| --- | --- | --- |
| C1 | 回程的期限与上限 | 开着的 24 小时；已结算、等认领的 1 小时；每个项目 8 张；同一来处替换旧的；离开记号 10 秒内有效 |
| C2 | 页面事件 | • 扩 `molis-work:open-settings-path`；<br>• `molis-work:place-changed` 加 `cover` 字段（统筹 11-07 定，不加 `cover-closed`）；<br>• 加 `molis-work:layout-holds { pane, surface }`（主人 `tab-workspace`，同步回填，以后归 07 维护）；<br>• 加 `molis-work:return-claim`（请求，同步回填，认领即删）；<br>• 加 `molis-work:return-settled`（宣告，只发外层文档，启动完成后补发）；<br>• `molis-work:model-ready` 只改说明；<br>• 不加 §13.5 草案里的 `molis-work:connection-settled` |
| ~~C3~~ | 已并进 U1：普通链接的需要推断，会让所有普通链接的消费者「配好就自动关设置」，属于产品行为。技术约束写在 2.3：`setup` 不从链接推断、`none` 不自动关、设置里的链接不开也不替换回程 | — |
| C4 | `UiReturnNeed` 第一版的范围 | 只有 `model`；连接一律走 `connectionNeed`；图像服务、工作目录等，以后另开合同 |
| C5 | 页面状态主人 | 新主人 `settings-return`，是唯一写入方，不并进 `settings-directory` |
| C6 | 回到别的栏用什么入口 | 用现有的对象链接入口；R1a 先合，S2 变基后补测 DRT-07 |
| C7 | 跨标签的 `BroadcastChannel('molis-work:model-ready')` | 独立清理项，本项不删。现在仍有人发（`settings-models.ts:13`），也有人听（`context-onboarding.ts:776-781`），服务「引导开着时，在另一个标签页配好模型」。推荐留着，等引导下次改版时再看还要不要 |
| C8 | 回调落地页文案 | 「已连上。回到 Molis Work 的窗口继续；这一页可以关掉。」（随 R4）。普通链接开的回程只带人回去，什么都不做，所以不写「会接着做」 |
| C9 | 片的写手与时段 | R0、R1a、R1b 由工作台外壳的写手做；R4 交 D·13 连接会话。④c-2 先合，R0、R1a、R1b 在它之上变基；R1a 先于 07-S1、S2；`dom-events.ts`、`en.ts` 与 07 排时段 |
| C10 | 对象 id 的上限 | 256 个字符，不含控制字符，拼链接一律编码；R1a 开工前核对各搜索来源现有的 id 都放得进 |
| C11 | 插件重启、宿主把视图重画 | **已定（统筹 2026-11-07）**：算人离开，回程按 `not_ready` 结掉，不留给 `arrived()`。这种情况少见，后果只是少一次自动接着做 |
| C12 | 页面中止 `go()` 怎样告诉外壳 | **实现时定（统筹 11-07）**：MessagePort 加第 4 种消息 `return-abort { id }`。框架宿主收到后删掉那张回程（`drop`，不交结果），`go()` 在页面一侧以 `AbortError` 结束 |
| C13 | `carry.object.kind` 的上限 | **实现时定（统筹 11-07）**：至多 64 个字符，不含控制字符（`RETURN_TRIP_RULES.objectKind`） |
| C14 | 回程在等认领时被宣告结束（`ended`：到期、被同一来处的新回程替换、被挤出上限） | **实现时定（统筹 11-07）**：还挂着的 `go()` 答 `not_ready`，并原样带回它的 `carry`；`arrived()` 答 `null` |
| C15 | 回到别的栏用什么入口 | **实现时定（统筹 11-07）**：来处不在前面时，用工作台自己的 `openItem(界面, 对象)`（带 `carry.object`）或 `openPlugin(界面)`，不拼地址、不导航文档。补充 C6 |
| C16 | 在等的 `arrived()` 什么时候认领 | **实现时定（统筹 11-07）**：只在页面看得见时认领；藏在池里、被覆盖层盖住时先等着，看得见时再认领（池里的页面没有可比的位置） |
| C17 | 带槽的连接怎样读回 | **实现时定（统筹 11-07）**：回程主人按服务读（3.4 的「连接」那条路由），不调 C2 的 `read`：外层的回程主人没有那个页面的授权；槽上绑哪个账号由卡回来后自己再读（第 4 节那一行） |

## 12. 决策记录

- 2026-11-07，统筹按评审台第一轮（[#1928 评论][REVIEW1]）裁定，本稿照改：
  - B1：删掉 U5、R5、DRT-14（Onboarding 已经就地连模型，#1310）；跨标签通道改成独立清理项 C7，写明它现在仍有人发、有人听；两处过时说明随 R0 改。
  - B2：回程加窗口归属；回调落地页从不结算；`S-return-trip-delivery` 补弹出标签页的拒绝测试。
  - B3：R1a 先于 07 合，07 变基；写明与 S2 冲突的具体块。
  - B4：改成「认领」：只有一个写入方，框架宿主同步认领，认领即删。
  - B5：对齐用户 11-06 对④c 第 3 项的决定：只有人没选择离开的重建，才交给 `arrived()`；人自己离开的，按 `not_ready` 结掉。
  - 不挡的 1～11 照改。第 12 条：C3 并进 U1，用户拍板项只剩 U1～U4。
  - 同日统筹更正：第 18 批 P3-1 已开 PR #1929，④c-2 比 R1 先能开工；改成④c-2 与 R1 串行，④c-2 先合，R0、R1a、R1b 在它之上变基。
- 2026-11-07，用户拍板 U1～U4，四项都选推荐（第 11.1 节），正文的「推荐」都改成了定论。
- 2026-11-07，统筹按评审台第二轮（[#1928 评论][REVIEW2]）裁定，本稿照改：
  - 挡 1：人离开与重建，改由回程主人按布局事实判断：来处的窗格和标签还在，算重建；不在了，算离开（新增请求 `layout-holds`）。插件重启后由宿主重画，算离开（C11）。`go()` 说明里的「换视图」改成「页面自己中止」。
  - 挡 2：R0 合同说明改为：有开着的回程时，`arrived()` 一直等到它结算或结束；主人启动完成后补发一次 `return-settled`；只有 `go()` 开的回程可以认领，普通链接开的结算即删；认领时也比对 `place`。补上 DRT-06 的测试计划，并新增 DRT-25。
  - 挡 3：不加 `cover-closed`，改给 `molis-work:place-changed` 的 detail 加 `cover` 字段，在 R0 登记；不改 `tab-workspace-panes.ts`。
  - 不挡 1：窗口归属改用 `pagehide` 记号，去掉 `BroadcastChannel('molis-work:return-window')` 和 300 ms 的等待；回调落地页启动时无条件换号、清掉回程；浏览器崩溃后恢复的标签页丢掉回程，写进「不做」；登录弹窗不改成 `noopener`。
  - 不挡 2～7：
    - 框架宿主都在 `window.top.document` 上听、在那里认领，右侧格也收得到；
    - 写清嵌套派发的快照，以及交不出去的结果直接丢掉；
    - 回程逻辑放进新模块 `plugin-frame/returns.ts`，`mountFrame` 只接一行，巨大单元登记进文件范围；
    - `dom-events.ts` 主人表加 `settings-return`；不加跨标签通道，所以「只有一条」照旧成立；
    - S1 也列进 R1a 之后要变基的名单；
    - C8 文案去掉「会接着做」。
  - 不挡 8：「问一句」那一行做成平台的共用件，插件只放位置；写在 U2 的定论下，并列进 R2 的组件板标本。
  - 不挡 9：连接页「连好以后」让位给回去，已被 U1 的定论（配好就回去）覆盖，不另问。

- 2026-11-07，统筹按评审台第三轮（[#1928 评论][REVIEW3]）裁定，本稿照改：
  - 挡 1：`place` 改记 `{ pane, surface }`，只用一个算法 `placeOf`：外层文档里的页面取 `root.closest("[data-tab-pane]")`，窗格框里的页面取 `frameElement.dataset.paneOwner`。`layout-holds` 改判「窗格还在，并且有这个界面的视图或标签」；没人回答时不判断、回程留着；⑮ 与 DRT-06 在单栏布局下也跑一遍。
  - 不挡 1：S1、S2 变基时，由 07 的写手把 `layout-holds` 扩到 `state.side.tabs`，这条请求以后归 07 维护（统筹定）。
  - 不挡 2：`place-changed` 的 `cover` 补三处：`previous` 缺省按 `null`；去重算上 `cover`；现有监听方不受影响。字段登记挪到 R1a。
  - 不挡 3：离开记号在外层脚本最早时读；从往返缓存回来时从存储重读回程；10 秒内重开刚关的标签页，算同一个标签页。
  - 不挡 4：主人加到期计时，到期发 `ended`；`{ open }` 只回给 `place` 对得上的认领。
  - 不挡 5：逻辑放进 `browser/return-trips.ts`；浏览器用例只断言最后的结果，「一直等着」那一支放进单元测试。
  - 不挡 6：DRT-25 写清是分屏的两个窗格与侧栏格，以及 fixture 的要求。

- 2026-11-07，统筹按 R0～R4 第一版的回报裁定，本稿照改：
  - 页面资源：用户弹窗定「先缩再一次性放行」：先合并重复的形状检查、用平台与 SDK 已有的工具，再按实测写放行文件，每条带用户批准。
  - 实现时定的五项写进第 11.2 节 C12～C16：第 4 种消息 `return-abort`；`object.kind` 至多 64 字；`ended` 时答 `not_ready` 并带回 `carry`；回到别的栏用 `openItem`／`openPlugin`；在等的 `arrived()` 只在看得见时认领。
  - Coding、Cognia 的入口是普通入口：带着草稿去设置，回来问一句，从不自动做那一步（U1 第二种入口），写进第 4 节两行。
  - 助理的「继续接入」由助理岛自己在点击时发 `molis-work:open-settings-path`，带它此刻显示的工作号（`from: assistant`、`need: setup`），回程主人不再从列表的 `aria-current` 去猜。
  - 原处连接卡的「还不能一键连接」开回程（`need: connection` 带槽），回来后卡再读一次（第 4 节那一行）；带槽的读回按服务读，记为 C17（统筹 11-07 认可）。

用户与统筹之后定的，按日期接着写在这里，正文跟着改。

## 13. 证据

本稿只做了只读核查：
- main `c39746b20` 的文件与行号，见第 1.1 节；
- 看过 [#1853][PR1853]、[#1867][PR1867]、[#1929][PR1929] 的文件清单；
- 看过 #1867 的说明，以及 S1、S2 在 `tab-workspace*.ts` 里的改动块。

没有改产品代码，没有跑测试，没有启动 Home。

[B12]: ../post-anticorruption-roadmap/reference/batches/12.md#batch-12-item-3
[B13]: ../post-anticorruption-roadmap/reference/batches/13.md#batch-13-item-1
[AUDIT]: ../product-flow-governance/audit-2026-10-27.md
[PFG]: ../product-flow-governance/spec.md
[ASC]: ../assistant-service-connections/spec.md
[ONBMODEL]: ../archive/onboarding-model-link/spec.md
[PR1853]: https://github.com/molis-ai/molis-work/pull/1853
[PR1867]: https://github.com/molis-ai/molis-work/pull/1867
[PR1929]: https://github.com/molis-ai/molis-work/pull/1929
[REVIEW1]: https://github.com/molis-ai/molis-work/pull/1928#issuecomment-6707035590
[REVIEW2]: https://github.com/molis-ai/molis-work/pull/1928#issuecomment-6707277897
[REVIEW3]: https://github.com/molis-ai/molis-work/pull/1928#issuecomment-6707424740
