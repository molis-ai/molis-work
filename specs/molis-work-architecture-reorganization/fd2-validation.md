# FD2 Feed / Attention 正式事实迁移验证

Goal：`goal-reorg-fd2`  
Contract revision：1  
验证日期：2026-09-02  
完成等级：功能可用（Feed / Attention 的正式事实与恢复链已迁移；Provider Plugin 与 Web/UI 最终退出分别由 FD3、FD4 继续）

## fd2-boundary

FD2 已把 Feed 和 Attention 分成两个唯一 owner，并通过公开 Contract 协作：

| Owner | 现在负责 | 明确不负责 |
| --- | --- | --- |
| `modules/feed` | Feed Item、Material、Signal 引用与 revision、read/archive/disposition、Goal link、Feed Event 和迁移 receipt | Source 连接、Listener 技术状态、Attention 状态、Goal 内容 |
| `modules/attention-resumption` | 需要用户注意的对象引用、reason、状态转换、Attention Event 与恢复查询 | 复制 Feed/Goal/Source 内容、决定 Feed 的业务事实 |
| `plugins/native/feed` | 声明 Feed/Attention public API 的应用级消费边界 | 在 FD2 提前接管旧 Web/UI 实现或直接访问数据库 |

两个 Module 的 Query、Command、Event、错误语义和迁移入口均由 `packages/contracts` 的公开 subpath 定义。Feed 只能调用 Attention public API；Attention 通过注入的 subject resolver 验证引用，不导入 Feed implementation 或 Store。

`pnpm workspace:verify` 扫描 48 个目标 package、79 个源码文件、51 个 import 和 47 条依赖边，结果 `errors=[]`。新增门禁还会拒绝旧 Feed Store、Relay import 和 Web Server 重新直接读写 `feed_items`、`feed_materials` 或 `inbox_entries`。

## fd2-legacy-exit

旧 `src/feed/store.ts` 已降为 744 行兼容 facade，不再创建或直接读写 Feed / Attention 正式事实表：

- `feed_items`、`feed_materials`、`feed_item_events` 和迁移 receipt 由 `modules/feed` 维护。
- `inbox_entries`、Attention 状态机与 `attention_events` 由 `modules/attention-resumption` 维护。
- 旧 FeedStore 的公开方法只做旧类型、错误和事件名称兼容，然后转发到新 Module API。
- `migrateFeedTables` 与旧 infoflow migration 已改为调用 Module migration，不在 facade 内保留第二套 schema 或状态规则。
- Relay 导入通过 `upsertImportedItem` / `upsertMaterial`，Goal promotion 查询通过 `findLinkedGoalItem`，不再跨 owner 直连 Feed 表。
- Connector 在 Signal 接受后把 `signal_id + revision` 交给 Feed；相同 Signal 的新 revision 更新同一 Feed Item，不再靠旧 projection 猜测身份。

Facade 仍保留旧产品入口所需的类型和展示兼容，这是有明确退出 Goal 的过渡层：FD3 搬走 Provider compatibility，FD4 搬走 Web/UI caller 后删除相应入口。

## fd2-result

当前正式链路已经是：

```text
durable Signal Receipt
→ Feed Module ingest/update
→ optional Attention public command
→ Feed / Attention repositories and events
→ compatibility facade for existing callers
```

可验证行为：

- 同一个 Signal 首次产生一个 Feed Item；Signal revision 增加时更新同一 Item，不重复创建 Item 或 Attention。
- Attention 只保存 `subject_type + subject_id` 引用；Feed Item 仍是唯一内容事实。
- saved / processing / archived 等 Feed 处置和 open / in_progress / done / dismissed 等 Attention 状态分别由各自 owner 校验。
- Feed 处置会通过 Attention public API 完成相应引用，没有跨表状态机或双写 owner。
- 新 Repository 关闭并重新打开 SQLite 后，Feed 内容、Signal revision、处置状态和 Attention 状态都能恢复。
- 手动加入 Attention 的内容处理完成后可以回到普通 Feed；由 Connector 规则产生的 Inbox Message 在后续创建 Goal 时仍保留来源含义。
- Feed Event 使用持久化插入顺序作为同一时间戳下的稳定次序，避免随机 ID 导致偶发乱序。

## 验证记录

| 验证 | 结果 | 说明 |
| --- | --- | --- |
| `CI=true pnpm workspace:verify` | 通过 | 9 个门禁规则、真实仓库边界扫描、48 package typecheck/build 全部通过 |
| `CI=true pnpm typecheck` | 通过 | 已迁 package 与旧根产品类型检查通过 |
| `CI=true pnpm build` | 通过 | 已迁 package、根产品和浏览器 PTY bundle 构建通过 |
| FD2 Feed/Attention 定向回归 | 通过 | 46 项：Module Repository、Signal revision、Attention、重启恢复、Connector、Source、安全、迁移和旧 Feed 行为全部通过 |
| Inbox Message 保存/重启/启动回归 | 通过 | 真实 Web 服务重启后创建 Goal，标题和绑定保持 Inbox Message 语义且不重复 Goal |
| `tests/install.test.ts` | 通过 | 16 项；workspace 依赖收集、自包含安装和安全边界通过 |
| `tests/e2e.test.ts` + `tests/uninstall.test.ts` | 通过 | 5 项安装、升级和卸载端到端场景通过 |
| 全量 `tests/*.test.ts` | 未全绿（已有基线问题） | FD2 新增回归已清零；唯一失败仍是未改动的 `tests/desktop-tui.test.ts:974`，测试要求旧的手写 `encodeURIComponent` 源码字符串，但 `src/web/pty-client.ts` 已使用 `URLSearchParams.set` |
| `git diff --check` | 通过 | 无 whitespace 错误 |

## 验收结论

| Criterion | 结果 | 结论 |
| --- | --- | --- |
| `fd2-boundary` | 通过 | Feed / Attention 各有唯一 owner，以公开 Contract 协作，自动门禁无违规 |
| `fd2-legacy-exit` | 通过 | Feed/Attention schema、Repository、状态机和 migration 已离开旧 Store；剩余 facade 有明确删除 Goal |
| `fd2-result` | 通过 | Signal → Feed → Attention 主链、幂等、revision、处置、事件和重启恢复均有真实测试 |

## 后续边界

- `goal-reorg-fd3`：把 GitHub、Gmail、RSS、Web Query、YouTube 的 Provider Driver / Adapter 搬入官方 Integration Plugin。
- `goal-reorg-fd4`：迁移 Feed Native Plugin UI、Web route/render 和剩余 caller，删除旧 Feed facade 的相应入口。

这些是已拆分的后续 Goal，不是 FD2 未完成项。
