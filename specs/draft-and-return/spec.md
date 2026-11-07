# 草稿与返回：从哪里来、回到哪里、接着做什么（路线书 12 第三项）

状态：设计稿（2026-11-07），没有实现，也没有改合同代码。第 13 批统筹按用户 11-07 的安排派写手写稿；评审台第一轮（[#1928 评论][REVIEW1]）「要改」的五条挡合并与十二条不挡已按统筹裁定改进本稿（第 12 节），待复评。第 11 节的用户拍板项与统筹可定项都还没定，第 13 批⑤等本项合入后接入。需求维护与本稿：Claude（第 13 批统筹派的写手）；实现片的写手按第 8 节由统筹派。

- **档位**：大需求（新的平台能力、改 `UiPluginClientHost` 合同、跨工作台外壳、设置页与多个插件）。
- **类型**：横向能力（主），产品线（工作台、服务连接、模型设置、各插件），体验与效果。
- **决策**：要决策：第 11.1 节四项要用户拍板（含返回条定样），第 11.2 节由统筹定。
- **相邻的线**：第 13 批⑤「连完回到原处」是第一个消费者；④c 原处连接卡（[服务接入需求][ASC] §13.5）已经覆盖在原处就地连，本项只管「进了设置页再回来」；第 07 批工作台导航（S1 [#1853][PR1853]、S2 [#1867][PR1867]）管窗格、标签、召回与覆盖层，本项在 `tab-workspace.ts` 的窗格转发与覆盖层关闭处各改最小的一处，先于 S2 合入，边界见第 10 节；第 18 批 P3 的防遮盖模块只与④c-2 有关，本项不碰。
- **需求来源**：[12 第三项][B12]；[治理核查 PF-A07][AUDIT]；[治理需求][PFG] 的 PFG-04～06；[13 的核账][B13]「六、连好之后能不能回到原来的工作」「七、实现时要做的」。

## 0. 给人讲清楚

在 Cognia、Coding、工作流程这些地方，缺模型或缺账号时会给一个「打开模型设置」之类的入口。点进去配好以后，现在常常要自己找回原来的地方，刚才按下的那一步也要重新点；从齿轮进去的、刷新过的、在系统浏览器里登录的，情况又各不一样。各个插件还各写了一份「回来以后怎么办」。

这一项做一份平台共用的「回程」：从哪里进的设置、配好后回到哪里、回来后接着做哪一步。配好了就自动回到原处并说一声；没配好、出错或改主意，就留在设置里或者带你回去，原来写的东西都不动。各插件不再各写一份，只告诉平台「我这一步缺什么」。

需要你定的四件事（第 11.1 节）：配好以后要不要自动回去、自动把刚才那一下做掉；刷新之后怎么接；关掉应用再打开之后怎么接；设置页顶上那条「从哪里来 · 现在回去」长什么样。

## 1. 要解决的问题与范围

### 1.1 现在怎样（main `c39746b20`）

先说一个前提：设置是**盖在工作台上的覆盖层**（`exclusive`，`apps/workbench/src/scripts/client/settings-directory.ts` 打开，`host.closeCover()` 关），不是另一页。在同一个标签页里从插件点进设置，插件页面就在覆盖层下面活着，输入和选中都还在；所以大多数情况下「回到原处」就是在对的时候关掉覆盖层。真正丢东西的是下面这些情况。

| 来处 | 现在 | 缺什么 | 证据 |
| --- | --- | --- | --- |
| 插件框里的普通链接（Cognia、工作流程、Coding、Jelly、Dataset、Form、PPT、Schedule、Shelf） | 链接 `/settings/models` 经框架转发（`apps/workbench/src/browser/plugin-frame/parent.ts` 的 `openSettings`）发 `molis-work:open-settings-path`；窗格文档里的页面经窗格转发（`tab-workspace.ts:64-71` 拦下点击、`:487-490` 外层只带 `{ href }` 再发）。只在「第一个能用的模型」保存时，`settings-directory.ts` 的 `modelReady` 用 `sentFromPage` 先关覆盖层、提示「模型已连接，可以继续了。」，再发 `molis-work:model-ready` | 换模型、修好坏掉的模型、第二个供应商都不回去；`sentFromPage` 只是内存里的一个布尔，刷新就没了；事件不带原来的任务、输入、选中；插件不知道人是为哪一步去的，只能靠事件重读整页 | `settings-directory.ts:101-108,368`；`packages/contracts/src/platform/dom-events.ts:260` |
| 外层文档里的客户端：Alchemist、插件创作台（两个构建期例外） | Alchemist 的链接由 `settings-directory.ts:414-433` 的点击处理接住；创作台在网页里直接在外层文档发 `open-settings-path`，在桌面壳里用 `molisWorkOpenExternalUrl` 把设置交给系统浏览器（`plugins/native/plugin-builder/src/agent-studio.ts:525`） | 同上；创作台在桌面壳里根本不在这个窗口打开设置 | 同左 |
| 齿轮、菜单、地址直接进 | 不回去 | 按设计就没有来处，不算缺陷；但现在和「从页面来」分不清的地方只有 `fromPage` 一个参数 | `settings-directory.ts:404-441` |
| 设置的连接页 | 登录先 `window.open('', '_blank')` 占一个新标签，开的时候带着 opener、之后才 `popup.opener = null`（`connectors-settings.ts:167-172`）；原窗口每 2 秒读授权记录；回调把新标签带到 `/settings/connectors?connected=…` 或 `/capabilities/connections?setup=…`，写「请回到原来的应用窗口继续」 | 原窗口连好以后不回到来处；新标签是一整份工作台，带着**复制来的** `sessionStorage`（带 opener 打开时浏览器复制打开者的会话存储，事后清 opener 不撤回）；在桌面壳里是系统浏览器 | `apps/workbench/src/scripts/connectors-settings.ts:167-215,620`；`apps/local-host/src/web-connector-api-methods.ts:34-36`、`web-connector-methods.ts:37` |
| 连接页「连好以后」 | 一段往前走的链接（「打开 Feed，添加来源」，`?openPlugin=`） | 是往下一步走，不是回到来处；有来处时两者会打架 | `connectors-settings.ts:621-628`；`apps/workbench/src/settings-connectors.ts:70` |
| 连接页「高级」 | 没保存的改动留在这个窗口，回来时提示「接着改」「放弃改动」（ASC-76） | 这是设置页自己的草稿，本项不改，返回提示照它的样子做 | `connectors-settings.ts:529-549`；`tests/connections-page.e2e.test.ts` 的 ASC-76 |
| 助理对话 | `connectors.setup.prepare@1` 给「继续接入」（`/capabilities/connections?setup=<授权号>`）；授权完成后 `molis.connector-setup@1` 的等待把那项工作接着做一次（§4.7） | 工作会接着做，人不会被带回那项工作 | `apps/local-host/src/connector-setup.ts:24`；[服务接入需求][ASC] §4.7 |
| 连接提醒 | 助理提醒 `kind: "connection"` 带只许 `/settings/` 的 `settings_path`（#1861） | 去了设置，连好不回 | `apps/workbench/src/scripts/client/assistant-notices.ts:13` |
| Onboarding | **已经在引导里就地连模型**：「连接文字模型」交给 `molisWorkOnboardingModel.act`（`context-onboarding.ts:756`），界面在 `apps/workbench/src/scripts/onboarding-model-slide.ts`，就地保存（#1310，已归档的 [onboarding-model-link][ONBMODEL] 的 ONB-MODEL-01）。Gmail 的 OAuth 有自己的回程（`OAuthReturn`，引导记录里的等待）。引导页仍听 `BroadcastChannel('molis-work:model-ready')`（`context-onboarding.ts:776-781`），发的人是模型设置脚本（`settings-models.ts:13`） | 不缺回程。那条跨标签通道现在只服务一种情况：引导开着时，人在另一个标签页的设置里配好了模型。`docs/platform/PROLOGUE-AI.md:204` 与 `dom-events.ts:262` 里「开始使用页在新标签打开设置」的说明已经过时 | 同左 |
| 独立 Home 的模型设置对话框 | 没有项目的 Home 页面上，`open-settings-path` 的第二个监听者，只接 `/settings/models`、`/settings/connectors`、`/capabilities/connections`（`home-model-settings.ts:83`） | 没有插件框、没有工作区，本项第一版不在这里开回程（第 4 节） | 同左 |
| Feed | 链到 `/settings/connectors?connector=…&project=…`，回来靠人 | ④c-2 改成原处连接卡后，这条链接只剩「还不能一键连接」 | `plugins/native/feed/src/ui.ts:421-426` |
| Images | 自己记 `resumeConnection`：对话框里点设置链接时记下正在编辑的连接，回来再开对话框时接着编辑 | 一个插件自己写的回程；它缺的是图像服务，不是文字模型；④c-2 的卡取代缺密钥那一处之后可以删 | `plugins/native/images/src/browser/commands.ts:126-130`；`connections.ts:131-134` |
| 工作流程 | 连接浮层里「打开模型设置」是普通链接；`ui.returnTo` 是工作流程自己「从运行回到编辑再回运行」的返回 | 去设置这一段没有回程；`returnTo` 是它自己的事实，不归本项 | `plugins/native/workflows/src/browser/link.ts:46-56` |
| 已有的草稿 | 插件页在不透明来源的沙箱框里，`sessionStorage`／`localStorage` 经外壳按安装加前缀转存（`parent.ts` 的 `stored` 与 `:250-253`）；另有平台的 `host.drafts`（Cache，按安装与项目分开，关掉应用也在） | 草稿本身不缺，缺的是「回来时知道该拿哪份、接着做哪一步」 | `parent.ts:27-38,250-253`；`apps/workbench/src/browser/plugin-frame/drafts.ts`；`packages/contracts/src/platform/ui.ts` 的 `UiPageDrafts` |
| 人自己关掉设置 | `closeCover`（`tab-workspace-places.ts:131-145`）与几处 `ops.setExclusive(state, null)` 都能让覆盖层消失；页面事件里没有「覆盖层关了」的宣告 | 回程无从得知人自己关了设置 | `apps/workbench/src/scripts/client/tab-workspace-panes.ts:151-158` |

### 1.2 缺的就三样

1. **一张记着来处的单子**，由平台写、平台读，刷新还在，只属于开它的那个窗口；
2. **「好了」的判断**：去设置要补的那件事，回来前由平台向它的主人读一次，不凭设置页一句「保存了」，也不凭点过按钮；
3. **一条把结果交回来处的路**：插件认领「好了／没好」和它当初说的那一步，只接着做那一步。

### 1.3 范围

做：

- 回程的形状、存法、期限、窗口归属、谁能读；
- 从插件页面、平台界面（助理、提醒、原处连接卡）和普通链接进设置，三种发起方式；
- 两个落点：模型设置、服务连接页（含助理的「继续接入」）；
- 成功、失败、取消、人自己关设置、人自己离开来处、刷新、关掉应用重开、在弹出的标签页或系统浏览器里登录；
- 各消费者的接入清单（第 4 节）和拆片（第 8 节）。

不做：

- **不存业务内容**：草稿正文、密钥、地址、选中对象的标题都不进回程；草稿仍在各自主人那里（插件的 `host.drafts`／存储、助理工作的草稿、连接页「高级」、引导记录）。
- **不造第二份模型或账号状态**（PF-A07）：「好了没有」每次向主人读。
- **不替插件重放任何一步**：和④c 第 1 项同一条规则，平台只告诉插件「好了，你刚才说的是这一步」。
- **不改原处连接卡**（④c）：就地连仍是首选；卡里「还不能一键连接」去连接页那一下才用到回程。
- **不改工作台的窗格、标签、召回、返回历史**（第 07 批）：只在窗格转发与覆盖层关闭处各改一处最小的（第 10 节），关覆盖层沿用现有 `closeCover` 的历史语义。
- **不把链接改成弹窗**（PF-A07 明写）：设置仍是一处，各插件不各开一个设置对话框。
- **不改 Onboarding**：它已经就地连模型（#1310），Gmail 的 OAuth 回程是引导记录自己的事实。
- 从齿轮、菜单、地址直接进设置：没有来处，不回去（第 3.2 节）。
- 后台作业缺配置：仍走 #1870 的提醒；Agent、MCP 要连接仍走 `connectors.setup.prepare@1` 加等待。
- 创作台在桌面壳里把设置交给系统浏览器：本项不改它（构建期例外，BL-377 重做时再接）。

## 2. 合同提案

### 2.1 一张「回程」

名字：**回程**（return trip）。它只回答三件事：从哪里来、去补什么、回来以后交还什么。

```ts
// 外壳内部的记录（apps/workbench，不是公开合同）。存法与窗口归属见 2.2。
interface ReturnTrip {
  v: 1;
  id: string;                 // crypto.randomUUID()；插件框的由框架宿主生成，其余由主人生成
  window: string;             // 开它的那个窗口的窗口号（2.2）；对不上的回程这个窗口只读、不结算、不认领
  project: string;            // 工作台页面自己的项目；没有项目的 Home 页面第一版不开回程（第 4 节）
  from:                       // 外壳按可信信息写下，见 2.3
    | { kind: "page"; mount: string; scope: string; plugin: string; surface: string; pane: string | null }
        // 插件页面：本次挂上时框架宿主生成的随机号、宿主给的 install:project、Manifest 身份、界面、所在栏
    | { kind: "assistant"; work_id: string }         // 助理对话里的一项工作
    | { kind: "under-cover" };                       // 平台界面或外层文档里的普通链接：回去就是关掉覆盖层
  need:                       // 去补什么；「好了」只按它向主人读（2.5、3.4）
    | { kind: "model" }                              // 有一个能跑的文字模型（模型目录的 health）
    | { kind: "connection"; service_id: string; slot?: { slot_id: string; record_key?: string } }
    | { kind: "setup"; authorization_id: string }    // 一次接入授权到了 connected；只由平台界面明确给出
    | { kind: "none" };                              // 只回来，不判断，永远不自动关
  met_at_open: boolean;       // 打开时需要是否已经满足；已满足的不自动回去（3.2）
  carry?: { draft_key?: string; step?: string; object?: { kind: string; id: string } };  // 插件给的名字，原样交还
  cover: string;              // 打开的设置位置（noteCover 记的那一项），刷新后据它重新接上
  opened_at: number; expires_at: number;
  outcome?: { status: "ready" | "not_ready"; at: number };   // 已结算、等认领
}
```

- **草稿引用**是 `carry.draft_key`：插件自己 `host.drafts` 里的键（≤256 字符，同 `UiPageDrafts` 的键长），外壳不去读它；草稿正文从不进回程。
- **在等的工作**：插件的是 `carry.step`（≤128 字符，`[A-Za-z0-9._:-]`，插件自己起名，如 `send:<幂等键>`）；助理的就是已登记的 `molis.connector-setup@1` 等待，回程只记 `work_id` 和授权号，不另记一份等待。
- **选中对象**是 `carry.object`：`kind` 只原样交还给插件，外壳不用；外壳要把人带回那条记录时，只用 `from.surface` 加 `object.id` 拼对象链接（2.3）。
- **来处只记本次挂上的随机号，不记页面授权号**：页面授权号（`parent.ts:106` 取得、`:159` 当 `x-molis-plugin-page` 头）是凭据一样的东西，而且每次挂上都换新的；重建以后按 `scope` 加 `surface` 认领就够了（2.4）。
- 合同里不出现地址：回程**没有任何 URL 字段**，回去的位置由外壳从 `from` 算出（2.3）。

### 2.2 谁存、存在哪、存多久、谁能读，属于哪个窗口

| 问题 | 提案 | 理由 |
| --- | --- | --- |
| 谁存 | **只有一个写入方**：外层文档里的新页面状态主人 `settings-return`（新文件 `apps/workbench/src/scripts/client/settings-return.ts`；形状检查与窗口号放 `apps/workbench/src/browser/return-trips.ts`，只供主人用）。框架宿主、窗格文档、助理、设置页都不直接读写存储，一律经页面事件（2.6）；窗格文档里的这个模块不装（嵌入时什么都不做） | 回程里记的是栏、标签、挂载这些**浏览器里的布局事实**，主人本来就在外壳；放到宿主就是给浏览器布局在宿主里另记一份。只有一个写入方，「交出即删」和「留给重建后认领」才不会互相打架。`settings-directory.ts` 已经 463 行，不往里加 |
| 存在哪 | 这个标签页的 `sessionStorage`，键 `molis-work:return-trips`（按项目分开）与 `molis-work:return-window`（窗口号）（第 11.1 节 U3 的推荐 A） | 刷新还在；插件框的存储转存一律加 `molis-plugin-page:<scope>:` 前缀（`parent.ts:250-253`），碰不到这两个键 |
| 属于哪个窗口 | 每个窗口在 `sessionStorage` 里记一个随机的窗口号，回程带上它。窗口号会随会话存储一起被复制（带 opener 打开的标签页、浏览器的「复制标签页」、会话恢复），所以窗口启动时先问一声：经同源 `BroadcastChannel('molis-work:return-window')` 发出自己的窗口号，另一个还活着的窗口答「这是我的」，这个窗口就是复制出来的——换一个新窗口号，把复制来的回程从自己的存储里删掉。问出结果之前（至多 300 ms）不结算、不认领、不出返回条。原窗口自己刷新时，它在刷新中没人答，窗口号照旧 | 只靠存储里的随机号挡不住复制；问一声就分得清「我刷新了」和「我是被复制出来的」 |
| 回调落地页 | 从不结算：开机地址是授权回调带回来的（`connected`、`connection_error`、`setup` 由宿主重定向而来，`?settingsPath=` 开机、`fromPage=false`）的文档，不结算、不认领、不出返回条，哪怕窗口号碰巧对得上 | 双保险：落地页在弹出的标签页里，本来就不是人等着的那个窗口 |
| 存多久 | 开着的 24 小时；已结算、等认领的 1 小时；认领即删；每个项目最多 8 张，同一来处再开一张就替换旧的。形状不对、`v` 不是 1 的整张丢掉，不兼容、不迁移 | 回程只是便利：丢了不丢任何事实，草稿和配置都在各自主人那里。数字由统筹定（C1） |
| 谁能读 | 只有主人。插件页拿不到回程本身，只认领交给它的那一份结果（2.4），而且只在它是来处时 | 插件框是不透明来源，只经可信父页附加的页面身份说话（S-47 的前提），存储转存有前缀 |
| 同一用户同一项目 | `project` 取自工作台页面自己；认领时按宿主给的 `storage_scope`（`install:project`）、Manifest 身份与界面比对，都对上才交；本机只有一个人，回程在这个人的这个窗口里 | 可信身份从调用上下文来：`storage_scope` 是宿主按实际激活、安装、项目与本人发的，页面给不出、改不了 |
| 关掉应用再打开 | 回程不在了（`sessionStorage` 随窗口结束）；草稿（`host.drafts`）与新配置都在，来处读回事实就能接着用，只是不自动做那一步 | U3：若用户要重开后也问一句「接着做」，改存 `localStorage`，窗口归属照上面的做法，见那里的方案 B |

### 2.3 来处只由外壳写下；回去只到工作台内部

- **插件框**：页面只交「需要什么」「交还什么」（`need`、`carry`）。`from` 由框架宿主（`parent.ts`）填：`mount` 是它本次挂上时生成的随机号，`scope` 取自宿主给的 `grant.storage_scope`，`plugin` 取自 `pack.plugin_id`，`surface` 取自根元素；不读页面消息里的任何身份字段。看不见的页面（`parent.ts` 的 `visible()` 为假）调 `go()` 直接拒绝，不盖上设置。
- **窗格文档里的插件框**：窗格的框架宿主经 `workbench-open-settings` 交给外层（S-30 只认那个窗格框自己的窗口）；外层（`tab-workspace.ts:487-490`）把 `need`、`carry`、`from` 原样转进 `open-settings-path`，但 **`from.pane` 由外层按 `frame.dataset.paneOwner` 填**，不信窗格发来的值。窗格文档里拦下的普通 `/settings` 链接（`tab-workspace.ts:64-71`）同样带上外层能认的最少信息（只有 `href`，来处按窗格算 `under-cover` 加 `pane`）。
- **平台界面**：助理按它此刻显示的工作填 `work_id`，并明确给出 `need`（「继续接入」给 `setup`）；提醒和其他平台界面里的普通链接是 `under-cover`。
- **外层文档里的同源代码**（含 Alchemist、创作台两个构建期例外）能直接发带任意 `from`、`carry` 的 `open-settings-path`。这不是新的口子：它们本来就能读写所有 `molis-plugin-page:` 存储与控制令牌。`S-return-trip-source` 只守插件框与窗格转发，本节写明这一点。
- **普通链接**（第 2.4 节第三种）：外壳的链接处理按链接所在的可信文档位置算来处，`need` 按地址查一张封闭的表（要用户定的产品行为，并在 U1 里问）：`/settings/models` → `model`；连接页带 `connector=<id>` → `connection`；其余 → `none`。`setup=<授权号>` **不从链接推断**（链接是页面写的），只认助理和平台界面明确给的；`none` 永远不自动关；设置里面的链接（`inSettingsShell`）不开新回程，也不替换已有的。
- **回去的位置只在工作台内部**：外壳从 `from` 算——来处还在覆盖层下面就只关覆盖层（沿用 `closeCover` 的历史语义：它在「关掉就是后退一步」时会把历史退一步，`tab-workspace-places.ts:131`）；来处在别的栏、右侧或已经不在，就走工作台已有的对象链接入口（`?openPlugin=<界面>&openItem=<对象>`，框架宿主的 `navigate` 与深链接同一条，07-S2 合入后它经召回落到已开的那一份）；助理就发已登记的 `molis:assistant-open { work_id }`。界面名按现有格式 `^[a-z][a-z0-9-]{0,100}$` 检查；对象 id 现在 `navigate` 不检查（`parent.ts:66` 的正则只看 `openPlugin`），本项给它定：不超过 256 个字符、不含控制字符，拼链接时一律 `encodeURIComponent`，所以 `?`、`#`、`&` 带不出多余参数；R1a 开工前先把各搜索来源现有的对象 id 形状列一遍，确认都放得进。不合的整张丢掉、不导航。
- **地址里不放回程号**：回程跟着覆盖层走（主人内存加 `cover` 字段），刷新后按 `cover` 接上，不需要在任何地址里带 `return=`；设置地址的过滤表（`settings-address-params.ts`）不加参数。OAuth 回调的去向不变，由宿主按授权记录算，从不读回程。这样就没有开放跳转的入口：没有一个字段能写进外部地址，也没有一个地址参数能指定回到哪里。

### 2.4 三种发起方式：为什么是页面宿主方法加页面事件，不是动作

**一、插件页面：页面宿主方法 `host.returns`**（改 `packages/contracts/src/platform/ui.ts` 的 `UiPluginClientHost`，SDK 只再导出类型名）：

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
   * refused or returns are unavailable. Rejects with an `AbortError` when `signal` aborts, the person changes the view or the page
   * closes: the trip then ends as `not_ready`, and a setting finished after that stays with its owner and is never handed to this
   * page or to its next mount (the user's 2026-11-06 rule for the connection card).
   */
  go(need: UiReturnNeed, carry?: UiReturnCarry, options?: { signal?: AbortSignal }): Promise<UiReturnOutcome>;
  /**
   * Once per mount: the outcome that settled for this page while it was being rebuilt without the person choosing it (a reload,
   * the plugin restarting); afterwards `null`. A page the person left gets nothing here.
   */
  arrived(): Promise<UiReturnOutcome | null>;
}
// UiPluginClientHost 加一行：readonly returns: UiPageReturns;
```

插件拿到 `ready` 后的规矩照④c 第 1 项（用户 11-06 定），写进插件开发 Skill：先自己再读一次（如 `services.model.availability()`），只把 `step` 那一件做一次，用原来那一步的幂等键；本来要确认的照原样再问，原来没有的不新加；写之前照旧 `beforeEffect()`。拿到 `not_ready` 什么都不做，页面照常显示「没有模型」。

**人自己离开与没选择离开，分开处理**（对齐④c 第 3 项「卡收起之后才登录完的，不再接回去，只留下连接」）：

| 来处页面怎么没了 | 回程 | `arrived()` |
| --- | --- | --- |
| 人选择的：页面的 `signal` 中止、人换了视图、关了标签或窗格、插件被停用或卸载、页面授权撤了 | 框架宿主在结束时发认领请求带 `drop`，主人按 `not_ready` 结掉并删除；之后配好的设置只留在主人那里 | 没有 |
| 人没选择的：整页刷新、浏览器崩溃恢复、插件重启后视图被宿主重建（同一安装） | 留着；配好后照常结算为 `ready` 或 `not_ready`，等认领 | 新挂上的页面按 `scope` 加 `surface` 认领一次 |

框架宿主按它已有的结束原因区分这两类（页面关闭的 `closing`、视图失效的 `invalidated`、文档卸载不跑清理），R1b 在 `parent.ts` 里把这层分清写进代码与测试。

**二、平台界面：扩一条已登记的请求、加三条**（第 2.6 节）。助理、原处连接卡、提醒在外层文档里，直接经 `molis-work:open-settings-path` 带上 `need` 与来处。

**三、普通链接：不改任何消费者**。插件框里、平台界面里、外层文档里所有指向 `/settings/…` 的普通链接，外壳照样打开设置，同时按 2.3 的表开一张回程（`carry` 为空，不交结果给页面）。这样 Jelly、Dataset、Form、PPT、Schedule、Shelf 和 Alchemist 一行不改也能回到原处；要「接着做那一步」的才改用 `host.returns.go`。`docs/platform/PROLOGUE-AI.md` 与 `skills/molis-prologue-ai/SKILL.md` 步骤 6「入口都是普通链接，页面不为某个入口单写返回逻辑」那句仍然成立，补一句「要回来接着做哪一步时用 `host.returns.go`」。

**为什么不是动作**（与④c 统筹 11-06 对 `connectionNeed` 的理由相同）：「能力注册一次」管的是供页面、工作流、Agent、MCP 用的能力；回程是界面的挂法，离开页面没有意义，动作也没有「位置」可言。Agent、MCP 要配置已有 `connectors.setup.prepare@1` 加等待；回程判断「好了」时读的仍是已注册的动作背后的设置路由（3.4），不新加动作，也不进动作合同快照。

**为什么不只靠一条宣告**：`molis-work:model-ready` 是广播，谁显示过「没有模型」谁重读；回程是点对点的，只交给来处那一页，还要带回它当初说的一步，并且要有认领才知道交到了。两者分开，见 2.5。

### 2.5 与 `molis-work:model-ready`、覆盖层关闭和连接的返回怎样统一

- **回程管回去，`molis-work:model-ready` 只管重读**。`settings-directory.ts` 里 `sentFromPage` 这段（「从页面来的先关覆盖层、提示，再发事件」）挪进回程：覆盖层若有开着的回程，先按回程结算（关覆盖层、提示），再发 `molis-work:model-ready`，顺序与现在登记的一致。事件的名字、载荷（无）、发的时机（第一个能跑的模型）都不变，只改登记里说明「谁先关覆盖层」的那一句。
- **换模型、修好模型、第二个供应商**：不再需要这条事件去带人回来，回程按需要读事实（有能跑的文字模型）就结算；打开时已经有模型的（`met_at_open: true`）不自动回去，只留返回条（3.2）。是否让 `model-ready` 在「模型从不能用变成能用」的每一次都发，是另一件事，本项不改。
- **人自己关掉设置**：新登记一条宣告 `molis-work:cover-closed { kind }`（主人 `tab-workspace`），覆盖层从有到无的那一次发一次——不论是 `closeCover`、标题栏、Esc、Dock 还是历史让它没的。回程主人听到 `settings` 或 `project-settings` 关了、而不是自己关的，就读一次事实再结算（3.2）。改动只在一处：`tab-workspace-panes.ts` 的 `apply()` 记下上一次画出的覆盖层，在「没有覆盖层」那一支（`root.removeAttribute("data-exclusive")` 之后）发现上一次有，就发这条（第 10 节写明与 S2 的交界）。
- **连接**：连接页和原处连接卡都不另发「连好了」的页面事件。§13.5 第三节第 6 条草拟的 `molis-work:connection-settled` **不再需要**：连接页要随卡刷新的情况由同一个回程模块结算，不加这条。
- **OAuth 回调**：去向照旧由宿主按授权记录算；Onboarding 的 `OAuthReturn` 是引导记录自己的事实，保留不动。设置里发起的登录，原窗口靠已有的授权监视（连接页每 2 秒、页面可见时）得知 `connected`，交给回程结算；回调落地的那一页从不结算（2.2），只把文案改成「已连上。回到 Molis Work 的窗口，刚才的事会接着做；这一页可以关掉。」（13⑤ 那一片）。
- **跨标签页的 `BroadcastChannel('molis-work:model-ready')`**：独立的清理项，不随本项删。现在仍然有人发（模型设置脚本 `settings-models.ts:13`）也有人听（引导页 `context-onboarding.ts:776-781`），只服务「引导开着时，人在另一个标签页的设置里配好了模型」这一种情况；留不留由统筹定（C7）。过时的两处说明（`docs/platform/PROLOGUE-AI.md:204`、`dom-events.ts:262` 里「开始使用页在新标签打开设置」）随 R0 改成现状。

### 2.6 对登记与快照的影响

| 东西 | 改动 | 哪一片 |
| --- | --- | --- |
| `packages/contracts/src/platform/ui.ts` | 加 `UiReturnNeed`、`UiReturnCarry`、`UiReturnOutcome`、`UiPageReturns`；`UiPluginClientHost` 加 `returns`。`pnpm api:update` 刷新 contracts 的 `platform/ui` 快照与插件 SDK 快照 | R0 |
| `packages/plugin-sdk` | 只再导出上面几个类型名，不加运行代码 | R0 |
| `apps/workbench/src/browser/plugin-frame/child.ts` | `returns.go` 与 `returns.arrived` 先给固定的拒绝（「暂不可用」）占位，和④c C1 同一做法 | R0 |
| 过时说明 | `docs/platform/PROLOGUE-AI.md:204` 与 `dom-events.ts:262`（`model-ready` 的 summary）改成 Onboarding 的现状；只改文字，`pnpm api:update` 刷新 dom-events 快照 | R0 |
| `packages/contracts/src/platform/dom-events.ts`（新条目与发它的代码同一个改动登记） | ① `molis-work:open-settings-path`（请求，主人 `settings-directory`）载荷从 `{ href }` 扩成 `{ href, return_id?, need?, from?, carry? }`，`return_id` 由插件框的框架宿主自己生成，别的发送者不填，由主人生成。② 新增宣告 `molis-work:cover-closed { kind }`（主人 `tab-workspace`）。③ `molis-work:model-ready` 的说明改「谁先关覆盖层」那一句 | R1a |
| 同上 | ④ 新增请求 `molis-work:return-claim`（主人 `settings-return`，`on: "document"`）：载荷 `{ return_id? , scope?, surface?, drop?, answer? }`，主人同步处理并回填 `answer`（`{ status, carry }` 或 `null`），认领即删；`drop: true` 按 `not_ready` 结掉删除。写法照已有的回填先例（`molis-work:plugins-changed` 让监听者回填、`dom-events.ts:334` 在载荷里带回调）。⑤ 新增宣告 `molis-work:return-settled { return_id, status }`（主人 `settings-return`），发在外层文档与各窗格框架文档，只为提醒「去认领」，本身不交结果 | R1b |
| 跨标签通道 | 新增 `BroadcastChannel('molis-work:return-window')`（只传窗口号，不传回程），记进 `docs/platform/UI-PLATFORM.md` 的跨标签通道一节与 `dom-events.ts` 开头「不在范围内」那段的通道名单 | R1a |
| 动作合同快照 `tooling/gates/actions/` | 不变：不加动作、不改动作的 schema | — |
| `apps/workbench/src/settings-address-params.ts` | 不变：地址里不带回程号 | — |
| 框架与外壳之间的 MessagePort 消息（`types.ts` 的 `FrameUp`／`FrameDown`） | 加 `return-go`、`return-arrived`、`return-result` 三种；不在页面事件登记的范围里 | R1b |
| 安全不变量 | 新增三条，见第 5 节 | R1a（destination）、R1b（source、delivery） |
| 页面资源 | 按任务许可文件写（`tooling/gates/page-asset-allowances/12-draft-and-return-r1a.json`、`…-r1b.json`，格式见 `docs/cli-and-development.md`「页面资源体积」）；`workbench.js` 预计几 KB、`plugin-frame.js` 约 1 KB，以实测为准；单项一次超过 10 KB 先问用户。**不改 `tooling/gates/page-assets.json`**：它是枢纽文件，07-S1、S2 都在改 | R1a、R1b |

### 2.7 否掉的做法

| 做法 | 为什么不用 |
| --- | --- |
| 宿主里建一张回程表（新的 horizontal 包、库表、动作或路由） | 记的是浏览器布局事实，放宿主是给布局另记一份；要升库版本、写升级步骤、加清理与授权路由，换来的只是「关掉应用再开还在」，而那时草稿和配置本来就在。用户若在 U3 选 C，再按这条做 |
| 回程存 `localStorage` | 所有标签页共用，OAuth 回调落地的那一整份工作台也会看到；只在 U3 选 B 时采用，窗口归属照 2.2 |
| 只靠 `sessionStorage` 里的随机窗口号认窗口 | 带 opener 打开的标签页、复制标签页会连号一起复制过去；要启动时问一声才分得清（2.2） |
| 框架宿主与主人共用存储代码、各自读写 | 两个写入方，「交出即删」与「留给重建后认领」会打架（评审 B4）；改成只经认领请求 |
| 返回地址放进设置地址（`?return=/projects/…`） | 开放跳转的来源；地址里的位置会和工作区状态各说各的 |
| 只扩 `molis-work:model-ready`，带上来处与步骤 | 广播会让所有页面都拿到别人的步骤；连接、接入授权也要一条，事件越扩越杂 |
| 把每个「打开设置」改成插件自己的对话框 | PF-A07 明写不能只把链接改成弹窗；设置会分成很多份 |
| 平台重放插件那一步 | 平台不知道那一步现在还该不该做；④c 第 1 项已定由插件按幂等键自己做 |
| 用 MutationObserver 看设置的界面藏没藏起来，代替覆盖层关闭的宣告 | 读别的主人的 DOM 状态，正是页面事件规则要收掉的写法 |

## 3. 调用链

### 3.1 主路径（插件页缺模型，`host.returns.go`）

1. **发起**：Coding 的输入框，人按发送，Coding 发现没有能跑的模型（`services.model.availability()`），把输入存进自己的 `host.drafts`（键 `composer:<会话>`），调 `host.returns.go({ kind: "model" }, { draft_key: "composer:<会话>", step: "send:<幂等键>" }, { signal })`。
2. **框架宿主**收到 `return-go`：页面看不见就拒；检查 `carry`（长度、字符）；生成 `return_id`，按 2.3 填 `from`，发 `molis-work:open-settings-path { href: "/settings/models", return_id, need, from, carry }`（在窗格文档里则经窗格转发，外层补 `from.pane`）。
3. **外壳**（`settings-directory` 打开设置，调回程主人）：向模型设置主人读一次当前是否已有能跑的模型，记下 `met_at_open`；写回程（带本窗口号）；设置盖上来，设置顶上出返回条「从 Coding 来 · 配好后自动回去 · 现在回去」（定样 U4）。
4. **在设置里**：人填好、保存；模型设置页报告保存结果（现在给 `ready` 回调的那一处，`settings-directory.ts` 的 `bindEmbed`）。
5. **读回事实**：回程主人再向主人读一次「有没有能跑的文字模型」。有：结算为 `ready`；没有：留在设置，返回条照旧。
6. **回去**：覆盖层还显示着回程打开的那一处时，先关覆盖层、提示「模型已连接，回到 Coding 接着做」（现有 toast），再按 2.5 发 `molis-work:model-ready`；人在设置里已经走到别的页（比如去看了外观），不关，返回条改成「已经好了 · 回去」。
7. **来处不在眼前时**：来处页面在别的栏、右侧，或者页面已经重建，用 2.3 的对象链接入口回到它；页面已经关了且没有 `object`，只关覆盖层，提示「原来的页面已经关了，配好的设置都在」。
8. **认领**：回程主人发 `molis-work:return-settled { return_id, status }`；那一页的框架宿主认出自己的 `return_id`，同步发 `molis-work:return-claim { return_id }`（窗格文档里的框架宿主发在 `window.top.document` 上，同源、同步），主人比对来处、回填 `answer`、删除回程；框架宿主经 MessagePort 交 `return-result`，`go()` 答 `{ status: "ready", carry }`。没人认领的（页面正在重建）留着，等新挂上的页面用 `arrived()` 认领（2.4 的表）。
9. **只接着做那一步**：Coding 自己再读一次模型是否可用，取回草稿，按 `send:<幂等键>` 发送一次（U1 定下的规则），原来有的确认照问。

### 3.2 成功、失败、取消、人自己关、人自己离开

| 情况 | 设置里 | 回程 | 来处拿到 |
| --- | --- | --- | --- |
| 配好（需要从没有变成有） | 自动关覆盖层、提示 | `ready`，认领即删 | `ready` 带 `carry` |
| 打开时就已满足（`met_at_open: true`，比如已有模型还点了「打开模型设置」） | 不自动关，返回条写「回去」 | 人回去时读一次 | `ready` |
| 需要是 `none`（地址里看不出要补什么） | 永远不自动关，返回条写「回去」 | 人回去时结算，不读事实 | 普通链接不交结果 |
| 出错（密钥被拒、登录失败、限流、检查没通过） | 留在设置，错误就地写，填的还在（#1903 的先查后存）；返回条照旧 | 不结算 | 还在等 |
| 人点「现在回去」 | 关覆盖层 | 读一次：满足就 `ready`，不满足 `not_ready` | 对应结果；`not_ready` 时什么都不重做 |
| 人自己关设置（Esc、返回、标题栏、Dock、历史） | 关；回程主人经 `molis-work:cover-closed` 得知 | 同上，读一次再结算 | 同上 |
| 登录中途取消（连接页「取消这次接入」） | 连接页照 §4.6.1 处理 | 不结算，人回去时读一次 | 多半 `not_ready` |
| 人离开了来处（中止、换视图、关页、插件停用或卸载、页面授权撤了） | 设置照常 | 按 `not_ready` 结掉删除；之后配好的只留在设置的主人那里 | 什么都拿不到，下次挂上也拿不到 |
| 来处在人没选择时重建（刷新、插件重启） | 设置照常 | 留着，配好后照常结算 | 新挂上的页面 `arrived()` 认领一次 |
| 从齿轮、菜单、地址进来 | 没有返回条，不自动关 | 不开回程 | — |

### 3.3 刷新、重开、弹出的标签页与系统浏览器

- **在设置里刷新**：覆盖层按 `noteCover` 重开，回程主人问过窗口号后，按 `cover` 找到本窗口、本项目开着的回程，返回条重新出现；来处页面也重建了，3.1 第 8 步没人认领，结果留着，等它挂上后 `arrived()` 认领一次（第二次为 `null`）。刷新后认领到「已经好了」的页面是「接着做」还是「问一句」，按 U2。
- **在来处刷新（设置没开）**：开着的回程没有覆盖层可接，主人启动时读一次事实结算（满足就留给 `arrived()`，不满足就删）。
- **关掉应用再打开**：按 U3 的推荐 A，回程不在了；草稿在 `host.drafts`，配置在主人那里，来处读回事实显示可用，人自己再点一次。
- **在弹出的标签页里登录**：设置页 `window.open('', '_blank')` 打开的标签页带着复制来的 `sessionStorage`，连窗口号也一样；它启动时一问，原窗口答「这是我的」，它就换号、删掉复制来的回程；它最后落在回调落地页，按 2.2 也从不结算。原窗口的连接页靠授权监视得知完成，按 3.1 第 5 步起结算。浏览器的「复制标签页」同理。
- **桌面壳里在系统浏览器登录**：系统浏览器是另一份存储，看不到回程；回调落地页只改文案（2.5）。原窗口照上一条结算。
- **窗格文档**：嵌在工作台里的窗格页与外层共用一个 `sessionStorage`，但不写它；结算与覆盖层只在外层文档，窗格里的框架宿主在外层文档上认领（3.1 第 8 步），`molis-work:return-settled` 像现在的 `model-ready` 一样发进各窗格框架文档。

### 3.4 一次操作发几个请求（开工前检查第 9 项）

判断「好了」读的是外壳已经在用的设置路由，以本人身份：模型 → `/api/settings/models`（`health` 里有 `ready`）；连接 → 连接页的 `/api/settings/connectors/connections?service_id=…`（背后是 `connectors.connections.read@1`）；接入授权 → 连接页现在用的 `/api/settings/connectors/authorizations/<授权号>`（`connectors-settings.ts:62` 的 `api` 加 `:208` 的读法），不经 `connectors.authorization.read@1` 的动作网关，因为那个动作只认发起它的人、项目与运行会话（S-37）；带槽的连接（原处连接卡）→ C2 的 `read`，只在来处页面还活着时，用它的页面授权。

| 动作 | 请求 |
| --- | --- |
| 窗口启动时问窗口号 | 0 个 HTTP 请求（只有一次同源 `BroadcastChannel` 消息） |
| 发起（写回程、打开设置） | 读一次需要（模型 1 次、连接 1 次、接入授权 1 次；`none` 0 次）；设置页自己的加载照旧 |
| 设置里保存后 | 读一次需要；模型设置的保存响应已带 `health` 时直接用，不再请求 |
| 人回去、人自己关设置 | 读一次需要（`none` 0 次） |
| 回去、认领 | 0（关覆盖层、发事件都是本地）；来处插件自己再读一次可用性，算插件自己的 |
| 刷新、启动时有开着的回程 | 每张 1 次，至多 8 次 |
| 设置隐藏或标签页在后台 | 0：不轮询；只有连接页已有的授权监视照旧（可见时 2 秒一次） |

## 4. 消费者接入清单

「片」见第 8 节。「不改」的，靠 2.4 第三种（普通链接）自动得到回到原处，不交结果给页面。

| 消费者 | 现在 | 要改什么 | 片 |
| --- | --- | --- | --- |
| **模型设置**（落点） | 第一个模型保存时 `sentFromPage` 关覆盖层 | 保存结果交给回程主人结算；`sentFromPage` 删掉；顶上出返回条 | R1a（结算）、R2（返回条） |
| **服务连接页**（落点） | 回调写「请回到原来的应用窗口继续」；「连好以后」往前走的链接 | 授权监视得知完成、保存密钥通过后交回程结算；有回程时「连好以后」那段让位给返回条；回调落地页改文案、从不结算；`setup` 需要按 3.4 的路由读 | R4（13⑤） |
| **助理对话**（来处） | 「继续接入」去连接页，工作会续，人不回 | 「继续接入」以 `from: assistant`、`need: setup` 开回程；连好后关覆盖层并 `molis:assistant-open { work_id }`，在等的工作照 §4.7 只续一次（宿主一侧不改）；④c-2 之后多数情况在原处出卡，链接只剩卡画不出的情况 | R4（13⑤） |
| **连接提醒**（来处） | 去设置，不回 | 普通链接即可（`under-cover`），提醒照原规则消掉；不改提醒合同 | R4（只验收） |
| **原处连接卡的「还不能一键连接」**（来处） | 卡里给去连接页的入口，离开原处 | 卡以来处页面开回程（`need: connection` 带槽），回来后卡用 C2 的 `read` 再读一次，接着它自己的流程 | R4，排在④c-2 之后 |
| **Feed** | `connectorSettingsHref` 链到连接页，回来靠人 | ④c-2 改成原处连接卡；剩下「还不能一键连接」走上一行；`connectorSettingsHref` 若还留着，普通链接按 `connection` 推断，自动回来 | 随④c-2，本项只验收 |
| **Images** | 自己的 `resumeConnection` | 缺的是图像服务，不在 `UiReturnNeed` 里，**不用 `host.returns.go`**：④c-2 的卡取代缺密钥那一处后删 `resumeConnection`；对话框里若还留去设置的链接，保留普通链接（地址推断为 `none`，只回来、不判断） | 随④c-2 |
| **Cognia** | 「模型设置」普通链接 + 听 `model-ready` 重读 | 缺模型挡住的那一问改用 `host.returns.go`，`step` 记那一问，草稿放 `host.drafts`；`model-ready` 监听保留 | R3 |
| **工作流程** | 连接浮层「打开模型设置」普通链接；`ui.returnTo` 是自己的返回 | 改用 `host.returns.go`，`carry.object` 是这条流程、`step` 记连接序号；回来重开那个浮层、重读可不可以交接；`returnTo` 不动 | R3 |
| **Coding** | `data-coding-model-setup` 与设置页的模型链接；输入草稿在转存的 `sessionStorage` | 缺模型挡住的发送改用 `host.returns.go`（3.1 的例子），草稿改存 `host.drafts` 才能过「重开后继续」；工作目录（「角色执行另选工作目录」）第一版不在 `UiReturnNeed` 里，走普通链接 | R3 |
| **Onboarding** | 已经就地连模型（#1310）；Gmail OAuth 有自己的回程 | **不改**。跨标签的 `BroadcastChannel` 是独立清理项（C7） | 不改 |
| **独立 Home 的模型设置对话框**（没有项目的 Home 页面） | `open-settings-path` 的第二个监听者 | 第一版**忽略新字段**，照现在打开对话框，不开回程、不出返回条；这些页面没有插件框与工作区，没有「原处」要回 | R1a（只确认忽略） |
| **Alchemist**（构建期例外） | 客户端在外层文档；链接由 `settings-directory.ts:414-433` 的点击处理接住；听 `model-ready` | **只写边界，不改代码**：那段点击处理开普通链接的回程（来处按链接所在文档位置算），自动回到原处；不用 `host.returns`，`step` 那一半等 BL-377 重做时接 | 不改 |
| **插件创作台**（构建期例外） | 网页里直接在外层文档发 `open-settings-path`；桌面壳里用 `molisWorkOpenExternalUrl` 交给系统浏览器（`agent-studio.ts:525`） | **不改代码**：网页里按 `under-cover` 开回程，关覆盖层就回到原处；桌面壳里设置在系统浏览器打开，回不来，是已知缺口，留给 BL-377 | 不改 |
| Jelly、Dataset、Form、PPT、Schedule、Shelf | 普通链接 + 听 `model-ready` | 不改；要接着做某一步时再各自改用 `host.returns.go` | 不改 |

## 5. 安全不变量提案

格式照 [安全不变量记录](../../docs/system/security-invariants/README.md)：每条一个 `S-<语义名>.md`，一行五列；下面是拟写的「不变量（拒绝什么）」与测试计划，代码位置随实现填。能在 Linux 上稳定跑的检查（`return-go` 的字段检查、`return-trips.ts` 的形状与窗口归属、位置计算、认领比对）写成单元测试放进 `test:security`（CI 里跑）；要真实浏览器的另写浏览器用例，只在本机跑并写明原因。

| ID | 拒绝什么 | 断言「拒绝」的测试（计划） |
| --- | --- | --- |
| `S-return-trip-source` | 插件框与窗格转发写不出别人的来处：框架宿主按自己持有的挂载随机号、宿主给的 `storage_scope`、Manifest 身份与根元素填 `from`；页面经 MessagePort 发来的 `return-go` 只许 `need` 与 `carry`，多一个字段（来处、安装、项目、界面、栏、地址）整条拒绝、不打开设置；`carry` 超长、字符不合、`need.kind` 不在封闭集合里同样拒绝；看不见的页面调 `go()` 拒绝；窗格转发只认那个窗格框自己的窗口（S-30），`from.pane` 由外层按 `frame.dataset.paneOwner` 填；插件框的存储转存碰不到 `molis-work:return-trips`、`molis-work:return-window`（键一律加前缀）。外层文档里的同源代码不在本条守的范围（2.3） | 单元（`tests/security-invariants-return-trips.test.ts`，CI）：① `return-go` 带 `from`、`project`、`scope` 等多余字段，拒；② `carry.step` 129 字符、含 `/`、`<`，`draft_key` 257 字符，`object.id` 257 字符或含控制字符，`need: { kind: "connection" }`，都拒。浏览器（`tests/security-invariants-return-trips.e2e.test.ts`，本机）：③ 页面经存储转存写 `../molis-work:return-trips` 与同名键，外壳的键不变；④ 别的窗格或不是框的窗口发 `workbench-open-settings` 带来处，丢掉；窗格自称别的 `pane`，外层改成它真实的那一栏；⑤ 页面藏起来时调 `go()`，设置不开 |
| `S-return-trip-destination` | 回去只到工作台内部：回程没有 URL 字段，位置只由外壳从 `from` 算（关覆盖层、已登记的对象链接入口、`molis:assistant-open`）；界面名不合 `^[a-z][a-z0-9-]{0,100}$`、对象 id 超长或含控制字符的整张回程丢掉、不导航，合格的 id 一律编码后拼进链接；存储里被改成带地址、带 `javascript:`、带外部 origin 的回程按形状检查丢掉；地址里不认 `return=`；OAuth 回调的去向从不读回程 | 单元（CI）：⑥ `from.surface` 为 `../x`、`https://evil.example`，丢掉且不导航；⑦ `object.id` 为 `a?x=1#y&openPlugin=evil`，拼出的链接里只有一个 `openPlugin`、一个 `openItem`；⑧ 多出 `href`、`url` 字段、`v: 2`、缺字段，整张丢掉。浏览器（本机）：⑨ 设置地址带 `return=https://evil.example`、`return=<别的项目的回程号>`，设置照常、不回去、不跳转 |
| `S-return-trip-delivery` | 结果只交给来处、只交一次、只在这个窗口：认领时安装（`storage_scope`）、插件、界面、项目都对上才回填，认领即删；窗口号对不上的回程只读、不结算、不认领、不出返回条；被复制出来的窗口（带 opener 打开的标签页、复制标签页）启动时换号并删掉复制来的回程；回调落地页从不结算；人离开来处后回程按 `not_ready` 删除，晚到的配置不交给这个页面或它下一次挂上；`ready` 只在主人读回需要之后才给，设置页一句「保存了」、页面自己发的消息、别的回程的结算都不算；回程里不存草稿正文、密钥、地址的查询串 | 单元（CI）：⑩ 两次认领同一回程，第二次 `answer` 为 `null`；⑪ `storage_scope` 或界面不同的认领，`null` 且回程还在；⑫ 窗口号不同的主人实例对回程什么都不做；⑬ `drop` 之后再结算，没有可认领的。浏览器（本机）：⑭ 设置页用 `window.open('', '_blank')` 打开的标签页带着复制来的存储与窗口号，启动后换号、删掉复制来的回程，原窗口的回程不变，它落在回调地址后不结算、不出返回条；⑮ 同一插件两个安装（或两个项目）各开一页，A 的回程结算后 B 的 `arrived()` 为 `null`；⑯ 人在设置里时关掉来处标签，再配好模型，来处重开后 `arrived()` 为 `null`；⑰ 让模型设置路由返回保存成功但 `health` 不是 `ready`，回程不结算为 `ready`；⑱ 结算后读 `sessionStorage`，没有草稿正文与密钥字样 |

这三条都在外壳里，宿主没有新路由，所以没有宿主一侧的拒绝测试；判断「好了」时用的读（3.4 的设置路由、C2 的 `read`）沿用它们已有的不变量（S-37、`S-plugin-connection-card` 等），不放宽。

## 6. 产品检查与开工前检查

### 6.1 产品检查（开发流程第 3 节）

- **从用户的结果倒推**：用户在原处按下一步 → 缺配置 → 进设置补上 → 自动回到原处 → 那一步接着做完。中断（出错、改主意、刷新、关掉应用）后，原处的输入都在、配置都在，最多再点一次。
- **每一步都要站得住**：返回条回答「我从哪来、配好会怎样」，不是新的确认；「现在回去」让人随时退出；人自己离开了来处，平台不在之后替他接着做（④c 第 3 项）。
- **已有的授权和选择接着用**：回程不带授权；插件那一步原有的确认照问，不新加。
- **AI**：不涉及模型调用；模型能力不影响回程。
- **归谁**：回程是平台能力（工作台外壳）；草稿、步骤的含义、在等的工作各归原主人。
- **别漏掉的路径**：齿轮进入、空状态（没有任何模型）、失败与恢复、第一次和第二次进入（`met_at_open`）、中英文、窄屏的返回条（R2 定样）。

### 6.2 开工前检查（开发流程第 4 节）

| # | 回答 |
| --- | --- |
| 1 事实主人 | 新事实只有回程本身，主人是工作台外壳的 `settings-return`，唯一写入方；覆盖层开关仍归 `tab-workspace`（新宣告由它发）；模型可用归模型设置（宿主模型目录），连接与接入授权归连接主人，草稿归各插件或助理，引导记录归 Onboarding。回程只存引用，向主人读事实，不出现第二个主人 |
| 2 插件同等待遇 | `host.returns` 在所有插件共用的页面宿主上，不按插件名；普通链接的回程对所有插件一样；不加构建期接线；两个构建期例外不改代码，各按它们现有的入口得到回到原处（创作台在桌面壳里除外，第 4 节） |
| 3 能力注册 | 不加动作（2.4）；判断「好了」只读已有的设置路由；可信身份取自宿主给的 `storage_scope` 与页面授权；不涉及 `scheduling` |
| 4 合同 | 改 `platform/ui`（加类型与 `returns`）、`platform/dom-events`（扩一条、加四条、改两句说明）；M1 之前不留兼容期；合同先单开 R0（类型、拒绝占位、过时说明），页面事件与发它的代码同一个改动（R1a、R1b） |
| 5 放在哪个包 | `apps/workbench`（外壳）与 `packages/contracts`；不进宿主，不新建 horizontal 包（回程是浏览器布局的事实，2.2） |
| 6 表与存储 | 不加库表；浏览器 `sessionStorage` 两个键，主人 `settings-return`；一条同源跨标签通道只传窗口号 |
| 7 兼容与迁移 | 不加；形状不对的回程整张丢掉 |
| 8 安全边界 | 碰「地址与路径校验」（开放跳转）与插件页面的通道：新增三条不变量（第 5 节） |
| 9 调用次数 | 见 3.4：发起 1 次读、结算 1 次读、回去与认领 0 次；后台不轮询 |
| 10 升级与数据 | 不涉及库；回程不跨应用重开（U3 推荐 A），升级不影响 |
| 11 成果与过程项 | 不涉及：回程不是成果，也不交给别的插件 |
| 12 页面与外壳 | 插件不出整页，设置仍是外壳的覆盖层；新页面事件在 `dom-events.ts` 登记；页面资源按任务许可文件写明理由 |
| 13 错误 | 外壳一侧不加错误码；`go()` 的拒绝是固定文字（同 `connectionNeed`） |
| 14 冲突面 | **改到 07 的文件**：`apps/workbench/src/scripts/client/tab-workspace.ts` 的窗格转发两处（窗格文档拦 `/settings` 点击那段、外层转发 `workbench-open-settings` 那段），`tab-workspace-panes.ts` 的 `apply()` 加覆盖层关闭的宣告；与 S2 的具体交界见第 10 节，**R1a 先合，S2 变基**。**枢纽**：`dom-events.ts`、`apps/workbench/src/i18n/en.ts`（07-S1～S5 叠分支在改），`tooling/gates/page-assets.json` 不碰（用任务许可文件）。**④c-2**：与本项都改 `apps/workbench/src/browser/plugin-frame/` 下的 `parent.ts`（④c-2 换掉 `connectionNeed` 的转发、接卡；R1a 给普通链接补来处，R1b 加 `return-go` 与认领）、`child.ts`（④c-2 换掉 `connectionNeed` 占位；R0 加 `returns` 占位，R1b 换成实现）、`types.ts`（两边各加 MessagePort 消息）；两者串行：第 18 批 P3-1（[#1929][PR1929]，带 `framed-area.ts`、`over-frame.ts`，也改这三个文件）→ ④c-2 → R1a → R1b，R1 在④c-2 之上变基。不碰 `tab-workspace-ops.ts`、`tab-workspace-places.ts`、`immersive-shell.ts`、`plugin-frame/navigation.ts` |

## 7. 验收标准

1. **DRT-01** 从插件页面的普通链接进模型设置，配好第一个能跑的模型（需要从没有变成有）：覆盖层先关、回到来处、提示一句，之后才发 `molis-work:model-ready`；来处的输入、选中、滚动位置不变，页面没有重建。
2. **DRT-02** 从齿轮、菜单或地址直接进设置：不开回程、不出返回条、保存后不自动关。
3. **DRT-03** 打开时需要已经满足（已有模型还点了模型设置），或地址里看不出要补什么（`none`）：保存后不自动关，返回条写「回去」；点了回到来处。
4. **DRT-04** 设置里出错（密钥被拒、登录失败、限流、检查没通过）：留在设置，填的还在，返回条还在；人点「现在回去」，来处拿到 `not_ready`，什么都不重做。
5. **DRT-05** `host.returns.go` 带 `draft_key`、`step`：配好回来时 Promise 答 `ready` 并原样带回 `carry`；插件只把那一步做一次（同一幂等键），原有确认照问；`not_ready` 时不做。
6. **DRT-06** 在设置里刷新：覆盖层重开后返回条还在，配好后照 DRT-01 回去；来处页面重建后 `arrived()` 认领一次结果，第二次为 `null`。
7. **DRT-07** 来处在别的栏或右侧：回去时落到已开的那一份，不新开第二份（S2 之前按现有打开行为验，S2 合入后补测）；带 `object` 且来处页面已关时，打开到那条记录；没有 `object` 时只关覆盖层并说明。
8. **DRT-08** 来处的插件停用、卸载、页面授权撤了，或换了项目、换了安装：结果不交给别的安装、别的项目；设置照常关。
9. **DRT-09** 关掉应用再打开（U3 推荐 A 的口径）：来处的草稿与新配置都在，读回事实显示可用；那一步不自动做；没有残留的回程。
10. **DRT-10** 助理对话的「继续接入」进连接页并连好：回到那项工作；在等的工作只接着做一次（§4.7）；取消接入则回到工作、不重做。
11. **DRT-11** 连接提醒进设置并连好：关掉覆盖层回到原处，提醒按原规则消掉。
12. **DRT-12** 在弹出的标签页或系统浏览器里完成 OAuth：原窗口得知完成后照 DRT-01 回去；回调落地那一页写「可以关掉」，从不结算、不出返回条，弹出的标签页换了窗口号、删掉复制来的回程。
13. **DRT-13** 原处连接卡「还不能一键连接」去连接页并连好：回到卡所在的页面，卡再读一次后接着它自己的流程。
14. ~~**DRT-14**~~ 已取消：Onboarding 已经在引导里就地连模型（#1310，ONB-MODEL-01），本项不改它。
15. **DRT-15** 回程里没有草稿正文、密钥、地址；`carry` 超长或字符不合、`need` 不在集合里、页面看不见时，`go()` 被拒，设置不开。
16. **DRT-16** 一个窗口一份：另一个标签页（含带 opener 打开的、复制出来的）不出返回条、不结算、不认领这个窗口的回程。
17. **DRT-17** 请求数按 3.4：发起与结算各读一次需要，回去与认领不发请求，设置隐藏或标签页在后台时不轮询（用例里数同源请求）。
18. **DRT-18** 网页里的 Alchemist、插件创作台不改代码：从它们的模型链接进设置、配好后回到原处。创作台在桌面壳里交给系统浏览器、回不来，是已知缺口，不在本条。
19. **DRT-19** 安全：`S-return-trip-source`、`S-return-trip-destination`、`S-return-trip-delivery` 三条的拒绝测试全部通过。
20. **DRT-20** 返回条与回来后的提示在中英文、浅深色、1440／1024／390 下成立，读屏能听到「从哪里来」和状态变化，键盘能走到「现在回去」。
21. **DRT-21** [人工] PF-A07 的退出证据：第 4 节每个要改的消费者各走一遍——进入设置、失败返回、取消返回、成功返回、重开后继续；工程、实操、本人验收分三级记在本 spec 的证据节。共享实现通过不替代消费者接入的验证。
22. **DRT-22** 人在设置里时离开了来处（关掉那个标签、换视图、中止 `go()`），之后才配好：来处什么都拿不到，下次挂上 `arrived()` 也是 `null`；配好的设置照常留在设置里。
23. **DRT-23** 人自己关掉设置（Esc、标题栏、Dock、历史后退）：回程经 `molis-work:cover-closed` 得知，读一次事实后按 `ready`／`not_ready` 交给来处；关覆盖层沿用 `closeCover` 的历史语义。
24. **DRT-24** 没有项目的 Home 页面上的模型设置对话框：照现在打开，不开回程、不出返回条。

## 8. 拆片

按开发流程第 1.1 节「大需求」：合同先行，服务其次，界面与消费者叠在后面。PR 粒度照路线书的规矩：一项交付完整做完、或别的片真要先用到时才开 PR，同一片的后续步骤叠在一个分支上。全量由统筹在集成分支跑，写手不跑全量；单跑用 `node scripts/run-tests.mjs <文件…> --jobs 1`，先用 `node scripts/affected-tests.mjs` 选。

**先后**：第 18 批 P3-1（[#1929][PR1929]）→ ④c-2 → R0 → R1a → R1b → R2 → R3、R4。④c-2 与 R1 串行：P3-1 已开 PR，④c-2 比 R1 先能开工，所以**④c-2 先合，R0、R1a、R1b 在它之上变基**；两边都改的是 `apps/workbench/src/browser/plugin-frame/parent.ts`、`child.ts`、`types.ts`（分工见 6.2 第 14 项）。R0 只是类型与占位，可以和④c-2 同时写，但等④c-2 合入后再开 PR，免得 `child.ts` 来回变基。R1a 仍先于 07-S2 合入，S2 在其上变基（第 10 节）；R4 里卡的那一行自然在④c-2 之后。

| 片 | 内容 | 文件范围 | 前置 | 要跑的测试 |
| --- | --- | --- | --- | --- |
| **R0 合同** | `UiReturnNeed`、`UiReturnCarry`、`UiReturnOutcome`、`UiPageReturns` 与 `UiPluginClientHost.returns`；`child.ts` 的固定拒绝占位；SDK 再导出类型名；改两处过时说明（`docs/platform/PROLOGUE-AI.md:204`、`dom-events.ts:262`）；`pnpm api:update` | `packages/contracts/src/platform/ui.ts`、`packages/contracts/src/platform/dom-events.ts`（只改 `model-ready` 说明）、`packages/plugin-sdk/src/`（类型再导出处）、`apps/workbench/src/browser/plugin-frame/child.ts`、`docs/platform/PROLOGUE-AI.md`、`tooling/gates/api/` | U1 定了；④c-2 合入 | `pnpm health:check`（API 快照、文档引用、页面事件）、`tests/plugin-sample.e2e.test.ts` 的类型检查一半（SDK 只依赖 contracts） |
| **R1a 回程主人、普通链接与模型结算** | `settings-return` 主人与 `return-trips.ts`（存取、形状检查、窗口号与启动时问一声、回调落地页不结算、期限与上限）；普通链接与平台界面开回程（2.3 的推断表）；模型设置的保存结算、人回去、人自己关（`molis-work:cover-closed`）、刷新与启动时结算；回去（关覆盖层、对象链接入口、`molis:assistant-open`）；`sentFromPage` 挪进回程；`open-settings-path` 载荷扩展与窗格转发带上 `need`、`from`、`carry`；独立 Home 对话框忽略新字段；`S-return-trip-destination`；页面资源许可文件 | 新 `apps/workbench/src/scripts/client/settings-return.ts`、`apps/workbench/src/browser/return-trips.ts`；改 `settings-directory.ts`、`apps/workbench/src/browser/plugin-frame/parent.ts`（普通链接与窗格分支补来处）、`tab-workspace.ts`（两处转发）、`tab-workspace-panes.ts`（`apply()` 的宣告）、`packages/contracts/src/platform/dom-events.ts`、`apps/workbench/src/i18n/en.ts`（提示语）、`docs/platform/UI-PLATFORM.md`、`docs/system/security-invariants/S-return-trip-destination.md`、`tooling/gates/page-asset-allowances/12-draft-and-return-r1a.json`、新测试 | R0；④c-2 之后、先于 07-S2；`dom-events.ts`、`en.ts` 与 07 排时段 | `tests/model-first-setup.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`、`tests/model-ready-cross-tab.e2e.test.ts`、`tests/cognia-embedded-settings.e2e.test.ts`、`tests/security-invariants-pane-messages.test.ts`（S-30）、新 `tests/settings-return-trips.e2e.test.ts`（DRT-01～04、06～09、16～18、23、24）、新 `tests/security-invariants-return-trips.test.ts` 的 destination 一半；`pnpm health:check`（页面事件、页面资源、巨大单元） |
| **R1b 插件页的 `go`、认领与交还** | `host.returns.go`／`arrived()` 的实现（框架宿主生成 `return_id` 与挂载随机号、看不见的页拒绝、`carry` 检查）；`molis-work:return-claim`、`molis-work:return-settled`；人离开与没选择离开分开处理（2.4 的表）；窗格文档在外层认领；`S-return-trip-source`、`S-return-trip-delivery` 与它们的单元、浏览器测试；Skill 与文档（`skills/molis-plugin-dev`、`skills/molis-prologue-ai` 步骤 6、`apps/workbench/README.md`） | `apps/workbench/src/browser/plugin-frame/parent.ts`、`child.ts`、`types.ts`、`settings-return.ts`、`dom-events.ts`、`docs/system/security-invariants/S-return-trip-source.md`、`S-return-trip-delivery.md`、`tooling/gates/page-asset-allowances/12-draft-and-return-r1b.json`、新测试 | R1a（因而在④c-2 之后） | `tests/security-invariants-plugin-pages.test.ts`、`tests/security-invariants-plugin-pages.e2e.test.ts`、新 `tests/settings-return-trips.e2e.test.ts`（DRT-05、15、22）、新 `tests/security-invariants-return-trips.test.ts` 与 `.e2e.test.ts`（DRT-19） |
| **R2 返回条（界面）** | 先定样（U4），再做成组件板标本，再进设置的两处落点；回来后的提示用现有 toast | 组件板与设置外壳的样式和渲染（具体文件随定样定）；`DESIGN.md` 设置一节 | U4 定样；R1a | 新用例里的 DRT-20 部分、`tests/connections-page.e2e.test.ts`（ASC-76 的「接着改」不受影响）、组件板快照 |
| **R3 模型消费者** | Cognia、工作流程、Coding 改用 `host.returns.go`（第 4 节）；Coding 的输入草稿改存 `host.drafts`；各插件 README「改动后必跑」补用例 | `plugins/native/cognia/src/`、`plugins/native/workflows/src/browser/`、`plugins/native/coding/src/browser/`、各自的 README 与测试；`skills/molis-plugin-dev` 的例子 | R1b（R2 可并行） | `tests/cognia-embedded-settings.e2e.test.ts`、`tests/workflows-plugin.test.ts`、`tests/coding-model-controls.e2e.test.ts`、`tests/model-ready-surfaces.e2e.test.ts`，各插件新增的 DRT-05 用例 |
| **R4 13⑤ 接入** | 连接页作为落点（授权监视与保存结算、「连好以后」让位、回调落地页文案、`setup` 需要按 3.4 的路由读）；助理「继续接入」与提醒作为来处；原处连接卡「还不能一键连接」开回程 | `apps/workbench/src/scripts/connectors-settings.ts`、`apps/workbench/src/settings-connectors.ts`、助理的「继续接入」画法处、`apps/workbench/src/browser/plugin-frame/` 里卡的那部分 | R1a、R2；卡的那一行等④c-2 合入 | `tests/connections-page.e2e.test.ts`、`tests/security-invariants-connection-card.test.ts`、新用例里的 DRT-10～13 |
| ~~R5 Onboarding~~ | 已取消：引导已经就地连模型（#1310） | — | — | — |
| Images、Feed | 删 `resumeConnection`、去设置的链接让位给卡 | 随④c-2 | ④c-2 | 随④c-2 |

本稿这一步只改文档，没有跑测试。

## 9. 界面：组件板能覆盖什么、要定样的

| 界面 | 组件板现有的能不能覆盖 | 结论 |
| --- | --- | --- |
| 回来后的一句提示（「模型已连接，回到 Coding 接着做」） | 能：现有 toast（`host.showToast`，`settings-directory.ts` 已在用） | 不定样，只加文案 |
| 设置顶上的返回条「从 Feed 来 · 连好后自动回去 · 现在回去」，三种状态（等着、已经好了、原来的页面已关） | 不能：组件板没有这一条；最接近的是 13 定样原型里块 ③ 方案 B 的顶条（`docs/design/service-connections/`），用户 11-04 选了 A（原处就地连），B 没有进组件板 | **要定样**（U4）：推荐照 B 的顶条，用 `mw-alert` 的信息档加一个 `mw-btn` 次要按钮，补成组件板标本后进设置 |
| 刷新后在原处问一句「刚才去配了模型，已经好了 · 接着发送／不用了」 | 能：同连接页「高级」的「接着改／放弃改动」（`settings-connector-draft`，`mw-alert` 加两个按钮）；画在插件自己的页面里，插件已有 `mw-alert` | 只有 U2 选「问一句」时才用；不定样 |
| 原处连接卡「还不能一键连接」的去连接页入口 | 能：#1862 的卡标本已有这一种 | 不定样 |
| 回调落地页文案 | 能：现有连接页的反馈行 | 不定样，只改文案 |

## 10. 与在途工作的边界

**第 07 批 S1（[#1853][PR1853]，右侧并入窗格，暂停中）、S2（[#1867][PR1867]，打开、召回与布局，叠在 S1 上）**。看过两份 diff 的文件清单与 S2 的说明、S2 在 `tab-workspace.ts`、`tab-workspace-places.ts`、`tab-workspace-panes.ts` 里的每一块改动。

| 07 管 | 本项管 | 交界怎么处理 |
| --- | --- | --- |
| 窗格、标签、右侧、独看、跨栏召回（`openSurfaceEntry` → `recall`）、「返回」历史、工作区状态 `molis-work-tab-workspace:<项目>`、覆盖层的 `closeCover`／`noteCover` | 回程：来处、需要、认领；设置覆盖层上的返回条；什么时候关覆盖层 | 本项调已有的 `host.closeCover()`、`host.noteCover` 和对象链接入口（`?openPlugin=`），关覆盖层沿用 `closeCover` 的历史语义；S2 合入后对象链接入口自动经召回 |
| `tab-workspace.ts` 的窗格转发 | 转发要多带 `need`、`from`、`carry`，`from.pane` 由外层按 `frame.dataset.paneOwner` 填 | **最小改动两处**：① 窗格文档拦 `/settings` 点击那段（main `tab-workspace.ts:64-71`，`notifyParent("workbench-open-settings", { href: link.href })`）不变内容，只在 `parent.ts` 的窗格分支（`:56`）多带三项；② 外层那段（main `:487-490`，`if (frame && event.data.type === "workbench-open-settings") { document.dispatchEvent(new CustomEvent("molis-work:open-settings-path", { detail: { href: event.data.href \|\| "" } })); return; }`）改成转发三项并补 `from.pane`。**与 S2 冲突**：S2 的 `@@ -519,7 +529,18 @@` 一块（按 S1 头计行）以这段 `dispatchEvent` 为上下文，紧接着把下一行的消息类型名单加上 `workbench-pane-solo` 并插入右侧窗格一支；R1a 改的正是它的上下文行，S2 变基时要手工合这一块。①不在 S2 的改动块里 |
| 覆盖层从有到无（`tab-workspace-panes.ts` 的 `apply()`） | 回程要知道人自己关了设置 | **最小改动一处**：`apply()` 记下上一次画出的覆盖层（在 `root.dataset.exclusive = state.exclusive` 那一支），在「没有覆盖层」那一支 `root.removeAttribute("data-exclusive")` 之后发现上一次有，就发 `molis-work:cover-closed { kind }`；嵌入的窗格文档不发。新事件的主人是 `tab-workspace`，登记在 R1a。**与 S2 的交界**：S2 在这个文件的 `@@ -105,11 +105,12 @@`（`layoutSplits` 加独看）与 `@@ -157,6 +158,11 @@`（`leaveCoverDirectory(); ops.normalizeLayout(state);` 之后加独看的收尾）两块，R1a 的两行分别在前一块之后几行、后一块之前几行，不在同一块里，变基时多半自动合上，要核一次 |
| `tab-workspace-places.ts` 的 `closeCover`、历史 | 不改 | S2 在这个文件的改动与本项无关 |
| `plugin-frame/navigation.ts`（S1 改） | `plugin-frame/parent.ts`、`child.ts`、`types.ts` | 不改同一个文件 |
| 枢纽 `dom-events.ts`、`i18n/en.ts`（S1、S2 都改）；`tooling/gates/page-assets.json`（S1、S2 都改） | R1a、R1b 改前两个；不改第三个（用任务许可文件） | 时段由统筹排；冲突按批落规则一次解 |

**R1a 先合，S2 变基**：07 暂停到第 13、18、02 批完成，而 13⑤ 在等本项；本项若等 S2 就会互相卡住。R1a 合入后，S2 在上面两处交界变基；DRT-07 的「不新开第二份」在 S2 之前按现有打开行为验，S2 合入后补测一次（C6）。

**第 13 批④c**：④c-1 宿主路由已合；④c-2（外壳画卡、Feed 与 Images 接卡）要等第 18 批 P3-1（[#1929][PR1929]，`framed-area.ts`、`over-frame.ts` 都在里面），P3-1 已开 PR，所以④c-2 比本项先能开工。两者串行：**④c-2 先合，R0、R1a、R1b 在它之上变基**；两边都改 `apps/workbench/src/browser/plugin-frame/parent.ts`、`child.ts`、`types.ts`（6.2 第 14 项），本项不碰 `framed-area.ts`、`over-frame.ts`、`connection-slot.ts`；卡内的流程不改，R4 只加「还不能一键连接」去连接页那一下的回程。

**第 18 批 P3**：防遮盖模块（`framed-area.ts`）只与④c-2 有关；返回条在设置覆盖层里（可信文档、不在插件框外贴着），不用它。

## 11. 待决

### 11.1 要用户拍板

| # | 问你的事 | 推荐 | 为什么 |
| --- | --- | --- | --- |
| U1 | **配好以后，要不要自动关掉设置、回到原来的地方；回去以后，要不要把刚才被挡住的那一下自动做掉？** 入口分两种：一种是插件明确说了「我这一步缺模型」（比如 Coding 你按了发送才发现没模型）；另一种只是插件页面上一个普通的「打开模型设置」或「去连接」链接，没说是为了哪一步 | **都自动回去；只有第一种自动把那一下做掉。** 第一种：配好就回去，把你刚才按的那一下做一次，要花钱或不能撤回的，照它原来的样子先问你。第二种：配好也回去（现在只有「第一个模型配好」才回去，以后换模型、修好模型也回去），但不替你做任何事。你本来就配好了、只是进去看看的，不自动关；链接里看不出要配什么的（比如只是打开设置首页），永远不自动关，顶上留一个「回去」 | 你 11-06 对原处连接卡定过「连上后把刚才在等的事做一次」，这里用同一条，就不用记哪种会接着做。普通链接没说为哪一步，平台猜不出该做什么，所以只带你回去 |
| U2 | **在设置里刷新了页面，配好以后回到原处，那一下是直接做，还是先问你一句？** | **先问一句**：原处出一行「刚才去配了模型，已经好了」和两个按钮「接着发送」「不用了」，样子照连接页「接着改／放弃改动」 | 刷新可能隔了一会儿，你未必还记得刚才按了什么；直接做一件可能花钱的事会吓人。没刷新的常见情况仍按 U1 直接做 |
| U3 | **关掉 Molis Work 再打开以后怎么接？** A：只记在当前这个窗口里，刷新还在，关掉就没了；重开后你写的东西和配好的设置都在，自己再点一次。B：记在这台电脑的浏览器里，重开后在原处问你一句「接着做吗」。C：记在本机的后台服务里，效果同 B | **A** | 重开以后最要紧的是东西不丢，A 已经做到：草稿和配置本来就各自保存着。B 要额外判断「这是哪个窗口的」，还会被登录时弹出的那一页看到；C 要新加数据库表和升级步骤，只为多问一句 |
| U4 | **设置页顶上那条「从哪里来」的提示条长什么样？** | **照 11-04 你看过的服务连接原型里「方案 B」顶上那一条**：写「从〈原来的地方〉来 · 配好后自动回去」，右边一个「现在回去」按钮；配好但没自动回去时写「已经好了 · 回去」；原来的页面已经关了时写明。做成组件板上的标准件再用 | 这条你 11-04 已经看过；当时选的是「在原处就地连」，那个照样是首选，这条只在真的进了设置页时才出现，两者不冲突 |

### 11.2 统筹可以定

| # | 事 | 推荐 |
| --- | --- | --- |
| C1 | 回程期限与上限 | 开着的 24 小时，已结算等认领的 1 小时，每项目 8 张，同一来处替换；启动时问窗口号至多等 300 ms |
| C2 | 页面事件 | 扩 `molis-work:open-settings-path`；加 `molis-work:cover-closed`（主人 `tab-workspace`）、`molis-work:return-claim`（请求，同步回填，认领即删）、`molis-work:return-settled`（宣告）；`molis-work:model-ready` 只改说明；不加 §13.5 草案的 `molis-work:connection-settled` |
| ~~C3~~ | 已并进 U1：普通链接的需要推断会让所有普通链接的消费者「配好就自动关设置」，是产品行为。技术上的约束（`setup` 不从链接推断、`none` 不自动关、设置里的链接不开不替换）写在 2.3 | — |
| C4 | `UiReturnNeed` 第一版的范围 | 只有 `model`；连接一律走 `connectionNeed`；图像服务、工作目录等以后另开合同 |
| C5 | 页面状态主人 | 新主人 `settings-return`，唯一写入方，不并进 `settings-directory` |
| C6 | 回到别的栏用什么入口 | 用现有对象链接入口；R1a 先合，S2 变基后补测 DRT-07 |
| C7 | 跨标签的 `BroadcastChannel('molis-work:model-ready')` | 独立清理项，本项不删：现在仍有人发（`settings-models.ts:13`）也有人听（`context-onboarding.ts:776-781`），服务「引导开着时在另一个标签页配好模型」；推荐留着，等引导下次改版时再看还要不要 |
| C8 | 回调落地页文案 | 「已连上。回到 Molis Work 的窗口，刚才的事会接着做；这一页可以关掉。」，随 R4 |
| C9 | 片的写手与时段 | R0、R1a、R1b 由工作台外壳的写手做，R4 交 D·13 连接会话；④c-2 先合，R0、R1a、R1b 在它之上变基；R1a 先于 07-S2；`dom-events.ts`、`en.ts` 与 07 排时段 |
| C10 | 对象 id 的上限 | 256 个字符、不含控制字符、拼链接一律编码；R1a 开工前核对各搜索来源现有 id 都放得进 |

## 12. 决策记录

- 2026-11-07，统筹按评审台第一轮（[#1928 评论][REVIEW1]）裁定，本稿照改：
  - B1：删 U5、R5、DRT-14（Onboarding 已经就地连模型，#1310）；跨标签通道改成独立清理项 C7，写明现在仍有人发和听；两处过时说明随 R0 改。
  - B2：回程加窗口归属（`sessionStorage` 里的窗口号，启动时问一声防复制）；回调落地页从不结算；`S-return-trip-delivery` 补弹出标签页的拒绝测试。
  - B3：R1a 先于 07-S2 合、S2 变基；R1a 的文件范围写进 `tab-workspace.ts` 的转发两处与 `tab-workspace-panes.ts` 的覆盖层关闭宣告，写明与 S2 冲突的具体块。
  - B4：改成「认领」，只有一个写入方，框架宿主同步认领，认领即删。
  - B5：对齐用户 11-06 对④c 第 3 项的决定：只有人没选择离开的重建交给 `arrived()`，人自己离开的按 `not_ready` 结掉。
  - 不挡的 1～11 照改；第 12 条：C3 并进 U1，用户拍板项只剩 U1～U4。
  - 同日统筹更正第 8 条的先后：第 18 批 P3-1 已开 PR #1929，④c-2 比 R1 先能开工；改成④c-2 与 R1 串行，④c-2 先合，R0、R1a、R1b 在其上变基。

用户与统筹之后定的，按日期接着写在这里，正文跟着改。

## 13. 证据

本稿：只读核查 main `c39746b20`（文件与行号见第 1.1 节），看过 [#1853][PR1853]、[#1867][PR1867] 的文件清单、#1867 的说明与它在 `tab-workspace*.ts` 里的改动块；没有改产品代码，没有跑测试，没有启动 Home。

[B12]: ../post-anticorruption-roadmap/reference/batches/12.md#batch-12-item-3
[B13]: ../post-anticorruption-roadmap/reference/batches/13.md#batch-13-item-1
[AUDIT]: ../product-flow-governance/audit-2026-10-27.md
[PFG]: ../product-flow-governance/spec.md
[ASC]: ../assistant-service-connections/spec.md
[ONBMODEL]: ../archive/onboarding-model-link/spec.md
[PR1853]: https://github.com/molis-ai/molis-work/pull/1853
[PR1867]: https://github.com/molis-ai/molis-work/pull/1867
[REVIEW1]: https://github.com/molis-ai/molis-work/pull/1928#issuecomment-6707035590
[PR1929]: https://github.com/molis-ai/molis-work/pull/1929
