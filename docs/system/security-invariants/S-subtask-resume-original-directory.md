# S-subtask-resume-original-directory

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-subtask-resume-original-directory | 重开 Host 后，Coding 子任务接续只能为原 owner 已获准的同一 canonical directory 取得新根。目录退权（含存储异步准备期间）、只剩另一目录的许可、指向其他目录的链接替代原路径、操作者与原 owner 不同均拒绝。原答案保留在原 Session，子模型零调用。独立工作区须匹配原工作区标识和根引用，SDK 精确核父子与 Run，新根沿用原权限上限。 | `horizontal/agent-host/src/adapters/prologue-node-port.ts`、`horizontal/agent-host/src/adapters/prologue-effects.ts`、`horizontal/agent-host/src/adapters/prologue-subagent-conversation.ts` | `tests/prologue-subagent-conversation.test.ts`「after normal shutdown and resumes only its queued answer」 | |
