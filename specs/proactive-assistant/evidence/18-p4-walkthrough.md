# 第 18 批 P4 实走记录：定时任务按任务授权读取业务数据

状态：2026-11-07 在隔离的临时 Home 里走完一遍，记录工程通过与实操两级证据；本人验收不在这里记，界面与体验各项列在第 4 节，交用户本人看。原需求是[主动助理 §5.4.1](../spec.md)（PWA-148～154），方案与平台区域见[实施方案](../schedule-task-reads.md)与[平台区域设计稿](../task-grants-platform-area.md)（TGA-01～28）。

## 1. 走的是什么

- **代码**：分支 `claude/18-p3-1-area`（PR #1929）头 `45c9133e5c`；P2（#1879）已在 main。`pnpm install --frozen-lockfile --offline`、`pnpm build`、`pnpm workspace:build` 都过。
- **Home**：会话临时目录下新建的 `MOLIS_WORK_HOME`，本机端口 4391（不碰 `~/.molis-work`、4207、4208）；用完按 pid 停掉宿主与浏览器，整个 Home 删除。
- **浏览器**：先试了 Claude 桌面应用的内置浏览器窗格，插件框加载不出来（「无法加载界面，请重试」，框里的平台脚本加载了、插件包从没请求，十秒后超时）；改用仓库的专用无头测试浏览器（`molis-test-browser`，中文界面，1440×960），经机器的 browser 槽位，用 CDP 发**真实的鼠标与键盘输入**（`Input.dispatchMouseEvent`，`isTrusted` 为真）。内置窗格的问题看来是那个窗格的环境，不是产品问题，没再深究。
- **项目与数据**：新建空白项目「18-P4 走查」，自带 Schedule、待办、Goals、Jelly 等插件，另从插件选择器添加了 Inbox。在待办里记了两条，在 Goals 里建了一个目标，在 Schedule 里建了任务「每日简报」（每天 07:30），之后又建了「每周回顾」。
- **模型**：没有配置。环境变量 `MINIMAX_API_KEY` 只给宿主自己的文字补全（`apps/local-host/src/host-complete-text.ts` 的 `environmentModel`），Agent 运行只认 Home 的模型设置；而把真实密钥填进「设置 › 模型设置」不在本次走查的权限里，所以 07:30 那一轮按预期失败在「还没有配置可用的模型」，**实际读数据的部分没有走到**（见第 3 节）。
- **证据截图**：都在已忽略的 `.impeccable/qa/review/18-p4/` 下（不入库），下表写文件名。

**走查之后又改过的**（都随 #1929 合入 main `b38935864e`，各带先红的用例）：D2，脚本发的点击会让开关显示「开」，现在拒绝之后按记录重画；O1，页面重新可见时会再读一次，区域不再显示旧状态；O2，占位符两侧加空格；变化行从 `mw-toast` 改成设计系统的 `mw-alert`（修 `one-toast` 失败）。下面各节记的是走查时那个头 `45c9133e5c` 的样子。O3、O4 记在 BL-schedule-detail-refresh-after-failed-round 和 BL-host-log-stray-input-invalid。界面与体验、真实模型读取两项本来要本人看；用户 2026-11-07 表示按验收通过处理，没有另看实物，也没有用真实模型再走一遍。

## 2. 逐步结果

级别：**实操** = 本次在临时 Home 里亲手做、亲眼看到（并核对了 Home 里的授权记录 `config/mcp-tools.json`）；**工程** = 本次在同一份代码上跑过的定向用例（第 2.8 节）。

### 2.1 装插件、建任务（第 1 步）

| 步骤 | 验收 | 做了什么 | 结果 | 证据 | 级别 |
| --- | --- | --- | --- | --- | --- |
| 1a | PWA-148 | 空白项目里 Schedule、待办、Goals、Jelly 已装且启用，从插件选择器添加 Inbox；本人身份调「授权与放行」的 `list` | 通过：可选类别 17 类。声明了读取分组的按组出现：待办、目标、来信、日历、笔记、提醒、定时操作；没声明的插件整个算一类（Cognia、Dataset、Forms、图片、Issue、灵光、Pages、PPT、Shelf、工作流程）；系统提供方只出现「项目资料」 | `01-schedule-empty.png` | 实操 |
| 1b | PWA-148 | 新建「每日简报」（说明写「列出今天要处理的待办、今天的日程、目标的状态…读不到的类别请如实说明」，07:30） | 通过：表单不弹窗，「能读的数据」写「建好之后在这条任务里选它能读的数据；不选就只读项目文件」；建好后详情里出现平台区域 | `02-task-detail-area.png` | 实操 |
| 1c | PWA-148 | 「日程」口径 | 通过：「日历」（Jelly）与「提醒」（Schedule）各一行；「笔记」「定时操作」各自另成一行、默认关 | `02-task-detail-area.png` | 实操 |
| 1d | PWA-148、§3.3 | 任务用 `brief` 角色 | 有类别的任务每轮按平台授权选 `brief`（`plugins/native/schedule/src/task-grants.ts` 的 `roundRole`），没有类别的用 `reader`；07:30 那一轮确实带着授权去启动、停在没有模型（2.3） | 调用记录 `schedule.task.wakeup` → `agent.model_not_configured` | 实操（只到启动） |

### 2.2 平台区域（第 2 步）

| 步骤 | 验收 | 做了什么 | 结果 | 证据 | 级别 |
| --- | --- | --- | --- | --- | --- |
| 2a | TGA-01 | 看区域挂在哪 | 通过：区域是外层文档里的 `section.mw-platform-area[data-task-grants-area]`，不在插件框里；计算样式 `opacity` 为 1；标头「Molis Work · 只有你能改 · Schedule」，说明「只能读，不能改；只给这个任务；随时可以撤回」 | `02-task-detail-area.png` | 实操 |
| 2b | TGA-12、PWA-148 | 真实点按「待办」开关 | 通过：开关打开，变化行「已允许读待办，下一次运行起能读到 · 撤销」；记录里只多了 Todo 的 6 个只读动作（`todo.items.list` 等，都是「待办」组里的） | `03-todo-on.png` | 实操 |
| 2c | TGA-12、PWA-154 | 点「撤销」 | 通过：开关回原位，记录清空，变化行「已撤销刚才的改动」，之后不再给撤销 | `04-undo.png` | 实操 |
| 2d | TGA-03、§3.3 未就绪态 | 切到别的标签再切回，区域一出现就点「日历」 | 通过：这一下不写（记录不变），变化行「刚移动过，请再拨一次」；区域带 `data-unready`、开关 `aria-disabled`，约 550 毫秒后恢复 | — | 实操 |
| 2e | TGA-10 | 切到别的标签 | 通过：区域 `opacity` 0、高 0，不响应 | — | 实操 |
| 2f | §3.2 第 4 行 | 打开工作台的插件选择器（整块盖住区域）后点开关的位置 | 通过：点到的是选择器，区域什么都没写 | `05-covered-by-picker.png` | 实操 |
| 2g | §3.1、craft-finish | 区域重新显示 | 通过：每 60 毫秒取样，切回后约 300 毫秒区域出现，`craft-fade-in` 130 毫秒淡入（0 → 0.77 → 0.99 → 1） | — | 实操 |
| 2h | §3.6 冲突 | 区域读过之后，以本人身份经设置页的路由改了这个任务的授权，再拨区域里的开关 | 通过：「已在别处改动，已刷新」，开关回原位并重读，记录只有别处那次改动 | — | 实操 |
| 2i | TGA-06 | 在外层文档里对开关调 `.click()`、`dispatchEvent(new MouseEvent("click"))` | 通过（不写）：记录不变、变化行不动。**另见缺陷 D2**：后一种让开关在画面上停在「开」 | `19-synthetic-click-visual.png` | 实操 |
| 2j | TGA-02、04、05、07、11、15～19 | 插件改位置、只露一部分、叠嵌入、伪造消息、键盘焦点稳定期、连点、换 key、窄框、两块相交 | 手上做不到（要插件配合或伪造框里消息），由用例证明：`tests/security-invariants-task-grants-area.e2e.test.ts`、`tests/security-invariants-task-grants-area.test.ts` | 第 2.8 节 | 工程 |

### 2.3 打开一类并运行（第 3 步）

| 步骤 | 验收 | 做了什么 | 结果 | 证据 | 级别 |
| --- | --- | --- | --- | --- | --- |
| 3a | PWA-148 | 打开「待办」「目标」 | 通过：记录 25 条（待办 6、目标 19），都是 query | — | 实操 |
| 3b | Schedule 列表标记 | 看左侧任务行，不刷新 | 通过：打开第一类后行首标记从「读文件」换成「读数据」，全部撤回后换回「读文件」；有类需重新确认时状态写「需要重新确认」，处理完回到「已启用」——都不用刷新 | `07-all-withdrawn-marker-files.png` | 实操 |
| 3c | PWA-149、PWA-153 | 等到 07:30 到点运行 | **没走到**：这一轮在启动 Agent 时报 `agent.model_not_configured`，任务对话里写「到点了，但这一轮没跑成：还没有配置可用的模型」。读到所勾类别、读不到未勾类别、回复如实说明缺的类，都要配好模型再走 | `06-after-run-model-missing.png` | — |
| 3d | PWA-149、PWA-150 | 未勾的类被拒、写类拿不到 | 实操没走到（同上），由用例证明：`tests/schedule-task-grants.test.ts`、`tests/security-invariants-task-grants.test.ts` | 第 2.8 节 | 工程 |

### 2.4 撤回（第 4 步）

| 步骤 | 验收 | 做了什么 | 结果 | 证据 | 级别 |
| --- | --- | --- | --- | --- | --- |
| 4a | PWA-151、TGA-12 | 在区域里关「目标」，再关「待办」 | 通过：记录依次减到 6、0；变化行「已撤回目标，下一次运行起读不到 · 撤销」 | `07-all-withdrawn-marker-files.png` | 实操 |
| 4b | TGA-24、TGA-26 | 重新打开 待办、目标、日历，进 `/projects/<id>/settings/grants` | 通过：「后台任务能读的数据」按安装分组（Schedule 1），任务行用 Schedule 给的标题「每日简报」，每个已授权的类一行带「撤回」 | `08-settings-grants.png` | 实操 |
| 4c | TGA-25 | 设置页里「撤回」日历 | 通过：提示「已撤回日历，下一次运行起读不到」，记录从 28 减到 25，行消失 | — | 实操 |
| 4d | §5.2「打开」 | 点「打开」 | 通过：回到工作台，Schedule 选中「每日简报」的详情，区域在、开关与设置页一致（日历已关） | `09-open-goes-to-task.png` | 实操 |
| 4e | TGA-25、PWA-151 | 「全部撤回」：先取消，再确认 | 通过：先出确认对话框「撤回这个任务能读的全部数据？…」；取消后记录不变；确认后记录清零，提示「已撤回「每日简报」能读的全部数据」，列表变成空状态说明 | `10-clear-all-confirm.png`、`11-cleared-empty.png` | 实操 |
| 4f | PWA-151「下一次读取即被拒」 | 撤回后下一轮读 | 实操没走到（没有模型）；撤回后排队读取被拒、不写业务记录由用例证明 | 第 2.8 节 | 工程 |

### 2.5 需要重新确认、暂时读不到、已不再提供（第 5 步）

需要重新确认与已不再提供是**模拟**的：停掉宿主后改临时 Home 的授权记录（去掉「待办」的 `todo.home.events` 一条，等于提供方新加了一个读取动作；给 Goals 加一条不在任何组里的动作记录，等于提供方删掉了那一组），再起宿主。暂时读不到是真做：在插件选择器里把 Jelly 移出项目。

| 步骤 | 验收 | 做了什么 | 结果 | 证据 | 级别 |
| --- | --- | --- | --- | --- | --- |
| 5a | PWA-151（停用再启用） | 重启宿主 | 通过：授权都还在 | — | 实操 |
| 5b | PWA-152、PWA-154 | 模拟后打开任务 | 通过：「待办」写「有新的读取能力，允许之前读不到」带「允许」；「Goals」写「这一类已不再提供」带「移除」、没有开关；Schedule 行状态「需要重新确认」 | `14-needs-confirmation-removed.png` | 实操（模拟） |
| 5c | TGA-13 | 这时打开「来信」，再撤销 | 通过：待办的 5 条记录不变、缺的那条没被补上，Goals 那条游离记录原样保留；撤销只去掉来信 | — | 实操（模拟） |
| 5d | PWA-152、PWA-154 | 点「允许」 | 通过：补上缺的那条，变化行「已允许待办的新读取能力；不想要就关掉这一类」，**不给撤销** | — | 实操（模拟） |
| 5e | PWA-154 | 点「移除」 | 通过：游离记录删掉，变化行「已移除Goals，这一类已不再提供」，不给撤销；Schedule 行回到「已启用」 | `15-after-allow-remove.png` | 实操（模拟） |
| 5f | PWA-154、TGA-14 | 把 Jelly 移出项目，切走再切回 | 通过：「日历」写「暂时读不到，授权还在」，记录 3 条留着，可选类别里不再有 Jelly；这时打开「来信」，日历的记录不变；把 Jelly 加回来、切回，「日历」回到已授权 | `16-unavailable-calendar.png` | 实操 |
| 5g | PWA-154 | Jelly 不在时关掉「日历」 | 通过：变化行「已撤回日历；它的插件回来之后，重新打开开关才能再读」，不给撤销，记录清掉 | — | 实操 |
| 5h | TGA-25 | 设置页里的「允许」「移除」 | 实操没走（模拟要重启宿主，只在区域里走了），由 `tests/task-grants-page.e2e.test.ts` 证明 | 第 2.8 节 | 工程 |
| 5i | — | 一次没能复现的旧状态 | **见观察 O1** | `13-stale-area-after-plugin-removed.png` | 实操 |

### 2.6 归档（第 6 步）

| 步骤 | 验收 | 做了什么 | 结果 | 证据 | 级别 |
| --- | --- | --- | --- | --- | --- |
| 6a | PWA-151 | 暂停「每日简报」再恢复 | 通过：授权记录不变（31 条） | — | 实操 |
| 6b | PWA-150 | 新建「每周回顾」，只开「待办」 | 通过：它的区域只显示自己的一类；记录按任务各记各的（每日简报 31 条、每周回顾 6 条）；设置页两行，各用自己的标题 | `17-settings-two-tasks.png` | 实操 |
| 6c | PWA-151 | 归档「每日简报」 | 通过：确认框写「归档后不会再自动运行，它能读的数据也一起撤回」；确定后它的 31 条记录清掉，「每周回顾」的 6 条不动；设置页只剩「每周回顾」 | `18-after-archive-settings.png` | 实操 |

### 2.7 其他（第 7 步）

| 步骤 | 验收 | 做了什么 | 结果 | 证据 | 级别 |
| --- | --- | --- | --- | --- | --- |
| 7a | 实施方案 §3.2、S-task-grant-subjects ⑥ | `list` 里的系统提供方；以本人身份 `set` 点名 `system.search`、`system.memory`、`system.placement` | 通过：可选类别里系统提供方只有「项目资料」（`system.knowledge`，`task_readable`）；三次 `set` 都是 400 `actions.input_invalid`「所选的类别此刻不提供或读不到，请刷新后重选」，什么都没写 | — | 实操 |
| 7b | S-08（#1828） | 经动作网关 `/api/internal/action-service` 以 `agent:task:<项目>:<安装>:<任务>` 和 `agent:prologue` 各发 discover 与 invoke（`todo.items.list@1`） | 通过：四次都是 400 `actions.input_invalid`「内部 Agent 的身份不能经网关使用」；同一次 `runtime:codex` 的 discover 是 200；调用记录 `logs/action-calls.jsonl` 没有多一行 | — | 实操 |
| 7c | TGA-28 | 设置页路由带 `x-molis-plugin-page` 头 | 通过：403 `actions.forbidden`，不写 | — | 实操 |
| 7d | TGA-28、R3、C3 | 路由请求多一个键 `install_id`；对声明了分组的 Jelly 不写 `group_id`；写不存在的组；对原来没有记录的类带 `confirm: true` | 通过：都是 400 `actions.input_invalid`，不写 | — | 实操 |

### 2.8 工程：同一份代码上的定向用例

在同一检出（`45c9133e5c`）上经机器的 browser 槽位、`--jobs 1` 跑：

```
node scripts/machine-slot.mjs run browser --label "18-P4 walkthrough tests" -- node scripts/run-tests.mjs --jobs 1 \
  tests/schedule-task-grants.test.ts tests/security-invariants-task-grants.test.ts tests/security-invariants-task-grants-area.test.ts \
  tests/security-invariants-task-grants-page.test.ts tests/security-invariants-gateway.test.ts tests/schedule-task-grants-area.e2e.test.ts \
  tests/security-invariants-task-grants-area.e2e.test.ts tests/task-grants-page.e2e.test.ts
```

结果：8 个文件全部通过，1.7 分钟。

| 文件 | 用例 | 证明什么 |
| --- | --- | --- |
| `tests/schedule-task-grants-area.e2e.test.ts` | 1/1 | Schedule 详情里的区域与列表标记 |
| `tests/security-invariants-task-grants-area.e2e.test.ts` | 3/3 | TGA-01～19 中需要插件配合或伪造输入的拒绝 |
| `tests/task-grants-page.e2e.test.ts` | 2/2 | TGA-24～27，含设置页的「允许」「移除」 |
| `tests/security-invariants-gateway.test.ts` | 3/3 | S-08：网关拒绝 `agent:` 身份 |
| `tests/schedule-task-grants.test.ts` | 14/14 | 每轮按授权选角色、归档清授权、对账 |
| `tests/security-invariants-task-grants.test.ts` | 23/23 | 任务主体：只读、按任务隔离、撤回后排队读取被拒、系统提供方排除、R1～R5 |
| `tests/security-invariants-task-grants-area.test.ts` | 1/1 | 区域路由的拒绝（TGA-08、09、17） |
| `tests/security-invariants-task-grants-page.test.ts` | 2/2 | TGA-26、TGA-28 |

## 3. 缺陷与观察

**D1 没走到：真实模型下的一轮读取（PWA-149、PWA-151「下一次读取即被拒」、PWA-153）。** 不是产品缺陷，是走查条件：Agent 运行只认 Home 的模型设置，环境变量里的 MiniMax 密钥只给宿主的文字补全。要补这一段，需要有人在临时 Home 的「设置 › 模型设置」里配好 MiniMax（`docs/platform/STUDIO-SKILL-REPLAY.md` 第 144 行写的就是这一步），再按 2.3、2.4 重走：勾「待办」「目标」、到点运行、看回复只依据这两类并说明日历读不到，撤回一类后再跑一次。

**D2 低：脚本合成的点按会让开关停在画面上的「开」。** 复现：打开任务详情，在外层文档里执行 `document.querySelector('[data-task-grants-area] input[aria-label="Forms"]').dispatchEvent(new MouseEvent("click", { bubbles: true }))`；开关显示为开，记录与变化行都没变（写入被正确拒绝）。之后本人真点一下，按记录把它当作「打开」，所以不会写错，只是画面和事实不一致，直到下次重画。原因：`apps/workbench/src/browser/plugin-frame/task-grants-area.ts` 第 168 行靠 `event.preventDefault()` 让浏览器不翻开关，而 `new MouseEvent("click")` 默认 `cancelable: false`，取消不了；第 171 行对「silent」拒绝直接 `return`、不 `draw(entry)`。可在 silent 拒绝时也重画一次。只有能在外层文档里跑脚本的代码才做得到（设计稿第 4 节的前提是外层不跑插件代码），所以只是画面问题、不是授权问题。

**O1 只见过一次、三次没复现：区域显示旧状态。** 当时的顺序：先在「授权与放行」页「全部撤回」，以本人身份经路由重新授权 待办、目标、日历，进设置的「插件」一节，从插件选择器把 Jelly 移出项目，再从选择器切到 Schedule、点开「每日简报」。设置页的 `list` 已经写「日历」暂时读不到，区域里那一行仍是已授权、开关开着；整页刷新后才对。之后照着走了三次（从别的标签加回或移出 Jelly 再切回、从设置页移出再从选择器切回、移出后点任务行），区域每次都重读、显示对。猜测的原因：`apps/workbench/src/browser/plugin-frame/task-grants-area.ts` 第 201～202 行，页面**第一次**变为可见时不重读（`shownOnce`），只有之后再回到视野才重读；读取在途（`entry.busy`）时也跳过。若那一次 Schedule 页是在后台装好、区域在页面还没显示时就读过一次，显示出来时就不会再读，看到的是移出 Jelly 之前的状态（设计稿 §3.6「框重新可见：重读一次」）。没有抓到证据，留给评审台判断这两种情况要不要补读。

**O2 文案：** 「已移除Goals，这一类已不再提供」「已允许读Forms」——中文与插件英文名之间没有空格，提供方名是英文时读着挤。交用户看（第 4 节）。

**O3 Schedule 详情不实时：** 07:30 那一轮失败后，打开着的详情页没有出现失败的那一轮、仍写「下次 11月7日 07:30」，整页刷新后才显示。这是 Schedule 自己的刷新，不是本批改动，记在这里备查。

**O4 不明的一行宿主日志：** 07:22（建待办和目标的时候）有一行 `request_failed`、`actions.input_invalid`，界面上没有报错，找不出是哪个请求。

## 4. 留给用户本人看的

界面与体验类以用户本人看实物为准，这里只列要看什么，不代为认可：

- 平台区域的样子：外框、标头「Molis Work · 只有你能改」与插件内容的区分，类别多时（本项目 17 类）列表在固定高度里滚动是否顺手、默认把哪几类放在前面。
- 区域的动效：重新显示时 130 毫秒淡入、约半秒的「未就绪」淡显，以及「刚移动过，请再拨一次」这类提示的轻重。
- 变化行的说法与「撤销」的位置；允许、移除、关掉暂时读不到的类之后不给撤销时的那几句话。O2 的空格问题。
- 「授权与放行」一页的版式：任务卡片、类别行、状态标签与「撤回」「允许」「移除」，「全部撤回」的确认框。
- 中文、英文两种界面（本次只看了中文）。
- 浅色、深色（本次只看了浅色）。
- 1440、1024、390 三种宽度（本次只看了 1440）；390 时区域的窄档与变化行折两行。
- PWA-153：用真实的待办、Inbox、Jelly 日历和目标数据、配好模型后走完整的每日简报，看结果是否如实。
