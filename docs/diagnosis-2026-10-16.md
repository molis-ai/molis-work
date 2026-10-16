# Molis Work 诊断报告（2026-10-16）

审查对象是本机仓库 `/Users/oreal/adeptify-home/repos/molis-work`，分支 `main`。`git fetch origin main` 之后快进，`HEAD` 与 `git ls-remote origin refs/heads/main` 相同。

- 提交：`c1531e6dd1bc2692826c3bf3e9b8a86317a98be6`
- 说明：`docs(backlog): BL-143 — the Feed reader's retry flake in product-interaction (#593)`
- 父提交：`f53bc08c502a51055cd3c51525ce5a2f400694b7`

这次读了该提交的源码，并用一个新建的空 Home 做了现场核对（现场跑在祖先 `19dc13d41` 上；下面写明哪些文件到这个提交没有再改）。没有改产品代码，没有跑完整测试，没有打开正在使用的 `~/.molis-work`、端口 4173 上的服务或原生窗口，也没有做现场计时。下面凡是秒数或 CPU，都标明「本次未重测」。历史账本里已经合进这棵树的问题（鉴权尾部再读、Goal 恢复成环、三路轮询合并等）不作为未修缺陷重开。`#593` 把 BL-143 记成 Feed 阅读器用例偶发失败，这次没有把它当成已确认的产品逻辑缺陷。

这个提交（`#593`）只给待办账本加了一行。从现场核对时的 `19dc13d41`（`#569`）到这里，和本报告有关的变化是：`#578` 让项目打开失败不再拖住 Host 关闭；`#582` 让已经打开的项目在 tick 失败时写一次 `schedule/round_failed`。`openAll` 失败后不再补开的行为还在。Pages、表单、放置、炼金术士、定时对话叫醒这些文件没有进这 15 个提交。分批笔记超过 8000 字符仍在 `apps/local-host/src/context-onboarding-service.ts` 第 167 行被退回。表单页的打包在 `0367ad33`（`#558`）。`#560` 只改了 Coding 外部等待和 Prologue 检查器；检查器的行号在 `#581` 之后见性能一节。

现场核对用无头 Chrome 打开这个空 Home 上的页面，服务由 `listen(0)` 听在临时端口。一次性脚本没有留在仓库里。工作区里另有与本次无关的未跟踪文件（`.claude/`、交接文档、`docs/reviews/anti-corruption-review-2026-10-16.md`、`plugins/native/jelly/native/`），没有动。

## 确认的逻辑问题

每条都给出使用者能碰上的触发、代码路径、以及最后看到的错误结果。

### 1. 项目后台调度：第一次打开失败后，后面的项目本进程不再调度

触发：Web 服务起来大约 30 秒后，宿主按目录顺序打开每个有数据库的项目。打开中途只要有一次抛错，失败的那个项目以及按显示名排在它后面的项目，在这个进程活着的时间里都不会再跑定时任务。目录连接上的 `SQLITE_BUSY` 也算这次抛错。

路径：

- `apps/local-host/src/web-project-schedulers.ts` 第 29–37 行。`openAll` 用 `opening ??=` 把整次打开缓存下来。`withCatalog` 或循环里的 `withProject` 抛错后，`.catch` 只打日志，不把 `opening` 清掉，这个 Promise 以成功结束。
- 目录连接自己的 `SQLITE_BUSY` 在 `apps/local-host/src/web-catalog-access.ts` 第 18–28 行：清掉目录的 `opening`，100 毫秒后再借一次空连接（`withCatalog(..., () => undefined)`），然后把错误重新抛出。重新抛出的错误进了 `openAll` 的 `.catch`。目录那次重试不会再跑 `openAll`，调度也不会在下一轮补开项目。
- 日志在 `apps/local-host/src/web-server.ts` 第 112 行：`hostLog.warn("schedule", "project_schedulers_not_started", error)`。stderr 上是一行 JSON，`area` 为 `schedule`，`event` 为 `project_schedulers_not_started`。错误只留 `name` 和 `code`（例如 `SQLITE_BUSY`），消息正文和堆栈不写入（`apps/local-host/src/host-log.ts`）。
- 周期任务本身在 `apps/local-host/src/periodic-tasks.ts` 第 28–38 行：上一轮还没结束就跳过下一轮；`run()` 没有抛错时 `last_error` 写成 `null`。`openAll` 的错误被吞掉，所以诊断里的 `last_error` 仍是空的。
- 目录顺序是 `modules/projects/src/repository.ts` 第 43 行：`display_name COLLATE NOCASE, created_at, project_id`。
- 已经打开的项目会留在 `runtimes` 里。之后每次只对它们做 `round()`（第 42–47 行）。`#582` 起，某一项 tick 第一次失败会经 `repeatingFailure`（`host-log.ts` 第 82–90 行）写一条 `schedule` / `round_failed`；同一项接着失败就不再写，直到中间成功过一次。这行日志仍然进不了诊断页的 `last_error`。没进 `runtimes` 的项目没有 tick 可记。

错误结果：先打开成功的项目继续每 30 秒跑 Feed 调度和日程。失败点及其后的项目没有调度器。界面上看不到「这个项目的后台没起来」。宿主日志里有一次 `project_schedulers_not_started`。第一次触发要等第一个 `setInterval`（30 秒），启动当下不会立刻打开。

现场（跑在 `19dc13d41`，`openAll` 的缓存和吞错与现在第 29–37 行相同）：空 Home 里建了甲、乙两个项目。服务听上临时端口之后，另一条 better-sqlite3 连接对两个项目库执行 `BEGIN IMMEDIATE`，按住约 40 秒，盖住第一次 30 秒 tick 和服务端 5 秒的 `busy_timeout`。锁住期间 stderr 出现一条，`at` 为 `2026-10-16T07:39:38.899Z`：`project_schedulers_not_started`，`error.code` 为 `SQLITE_BUSY`。松开后再等约 40 秒，没有第二条同样的警告。诊断页「项目里的定时任务」显示「每 30 秒 · 上次 16:40 正常」。这次失败没有写进 `last_error`。早先对目录库做 `node:sqlite` 的 `BEGIN EXCLUSIVE` 挡不住 better-sqlite3 读目录（WAL），那次诊断仍是「正常」，不能当作本条的复现。`#582` 的 `round_failed` 只覆盖已经放进 `runtimes` 的 tick，不重试这次打开。

### 2. Pages：未保存时点收藏、移动文件夹或删除文件夹，正文会和版本卡死

触发：一篇文档正打开着，本地还有未保存修改，或者 400 毫秒的保存计时器还在、保存请求还没结束。此时点收藏、把这篇拖进/拖出文件夹，或删除它所在的文件夹。

路径：

- 收藏和移动不走保存队列。`plugins/native/pages/src/client.ts` 第 764–774 行：`toggleStar` 只 POST `{ starred }`，`movePage` 只 POST `{ folder_id }`，然后 `loadList()`。
- 删除文件夹：同文件第 935–942 行，POST 删除后 `loadList()`。服务端 `plugins/native/pages/src/store.ts` 第 418–422 行把该文件夹里每篇文档的 `folder_id` 清空，并把 `version` 加 1。
- 服务端 `update`（`store.ts` 第 244–268 行）缺省字段保留当前值，版本总是 `current.version + 1`。只改星标或文件夹时，库里的正文仍是上次保存的正文，版本已经前进。
- 客户端 `loadList`（`client.ts` 第 633–642 行）在 `dirty` 或 `saveTimer` 为真时，不采用服务端新版本。
- 随后自动保存走 `enqueueSave`（第 568–572 行），`expected_version` 仍是编辑器里的旧版本。服务端第 245 行和 第 267 行因此报「文档已被其他窗口修改」。`save`（第 655–658 行）失败后把 `dirty` 再设为真。返回、切换文档会 `await persist()`（第 670–672、688、704 行），同一冲突会一直重试。

错误结果：星标或文件夹已经写上，未保存正文写不回去。刷新之后，星标/文件夹/「回到未分类」还在，未保存正文丢失。返回和切换也保存失败。文档本身干净、没有未保存修改时，`loadList` 会采用新版本，这条路径不发生。

现场（无头 Chrome）：文档 `04d17f90-03a2-4591-9d6b-e481f4a225fc`，已保存标题，版本 1。编辑器把标题改成「还没保存的标题」后点收藏。浏览器 POST 的正文是 `{"starred":true,"project_id":"project-89cd1847-09fc-41ed-99d3-f8ed8ab9615e"}`，状态 200。服务端标题仍是「已保存标题」，`starred` 为真，版本变为 2。编辑器仍显示「还没保存的标题」。接着用 `expected_version: 1` 再存标题，返回 409，`code` 为 `pages.conflict`，句子是「文档已被其他窗口修改，请重新读取后保存」。再读，标题仍是「已保存标题」，版本 2。文件夹移动和删除文件夹没有在这次点击里另跑一遍，源码路径与收藏相同。

### 3. 放置条把当前文档移走时，未保存修改被直接丢掉

触发：正在编辑的 Pages 文档被放置条以「移动」改到另一个位置。

路径：`plugins/native/pages/src/client.ts` 第 810–816 行。`molis:placement-changed` 且 `mode === "move"`、打开的就是被移走的那篇时，直接 `closeEditor()`，没有 `persist()`，然后再 `loadList()`。

错误结果：编辑器关掉，未保存的标题和正文不提交。目标位置上的文档是移动前已经落库的正文。`relocate`（`store.ts` 第 317–327 行）本身不增加版本，它清掉文件夹、Goal 和成果编号；丢掉的是还没进这次移动的本地修改。

现场：文档 `ee34a9d3-d191-45f6-822d-b8095bd9a02c` 先存成「放置前标题」。编辑器改成「放置时还没保存」之后，`POST /api/placement/move` 把它移到乙项目 `project-2229a495-36f4-48c9-9948-e41e3969077f`，状态 200。页面里再发出 `molis:placement-changed`（`mode` 为 `move`，对象就是这篇）。编辑器区域变为隐藏。乙项目里读到的标题仍是「放置前标题」，版本 1。那次未保存的标题 POST 被测试页挂起，没有进到服务端。放置条自己的移动会在 `apps/workbench/src/scripts/client/placement.ts` 第 428 行派发这个事件。这次移动是脚本直接 POST 的，打开着的页面收不到它，所以随后在本页派发了同一个事件。

### 4. 定时对话失败时，「这一轮没跑成」经常写不进去

触发：一条每天一次的定时对话已经到点并开始跑。跑的过程中任务被改过（标题、说明、小时、分钟、是否重要提醒），或者这次叫醒的租约丢了。模型出错、任务却完全没改、租约还在时，失败句可以写上，下面说的不是这条。

路径：

- `horizontal/scheduler/src/index.ts` 第 437–448 行：`fireScheduleWakeup` 在调用处理函数之前，若还持有租约，把非 interval 任务的 `enabled` 写成 0。`next_due_at` 写成 `nextDueAfter` 的返回值。第 625–626 行：重复类型不是 `interval`，或没有 `interval_ms` 时，`nextDueAfter` 原样返回这次的 `next_due_at`，不会推到下一次。对话任务登记为 `once`（`plugins/native/schedule/src/wakeup.ts` 第 110–122 行），所以这里只关 job，到期时间仍是刚触发的那一次。
- 处理函数 `handleScheduleTaskWakeup`（同文件第 51–93 行，写入在第 70–91 行）：成功和失败都在 `db.transaction().immediate()` 里先 `assertCurrent()`。任务停了、归档了，或标题、说明、时、分、重要标记与开跑时不一致，就抛「定时任务已暂停或改变，本轮结果未保存」。`assertCurrent` 里的 `beforeEffect` 在租约丢失时也会抛。抛出的事务回滚，助手回复和系统句都不会留下。这个抛错被 `fireScheduleWakeup` 收成一次失败叫醒，tick 继续往下走。
- 同一次 tick 在 `inner.tick` 返回之后调用 `rescheduleEnabledConversationTasks`（`apps/local-host/src/schedule-runtime.ts` 第 132–135 行，实现在 `wakeup.ts` 第 96–107 行）。此时 job 已禁用，执行记录也已在 `fireScheduleWakeup` 的 `finally` 里拿掉，任务记录仍是启用，于是马上 `registerConversationJob`，按当前时刻登记下一天。下一天在这一轮 tick 结束前就登记了，不是等下一次 30 秒 tick。

错误结果：这一轮的模型结果或「到点了，但这一轮没跑成」都不会出现在对话里。同一次 tick 结束前，下一天的 once job 已经登记。使用者看到的是空的这一轮，而不是失败说明。任务没被改、租约还在时，模型错误仍会写入那句系统说明；那种情况下，同一次 tick 结束时也会登记下一天，那是每天一次的正常接续。

现场没有跑这条。空 Home 没有文字模型，也没有已经到点的定时对话。没有从正在使用的 Home 复制密钥。结论停在源码。

### 5. 表单 AI 拟题：回答在题目落库之前就从内存里删掉

触发：表单已经问过补充题，使用者答完，模型返回了题目，但题目校验失败，或随后的写入失败（版本冲突、写入前的 `beforeEffect` 失败）。

路径：

- 页面在 `plugins/native/form/src/browser/draft.ts`。点「AI 生成题目」会先 `save`（`browser/commands.ts` 第 175–177 行），再 POST `expected_version` 为当前打开问卷的版本（`draft.ts` 第 33 行）。模型先要补充时，页面用工作台的问题卡收集回答，提交时带上同一个 `interaction_id` 和卡里的值（第 45–51 行）。请求失败时卡片还在；只有带回字段错误时才标在字段上，其他失败变成一句说明（第 39–42 行）。
- 服务端 `plugins/native/form/src/drafting.ts` 第 118 行：已有回答时，`kept.delete(interaction_id)` 发生在 `drafted()` 之前。回答本身不合法会在第 103–104 行先抛出，那时 Map 还在，同一张卡可以再交。
- 第 127–128 行才检查 `reply.status === "done"` 并调用 `drafted()`。校验抛错时，内存 Map 里那份问答已经没了。
- `plugins/native/form/src/actions.ts` 第 104–110 行：拟题前用当时的 `current.version` 做冲突检查是对的；模型返回 `drafted` 之后，`write` 用的仍是拟题前读到的 `current.version`。这次写入失败时，题目没有追加。`kept` 只活在这个进程里。再交同一张卡时，`answered`（`drafting.ts` 第 98–99 行）找不到这条 interaction，抛「这几个补充问题已失效，请重新生成」。

错误结果：题目没写上。屏幕上的问题卡还可以看见刚才的选择，再提交会被拒绝。只能重新生成、重新作答。模型在已有回答之后仍返回 `needs_input` 时抛「回答之后模型仍没有拟出题目」（第 119–121 行），这是「只问一次」的设计；删除同样发生在抛错之前，这份回答一样不能再交。

现场没有跑这条。拟题要文字模型，空 Home 里没有。不合法的回答在删除 Map 之前就会被拒绝，那一段没有另做点击。结论停在源码。

### 6. 放置移动：插件库先提交，位置边后写，失败后按原项目找不到对象

触发：把 Pages 文档或数据表从一个项目移到另一个项目。插件已经改完自己的行，接着权限复查或位置账本写入失败。

路径：

- `horizontal/placement/src/index.ts` 第 268–287 行：`move` 先 `invoke` 插件的 mover，插件返回后才 `beforeEffect`，再 `ledger.commands.put` 位置边。
- Pages 的 mover 在返回前已经提交：`plugins/native/pages/src/store.ts` 第 317–328 行，`project_id` 改到目标，并清空 `folder_id`、`goal_id`、`artifact_id`、`artifact_version`。
- 数据表同样在自己的事务里提交：`plugins/native/dataset/src/store.ts` 第 103–113 行，改 `project_id` 并清空成果编号。
- 没有位置边时，`locate`（`placement/src/index.ts` 第 70–72 行）保持调用方传来的旧 `project_id`。
- 复制走同一顺序（第 317–332 行），但请求带 `request_id`，同一次请求能再得到同一份副本。移动没有这个键。

错误结果：动作报失败，对象已经在目标项目里，成果指针也已经被清掉。账本仍按旧项目找它，重试在原项目找不到这行。复制在请求号还在时可以靠同一次请求找回副本；移动不能。

现场没有复现这条拆开写。一次不受干扰的移动（文档 `e6fe4759-312f-48aa-ad88-6c1e4da2a364`）返回 200，Pages 行和位置边都写到了乙项目；再用旧的 `project_id` 重试，得到 `placement.same_location`（「它已经在这个位置」）。把整个 `placement.db` 提前锁住时，移动在插件提交之前就失败，状态 500，`error` 为 `database is locked`；松开后的重试把行和位置边一起写上了。想等 `project_id` 改完再锁账本的那次，读 Pages 库的连接干扰了写入，那次库不一致不能算产品缺陷。窗口仍按上面的源码成立，这次没有卡进「行已提交、边还没写」的那一段。

### 7. 炼金术士空闲回收：关闭完成前就把工作室从进程表里拿掉

触发：某个项目的炼金术士工作室超过 10 分钟没有被这个 Host 再取用，且 `idle()` 为真（没有进行中的动作、没有排空、没有在跑的 job）。此时又有一次动作来打开它，或项目删除和这次打开叠在一起。只是看着页面、没有再调用 `get()`，不算活动。

路径：

- 空闲时间：`apps/local-host/src/alchemist-service-host.ts` 第 22、83–88 行，默认 `STUDIO_IDLE_MS = 10 * 60_000`。
- `idle()`：`plugins/native/alchemist/src/studio/server/bootstrap/local-runtime.ts` 第 299 行，`!closed && !draining && inFlight.none() && !jobs.hasActive()`。
- `evict`（host 第 91–94 行）先 `studios.delete(key)`，再开始异步 `runtime.close()`。
- `get`（第 63–64 行）只有表里那条还在、并且 `closing` 已设置时，才抛 `alchemist.closing`。条目已经删掉时，`get` 会新建一套运行时，打开同一个 `studio.sqlite`。
- `deleteProject`（第 100–104 行）等待的是这次 `evict` 的关闭，然后 `rm` 目录。关闭过程中若 `get` 已经放入新的表项，删除仍会把目录去掉。
- Host 自己的 `close()`（第 113 行）是关完才从表里删除，那条路径上 `get` 还能看见 `closing`。问题出在空闲回收和删除项目用的 `evict`。

错误结果：同一份 `studio.sqlite` 上会叠两套运行时。项目删除时，目录可能在后打开的那套还在用的时候被删掉。

现场没有跑这条。空闲阈值是 10 分钟，而且 `WebServerOptions` 上没有 `idleReclaimMs`。Host 自己的 `close()` 是关完才删表项，那条顺序没有问题。结论停在 `evict` 的源码。

### 8. 表单页：放置条移走正在编辑的问卷时，未保存修改被直接丢掉

触发：问卷正打开着，标题、说明或题目还没保存（400 毫秒计时器还在，或保存失败），或者预览里有未提交的填写。此时放置条把这份问卷移走。

路径：`plugins/native/form/src/browser/client.ts` 第 48–52 行。`molis:placement-changed` 且 `mode === "move"`、打开的就是被移走的那份时，直接 `closeEditor()`。`closeEditor`（`browser/list.ts` 第 94–100、67–74 行）清掉计时器、把 `dirty` 设为假、丢掉 `sel`，没有调用 `save`。返回、切换、新建、拟题、发布会先 `save` 或 `leaveEditing`（`browser/commands.ts` 第 31–33、89–104、175–177 行）。`hasUnsaved`（`browser/page.ts` 第 90 行）只用于重新读取前的确认和离开页面前的提示。

错误结果：编辑器关掉。目标位置上的问卷是上次已经落库的题目。还在计时器里的修改和预览里未提交的填写都没送出。

现场（无头 Chrome）：问卷 `5ec344d2-1d9e-4c36-a005-8226c4051fae`，已保存标题「问卷原标题」，版本 1。编辑器把标题改成「问卷还没保存」后，在本页发出 `molis:placement-changed`（`mode` 为 `move`，`kind` 为 `form`）。工作区变为隐藏，标题输入框里仍是「问卷还没保存」，期间没有任何 POST。服务端标题仍是「问卷原标题」，版本 1。这次没有另调放置移动接口；核对的是放置条会派发的这个事件把未保存修改丢掉。预览里未提交的填写没有另点一遍。

## 各场景的性能代价

代价写成「什么在重复、随什么变大」。本次没有重测秒数或 CPU。旧笔记里的 Inbox 1.6–2.5 秒不能当成这次的测量。

### 项目后台调度

Web 服务起来后，每 30 秒一轮（`web-project-schedulers.ts` 第 49–50 行）。第一轮按目录顺序打开每一个有数据库的项目；打开会注册内建动作并准备已安装插件，成功后运行时留在内存里，不随离开页面释放。打开成本随项目个数线性增长，而且是一个接一个。`openAll` 若超过 30 秒，`periodic-tasks.ts` 第 30 行会跳过下一轮。`round()` 不 await 各个项目的 tick，慢的 tick 可以和下一轮叠在一起。项目数越多，常驻运行时和每轮 tick 次数越多。本次未重测。

### 搜索

一次查询在 `horizontal/search/src/index.ts` 第 189–193 行对调用方可见来源列两遍，中间夹着 `purgeDisabled` 和 `catchUp`。`catchUp` 预算默认 1.5 秒，来源新鲜窗口 3 秒（第 154–155 行）。命令成功后 `markChanged` 会在约 800 毫秒后刷新（第 155–161 行）。

工作台全局搜索（`apps/workbench/src/scripts/client/global-search.ts` 第 179–203 行）输入停 140 毫秒后 POST `/api/search/query`。任一来源仍是 `indexing` 时，对话框开着且查询词没变，就每 900 毫秒再查，最多 12 次。重复的是整次查询加来源追赶，次数随「还在建索引的来源」和使用者继续看着对话框变多。

搜索条目分页在 `packages/contracts/src/platform/search-sources.ts` 第 105–116 行：每次要一页，都对插件交来的整表排序、查重、对全部身份和版本做哈希，再切片。Pages 的条目来自 `store.list` 整库（`plugins/native/pages/src/actions.ts` 第 156–158 行）。工作随该插件在这个项目里的对象数增长，不随页大小下降。Pages 库内搜索是客户端对已加载列表过滤并重画（`client.ts` 第 450–463、861–863 行），每次按键都重画当前可见行。本次未重测。

### Pages

自动保存是一条队列加 400 毫秒去抖（`client.ts` 第 661–672 行）。返回、切换、新建、发布会先把队列走完。收藏、移动、删文件夹不进这条队列，这是上面第 2 条的逻辑问题，也是额外的一次整表 `loadList`。

库内列表每次 `loadList` 都拉全部文档和文件夹再整表重画（第 626–632、450–475 行）。文档数和文件夹数上去之后，一次星标或一次按键搜索都重画整份列表。本次未重测。

表单列表：`plugins/native/form/src/browser/list.ts` 第 115–121、49–56 行。每次 `loadList` 拉全部问卷，`renderList` 用 `replaceChildren` 重画每一行。页面没有定时轮询；会在模型就绪和放置变化时再拉一次（`browser/client.ts` 第 46–54 行）。行数随问卷数增长。本次未重测。

### Feed / Home / Inbox

首页事件：`apps/workbench/src/scripts/client/project-home.ts` 第 399–421 行。停在 Home、页面可见时，每 30 秒 POST `/api/home/events` 并重画；切回可见也会立刻再要一次。请求按当前时间窗整段拉取。本次未重测，也没有核对服务端是否对相同 HTML 做跳过。

注意力：`apps/workbench/src/scripts/client/attention.ts` 第 79–101 行。页面可见时每 15 秒一次 `GET /api/attention`，另外在回到前台、点插件栏（300 毫秒后）和 `molis-work:attention-refresh` 时再读。这是当前的合并读法。旧的后台任务 10 秒、插件通知 30 秒、助手通知 20 秒三条轮询已经不在这条路上。

Inbox 判断：`navigation-inbox.ts` 第 222–231 行。一次「判断」最多取 20 条 `open` / `in_progress`，POST `/api/inbox/judgment/evaluate`，然后 `refreshInboxStage()` 把整个 Inbox 舞台再拉一遍、再画一遍。重复的是「最多 20 条判断 + 整舞台刷新」，随待处理条数（上限 20）和舞台里的行数变大。历史秒数本次未重测。

### 助手与 Coding

助手工作列表：`assistant-island.ts` 第 1530 行。面板打开且页面可见时，每 15 秒 `loadWorks()`。这和上面的 `/api/attention` 是另一次请求。通知按钮走的是 attention 事件，没有再挂一条 20 秒计数轮询。

Coding 开一轮：`plugins/native/coding/src/start-round.ts` 第 136–144 行。`#560` 没有改这个文件。已有运行时会话时，`earlierRuns()` 先 `readSession`，再对每一个历史 run `readRun`。`nextHistoryMode` 只用最新一轮，但这一次已经把全部历史读进来；后面若要写摘要，`digestFor` 复用同一份缓存。历史轮次越多，开一轮之前的读取越多。摘要模型调用是额外一次，只在需要摘要时发生。本次未重测。

Coding 外部等待（`#560`）：构建者可以用 `board-wait` 登记一步外面的条件（`plugins/native/coding/src/roles.ts` 第 105–106、220 行）。宿主在 `horizontal/agent-host/src/adapters/prologue-checkers.ts` 里查看：`molis.action-query@1` 每次查看都 `discover`（第 135 行）再 `invoke`（第 158 行）那个只读查询；`molis.file-present@1` 每次查看都再核对目录是否仍授权（第 186 行），并对路径做 `realpath` / `lstat`（第 168–178 行）。查看次数随还在等的步数和 SDK 的有界日程变多。本仓库的注释写明，这个日程在 SDK 里；这里没有读到秒数，本次也未重测。声明了 `model:invoke` 的查询会在查看时被拒绝（第 144 行），避免每次查看都打一次模型。

### 成果与放置

成果头读取：`modules/artifacts/src/repository.ts` 第 173–186 行。`latestVersion` 调用 `listVersions`，把该成果的每个版本行（含 payload）都查出来再取最后一条。`listArtifacts`（第 189–203 行）按项目查出全部版本行，在 JavaScript 里按类型、schema、scope、生命周期过滤。列表和「只要最新版」都随版本行数增长，过滤不发生在 SQL 里。本次未重测。

插件输入：一次成果或过程项提交后，`apps/local-host/src/plugin-artifact-refresh.ts` 第 15–33 行在事务结束后 `evaluateAll()`。另一个进程的写入靠 30 秒兜底。`evaluateAll`（`packages/plugin-runtime/src/wiring.ts` 第 342–344、270–289 行）对每个已启用插件 `#resolve`：解析必填端口、拼签名；签名与上次相同才返回，不投递。解析本身每次都做。启用插件越多、绑定的成果越多，每次提交后的空转解析越多。

放置描述和移动本身的逻辑问题见第 6 条。移动的额外代价是插件提交和账本写入分成两次，失败不能一起回滚；这不是耗时问题。

Goal Tree 决定：`plugins/native/goals/src/goal-tree-decision.ts` 第 48–50、266 行包在 `executeGoalTreeDecision` 里，而 `modules/governance-collaboration/src/proposal-operation-store.ts` 第 52–55 行的 `execute` 使用 `repository.immediate()`。回调里的 `goalTreeSemanticReview` 会 `analyzeChange`，再跑 `planningMetrics`（`modules/goals/src/planning/goal-graph.ts` 第 216–250 行）：对活跃目标做拓扑分层（队列每步排序）和下游链长。目标数和关系数上去时，这段计算占着治理库的写事务。本次未重测。`part_of` / `depends_on` 成环在恢复事务里会被拒绝，那条旧缺陷不在本报告的未修列表里。

## 核对过、在这个提交里成立的路径

这些曾经像缺陷，当前源码里行为与设计一致，不列入上面的未修项。

- 动作权限：异步校验之后，生效前会再同步核对当前授权；MCP 会重读授权文件。只有「最后一次 await 期间目录身份变了、授权文件却没变」才可能漏过，这次没有找到使用者走得到的入口。
- Goal 恢复：`part_of` / `depends_on` 成环在同一事务里拒绝。
- Pages 返回、切换、新建、发布会先 `persist`。打不开的正文保持只读。版本冲突本身会拒绝覆盖，这是对的；第 2 条的问题是星标/文件夹先把版本推走，编辑器还拿着旧版本。表单页返回、切换、新建、拟题和发布会先 `save` 或 `leaveEditing`；放置条移走当前问卷不会，见第 8 条。
- 搜索在 `catchUp` 之后再列一次来源，用来丢掉查询期间被收回的来源。
- interval 任务在处理前把 `next_due_at` 推到下一次，并用租约避免重入。once 的定时对话在处理前只把 job 的 `enabled` 写成 0，到期时间保持刚触发的那一次；下一天由同一次 tick 结束时重新登记。写不进失败句，是因为失败句复用了「任务已变就拒绝写入」的断言。
- `#560` 的外部等待：登记时拒绝写入、判断、导航，以及不在这一轮里的动作；每次查看再核对授权。要调用模型的查询不能拿来反复看。规格里记下的实模型评测失败（参数写成 `{"item": ...}`）按该提交的说明归在模型写法，不作为检查器的逻辑缺陷。
- 函数预览用预览前的 `updated_at` 做比较；预览期间草稿被改过就返回 `stale_preview` 并不写入。发布仍要求草稿状态。
- 助手发送失败时，未送出的用户句留在工作草稿里。Pages 评论回复按 `request_id` + `run_id` 去重。工作流交接按可恢复来做（幂等接收、停住的投递另记），和放置那种「库已提交、边没写上」不是同一类。
- Coding 父会话停止不会自动取消另一套 `coding.delegate` 信件。那是另一条委托，不是助手子工作没停。`start-round.ts` 的历史读取不在 `#560` 的改动里，行号仍是第 136–144 行。
- `#568` 把项目上手的文字调用拆到 `apps/local-host/src/configured-text-port.ts`，记在 `system:onboarding` 名下，调用时不再套 Cognia 的角色。提示词里的每批 8000 字符上限与 `context-onboarding-service.ts` 第 167 行的退回一致。这次没有把它当成新的逻辑缺陷。
- `#578`：项目运行时的打开失败后，关闭不再等待那个失败的 Promise（`apps/local-host/src/local-host.ts` 的 `closeOpened`）。这修的是「打开失败拖住整个 Host 关闭」。它不补开第 1 条里没打开的项目。
- `#582`：已经在 `runtimes` 里的项目，tick 失败会写一次 `schedule` / `round_failed`。打开阶段的 `project_schedulers_not_started` 仍然只记一次，下一轮不重试 `openAll`。

## 这次没有做的事

- 浏览器是无头 Chrome，走的是产品测试用的启动方式。没有打开看得见的窗口，也没有接上端口 4173 上正在跑的服务。
- Home 是临时目录里新建的空目录。没有读写 `~/.molis-work`，没有动预览数据。
- 第 4、5、7 条没有现场跑。第 6 条现场没有复现拆开写。第 2 条的文件夹移动和删除文件夹只核对了与收藏相同的源码，点击只做了收藏。
- 没有跑完整测试，没有安装依赖，没有占用端口 4176。
- 没有现场计时。文中不出现本次测得的秒数或 CPU。
- 没有核对 VoiceOver、中文输入法或原生窗口卡死。
- 个人插件移除（产品上尚未决定）和 Prologue 资源收回（代码侧已有修复、这次没有用 Molis 再测）不作为新缺陷。

## 若要修，建议的顺序

这次没有改代码。顺序按「静默影响面」和「数据已经写出去、回不来」来排：

1. 调度打开失败后清掉 `opening` 并在下一轮重试；tick 失败要能进 `last_error`。
2. 炼金术士在 `close()` 完成前保持表项，让后来的 `get` 看见「正在关闭」。
3. Pages 的收藏、移动、删除文件夹走同一条保存队列，或与正文一起带 `expected_version`。
4. 定时对话的失败句不要使用那条会拒绝写入的 `assertCurrent`。
5. 表单回答在题目成功写入之后再从 `kept` 删除。放置条移走当前问卷时，先走保存队列再关编辑器。
6. 放置移动让插件提交和位置边同一成败；失败后按目标项目还能找到对象。
