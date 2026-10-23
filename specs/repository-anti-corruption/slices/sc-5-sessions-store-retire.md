# SC-5：退役的 `<home>/sessions/` 的维护工具（D6）

状态：工具与演练已实现（2026-10-24，迁移线 ac-sc3 片，叠在 SC-4b 的分支上，PR 等 SC-4 合入后再开）；真实 Home 上的执行不在本片，归用户本人。

## 1. 目标

SC-4 把 `<home>/sessions/`（`sessions.db`、`content/`、`content.key`）留成退役存储：没有代码打开它，只有备份集和 `uninstall --purge-user-data` 认得。D6 方案 A 的删除条件是：真实 Home 跑完 SC-5 的维护，再删掉保留机制登记和 `home-stores.ts` 里的这一行。本片给出这一步的工具，并在一次性 Home 里演练；不碰任何真实 Home。

## 2. 范围

- 加：`scripts/retired-sessions-store.mjs`。
  - `report --home <Home>`：只读。列文件与大小、库的表与行数、内容块数与字节数、`content.key` 是否存在；库先拷到临时目录再开，所以 Home 里不多一个 WAL 或 shm 文件；只报数量，不报消息、事件、交接的内容，也不读密钥。
  - `remove --home <Home>`：默认空跑，只说会删什么。`--apply --confirm <目录的绝对路径>` 才真删，且目录必须是真目录、里面没有链接、60 秒内没有任何变动（提示先停 Molis Work）。只删 `sessions/` 这一个目录。
  - `--home` 必填，不猜默认 Home；被拒绝的 `--apply` 退出码 1，参数错误退出码 2。
- 加：`tests/retired-sessions-store.test.ts`（一次性 Home 里的演练）。
- 改：`docs/releases/CHECKLIST.md` 第 4.3 节加一项（候选、未做、先弹窗问用户），`docs/system/HOME-DATA.md` 4.3 指到这个工具。
- 不做：在真实 Home 上跑；进产品（没有 `molis-work` 子命令，不接入启动流程）；任何读旧会话数据的代码。工具用完即删，删除条件见 CHECKLIST 那一项。

## 3. 验收

- **RAC-256**：`report` 不改 Home 里任何文件的内容、大小和时间，也不新增文件；输出里没有消息正文，也没有密钥内容；缺目录时说没有。
- **RAC-257**：`remove` 空跑不删；缺确认、确认串不对、60 秒内有变动、目录里有链接，都拒绝并保留目录；合格时只删 `sessions/`，别的存储不动，再跑一次什么也不找到；命令行缺 `--home` 退出 2，被拒的 `--apply` 退出 1。

## 4. 对调用方的影响

没有：不接入产品、不改动作、合同、公开 API。
