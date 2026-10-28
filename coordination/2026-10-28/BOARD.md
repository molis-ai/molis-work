# 看板

只有统筹改。这里只写不会变的：派给谁、顺序、依赖、锁定的文件。任务现在走到哪一步，由 `next.mjs` 从分支、PR 和评论推出来：

```bash
node "${TMPDIR:-/tmp}/next.mjs" --role status
```

取法见 README 第 12 节。「派给」写「池」的，A、B 谁空谁领。`specs/BACKLOG.md` 和 spec 的进度表是只加、删自己行的文档，不锁；`specs/repository-anti-corruption/slices/w6-02-lifecycle-rest.md` 由 T-003、T-005 各改自己的行。

## 任务

| 任务 | 标题 | 档 | 派给 | 顺位 | 依赖 | 锁定的文件 |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | 删掉 Feed 两个没有调用方的读取函数 | 丙 | A | 1 | — | `plugins/native/feed/src/store/items/index.ts`、`plugins/native/feed/src/store/listener.ts`、`tests/owner-readers.test.ts`、`plugins/native/feed/README.md`、`docs/system/HOME-DATA.md` |
| T-002 | privileges 状态列收口与 BACKLOG 清理 | 丙 | B | 1 | — | `specs/repository-anti-corruption/privileges.md` |
| T-003 | 给 Feed、Inbox 各加一项生命周期用例 | 乙 | A | 2 | — | `tests/shipped-plugin-lifecycle-feed.test.ts` |
| T-005 | 双实例插件 Home 一半停用后不再答裸 404，加回置物架走查 | 甲 | B | 2 | — | `apps/local-host/src/home-plugin-http.ts`、`tests/dual-instance-routes.test.ts`、`tests/fixtures/shipped-lifecycle.ts`、`tests/shipped-plugin-lifecycle-personal.test.ts`、`specs/dual-instance-plugins/spec.md` |

## 在途，不走任务书

这些文件正被本机线或 Codex 改着，任务不碰。

| 在途 | 线 | 锁定的文件 |
| --- | --- | --- |
| BL-810 助理只认 not-found 码 | 本机 ac-sweep | `apps/local-host/src/assistant/` |
| R-70 / BL-813，BL-814 Runtime 动作调用路径的成本 | 本机 C 线 | 开工时补 |
| W5-11 第 3 片起 | 本机 OAuth 线 | 开工时补 |
| W5-16 B2b，不碰真实 Home 的部分 | Codex | 开工时在 #1332 报 |
