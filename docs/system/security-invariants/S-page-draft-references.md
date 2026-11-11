# S-page-draft-references

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-page-draft-references | 页面交接的正文不放 URL，只带随机一次性引用；引用绑定调用上下文的用户、项目及用途。拒绝其他用户、项目或用途，且拒绝不会消费原引用；过期、重复消费与取消请求拒绝。草稿十分钟到期，单 Home 最多一百份，关闭宿主清理；仅当前 user 动作可用，不写业务库 | `apps/local-host/src/contextual/draft-references.ts` 的 `DraftReferences`；`apps/workbench/src/settings-memory.ts`；`apps/workbench/src/scripts/settings.ts` | `tests/security-invariants-draft-references.test.ts`「draft references expire, consume once and refuse another actor, project or purpose」 | — |
