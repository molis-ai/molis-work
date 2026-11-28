# 统一工作分区：分区存储、总览表、推送与依赖

个人空间（`personal`）和每个项目是同构的「分区」（[统一工作分区](../../specs/unified-partition-plugins/spec.md)）。一个插件装一次（Home 一张安装表），在哪个分区启用就在那个分区有自己的一份数据。本页四节写插件怎样声明；字段都在 Manifest，类型在 `@molis-ai/molis-work-contracts/platform/plugin`，由 SDK 的 `partitionDeclarationProblems` 检查（`parsePluginManifest`／`assertManifest` 与安装都会跑它，写错了装不上）。

> 现状（第 108 批）：这些字段和 SDK 帮手已经可以写、会被检查；Pages、PPT、Form、Dataset、灵光、Workflows（第 107 批）与 Todo、Jelly、Issues、Cognia、Images（第 108 批）已经用 `databases.partition`，由宿主的按分区装配在每个启用它们的分区各跑一个实例（安装记录在 Home 一张安装表，运行状态按「安装 × 分区」分开记）；到期定时器随宿主起停，同步写入与恢复后标记总览待重读。个人空间总览（`overview.read@1`，本人与经本人授权的个人助理）、到期投递与随人设置已经接上（第 108 批）；推送与随启用在第 109–111 批接上。新插件照本页写，不要再用旧的「个人插件 / 项目插件」两套写法。注意：从产品入口装的签名包眼下仍由项目平台按项目装、按项目跑（第 109 批接到按分区装配）；这之前带 `databases.partition` 的签名包在项目里起不来（项目平台拒绝替它开分区库），内置插件以外先别用。

## 分区存储

- **一份库在每个分区**：在 `databases.partition` 写一份库声明（`store_name`、`version`、`schema`、`read_permission`、`write_permission`，与 `databases.home` 同一种写法）。平台在 `<分区根>/libraries/<store_name>.db` 给每个启用你的分区开一份，分区根只由平台求（个人空间是 `<Home>/personal-space/`，项目是 `<Home>/projects/<id>/`）。
- **你拿不到别的分区**：插件实例按（插件, 分区）起，只看得到自己分区的库和 `plugin-files/<安装>/`；路径写 `..`、链接或别的分区一律被拒（`S-partition-isolation`）。不要在输入里收 `partition_id` 或 `project_id` 来决定读哪份——分区由调用上下文给。
- **删项目与确认框**：删项目时平台把这个分区的整份库删掉，插件不跑自己的代码；确认框里这一行写在 `databases.partition.deletion`（`label` 写无参词键或一行文字，`order` 定先后），不写就是「{插件名} 在这个项目里的数据」。
- **固定成果版本**：要把对象的某一版存进成果库（`artifacts.produces`），在 `databases.partition.pinned_rows` 写记版本的那张表（`table`、`id_column`、`version_column`、`artifact_id_column`、`artifact_version_column`、`write_columns`，可选 `pending_column`）。平台把这一行和成果库的那一版放进**同一个事务**提交，你不自己附库、不写跨库语句；附进来的只会是本分区的主库。
- **跨分区移动、复制**：由平台搬（放置服务读出、在目标分区放入、再去掉原来那份），你只声明三个动作，类型帮手在 `@molis-ai/molis-work-contracts/platform/actions`：
  - `defineObjectExportAction`：把一个对象读成一条自含的记录（`record`）和它现在的修订号（`revision`）；只在本分区有意义的东西（文件夹、Goal、固定的版本）不放进记录。
  - `defineObjectPutAction`：把带来的记录放进本分区。带 `target_id`（移动）就用原 id；这个 id 在本分区已有对象时，只认完全相同的一份（`sameCarriedRecord`，同一次移动的重试），不同就报冲突、绝不覆盖。不带（复制）就建新对象，同一个 `request_id` 总是同一份。
  - `defineObjectRemoveAction`：移动后去掉原来那份，只在仍是读出时的修订号时去；改过了就报冲突，平台把放进去的那份撤回。
  - 不要在动作输入里收目标项目，也不要自己去打开别的分区的库。这三个动作只给本人用（`audiences: ["user"]`）。
- **库结构只有现行一版**：`schema` 写完整的当前结构；开发前阶段（[CONTRACT-CHANGES](../../docs/system/CONTRACT-CHANGES.md)）所有分区库固定 `version: 1`，改结构直接改 v1 `schema`、零 `upgrades`、零兼容读取，旧开发 Home 直接清空重建，不写迁移也不问是否保留旧 Home。
- **随本人走的设置不放分区库**：本人在任何分区都一样的偏好（默认服务、上次用的文件夹）声明在 `person_settings.keys`：每个键写 `key` 和 `kind`（`preference`、`secret_ref`、`connection_ref`、`local_path`）。只有 `preference` 能写 `portable: true`，跟着本人同步到他的其他设备；密钥引用、连接引用、本机路径标 `portable` 会被拒（`S-person-settings-private`）。这些设置只给本机本人和你自己的后台读写，项目 Agent、助理和别的插件都读不到。

```json
{
  "databases": { "partition": { "store_name": "todo", "version": 1, "schema": "CREATE TABLE todos (...);\n<OVERVIEW_TABLE_SQL>",
    "read_permission": "todo:read", "write_permission": "todo:write",
    "deletion": { "label": { "key": "todo.project-deletion.data" }, "order": 10 },
    "pinned_rows": { "table": "todos", "id_column": "id", "version_column": "version", "artifact_id_column": "artifact_id",
      "artifact_version_column": "artifact_version", "write_columns": ["updated_at"] } } },
  "person_settings": { "keys": [
    { "key": "default_list", "kind": "preference", "portable": true },
    { "key": "export_folder", "kind": "local_path" }
  ] }
}
```

## 总览表与到期提醒

个人空间要能一眼看到所有分区的待办、日程、通知和简报，又不能为此把每个项目都启动起来。做法是：**你在自己的分区库里维护一张平台定好格式的总览表，平台只读它。**

1. 在 Manifest 写 `overview_projection: { kinds: [...] }`，种类只能是 `task`（待办）、`event`（日程）、`notification`（通知）、`brief`（简报）、`background_task`（还在跑的后台工作）、`scheduled_run`（定时运行）；可选 `title_text` 给总览里的显示名。不写列名映射、不写 SQL。数据留在分区主库的插件（没有 `databases.partition`）不建这张表，而是在写业务数据的同一事务里经 `services.overview.join(tx, rows => …)` 写主库里平台管的那张（写入方安装由平台盖章，第 108 批 V17，S-49）；写法同下。
2. 从 `@molis-ai/molis-work-contracts/platform/plugin` 导入 `OVERVIEW_TABLE_SQL`（表名 `molis_overview_rows`）原样放进 `databases.partition.schema`，少了装不上。
3. 写业务数据的**同一个事务**里用 SDK 的 `overviewRows(tx)` 顺手更新：`upsert(kind, row)`、`remove(kind, rowId)`、`removePrefix(kind, prefix)`。帮手按种类检查每一行（标题长度、带时区的时刻、待办状态 `open`／`done`／`cancelled`、优先级 0–3、标签数、合法 IANA 时区、通知级别 `info`／`warning`／`urgent`），每个种类最多 `OVERVIEW_ROW_LIMIT`（500）行，超了以 `actions.input_invalid` 拒。

```ts
import { overviewRows } from "@molis-ai/molis-work-plugin-sdk";
await services.database.transaction(caller.beforeEffect, tx => {
  tx.run("UPDATE todos SET done = 1 WHERE id = ?", [id]);
  overviewRows(tx).upsert("task", { row_id: id, title, status: "done", remind_at: null, updated_at: now });
});
```

- **重复日程**：由你展开未来一段时间（`overviewEventWindowEnd(now)`，90 天），到期前滚动续展；row_id 用「系列/日期」这类前缀，换系列时 `removePrefix` 一次删掉。
- 需要在插件后台使用本人设置时，在 `start` 中先读一次，再登记 `context.services.personSettings.onChange(refresh)`。本机编辑或其他设备的设置同步到达后，由活跃实例重读。回调只收到变更信号，读取仍由安装的本人设置服务核权。
- **平台怎么读**：只读连接（`SQLITE_OPEN_READONLY`），不运行你的代码、不起你的实例；每行的分区和安装由平台从读的位置盖章，你写不了也冒充不了。同步写入或恢复将该库标成待读，有提醒的写入及时校准到期登记。总览前台至多开一个源库，多库待刷新时，宿主后台逐库读。页面收到 `updating: true` 时展示已返回的摘要和更新提示，并重新查询直到刷新完成。收到 `incomplete: true` 时提示部分来源暂时读不到。只有仍在刷新的来源才需要自动再读。插件在分区停用、卸载或分区删除时，平台立刻删掉对应行。
- **谁能看**：本机本人看他现在能读的分区；个人助理只看本人授给它的分区和摘要字段；项目 Agent、MCP、工作流和别的插件看不到。总览只放摘要，不放正文；`row_id` 会随行交给能看总览的读者，只写对象的标识，不要拼进标题或正文。
- **到期提醒从这张表来**：待办和日程的 `remind_at` 由平台交给到期登记表，到点只唤醒你在那个分区的实例，别的分区不动（`S-partition-wake-scope`）。另一台设备同步来的提醒也会响；同一个键、同一个时间只响一次。到点后满七天才处理到的不再执行，只记为过期（第 95-3 批的规则）。不用另外自己登记这类提醒。

## 推送声明

个人空间里的对象可以推一份到项目（第 111 批落地）。现在先声明 `push.kinds`，每种写：

- `kind`：对象种类；
- `export_action` / `put_action`：你自己的两个动作，就是上面跨分区搬运用的那两个（`defineObjectExportAction` 与 `defineObjectPutAction`，输入类型 `molis.push.export.input.v1`、`molis.push.put.input.v1`），只能写你自己 Manifest 里的动作；
- `revision`：导出记录里递增版本的 JSON 指针（如 `/revision`）；
- `local_refs`：只在源分区有意义的字段（指针 + `strip` 去掉或 `remap` 改指推过去的副本）；
- `children`：导出时一起带走的子记录。

推送只复制，不移动，源分区的对象原样留着；目标分区里那份是新对象、归目标分区。

## 依赖与随启用

- `market.category`：插件在市场和插件选择器里归哪一类，八类之一：`write`、`plan`、`data`、`media`、`knowledge`、`develop`、`inform`、`automate`。
- `dependencies`：同一分区里你依赖的其他插件（最多 16 条），每条写 `plugin_id` 和给人看的 `reason`（直白一句话，说没有它会怎样）。
  - `enable_with: true`：本人在一个分区启用你时，平台一并启用它，所有插件同一条规则，代替以前写死的「伴生插件」；
  - `optional: true`：没有它你也能用，平台只提示、不强制。
- 不能依赖自己，不能写同一个插件两次。依赖只说明关系，不给你调用它的捷径：跨插件仍只走公开动作与合同。

## 自查

- [ ] 业务数据在 `databases.partition`，没有按输入里的 `project_id` 选库
- [ ] 能移动的对象声明了读出、放入、去掉三个动作；放入遇到已有的同一对象只认完全相同的一份
- [ ] 声明了 `overview_projection` 的，`schema` 里有 `OVERVIEW_TABLE_SQL`，业务写入和 `overviewRows` 在同一个事务
- [ ] 提醒写在总览表的 `remind_at`，没有自己再造定时器
- [ ] `person_settings` 里只有 `preference` 标了 `portable`
- [ ] `push` 引用的都是自己的动作；`dependencies` 每条都有给人看的 `reason`

### 用自己的提醒和本人的总览

Todo 的 [投影写入](../../plugins/native/todo/src/overview.ts) 与 Jelly 的[发生项](../../plugins/native/jelly/src/overview.ts)在更新业务记录的事务里给 `overviewRows` 写入 `remind_at`。平台从提交后的本地或同步写入维护登记。对于插件自己的超时任务，可沿用 Images 的[队列回调](../../plugins/native/images/src/plugin.ts)。

```ts
// context 是这个分区的启动上下文。entry_key 在该分区、该安装内稳定。
context.services.due?.register({ entry_key: job.id, due_at: job.deadline });
```

到期回调用第二个参数的 `beforeEffect()` 复查权限，再把结果写进本分区业务库。通过 `{ reminder: { title, open } }` 返回用户原文和打开目标。工作中断时在提醒上加 `interrupted: true`，助理会按查看时的界面语言说明原因。宿主等待通知接收成功才确认交付。重复交付同一键与时间时读取已完成的业务结果。

受保护的工作台页面用宿主已验证的本人会话读取任务。下例可放在工作台的个人空间组件内：

```ts
import type { OverviewReadResult } from "@molis-ai/molis-work-contracts/platform/plugin";
const { rows } = await globalThis.molisWorkRequest<OverviewReadResult>("/api/runtime/overview/read", {
  method: "POST", body: { kinds: ["task"], limit: 100 },
});
```

路由检查本人页面身份，经 `overview.read@1` 取出可读分区和当前字段。个人助理从动作目录调用同一动作，按本人授予的项目与字段读取。插件提供本分区投影，其 SDK 调用不能代读个人空间。见[工作台路由](../../apps/local-host/src/runtime-overview-http.ts)、[总览动作](../../apps/local-host/src/overview-actions.ts)和[页面使用位置](../../apps/workbench/src/browser/personal-tasks.ts)。本次休眠同步装配支持声明了 `partitionSync` 的内置分区插件；外部签名包的能力见[沙箱入口](../../apps/local-host/src/plugin-host-services.ts)。

滚动窗口在 Manifest 声明 `overview_projection.rolling_window: true`。从分区移除后再启用，若原分区库仍在，平台为该安装登记一次立即到期的窗口刷新。首次启用空库由插件按实际写入自行登记。有滚动窗口的插件可用 `services.due.register` 登记合同常量 `OVERVIEW_REFRESH_ENTRY_KEY`。即使关机超过七天，平台也只唤醒原分区的原插件来重建当前窗口。处理器在提交前调用 `beforeEffect` 并登记下次刷新。此键不产生用户通知；普通日程的漏提醒仍以七天为限。
