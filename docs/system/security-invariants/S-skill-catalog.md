# S-skill-catalog

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-skill-catalog | Skill 目录不授予权限。正文和资源读取须有 skills:read，且精确匹配当前安装、世代、签名、包与技能版本；关闭、停用、撤销或内容损坏时拒绝，不换版本。异步目录准备后读取一次发布者账本，并同步判断与读取。等待期间的撤销即使尚未停用安装，也会拒绝在途读取。manual 只认宿主按操作者和项目冻结的点名，动作输入不能伪造。资源只读声明路径并核摘要。状态写入在 beforeEffect 后重查安装与发布者、只写当前范围。使用仅由宿主拿到接受回执后记录；拒绝、取消、安装失效或没有可信轮次的回执不记账，卸载保留历史名称和版本。 | `apps/local-host/src/agent-definitions/skill-catalog.ts`、`apps/local-host/src/agent-definitions/skill-catalog-host.ts`、`apps/local-host/src/agent-round-skills.ts`、`apps/local-host/src/agent-definitions/skill-settings-http.ts`、`apps/local-host/src/sandbox-package-store.ts` | `tests/security-invariants-skill-catalog.test.ts`「missing grants, revoked publisher and changed signed bytes refuse Skill reads」「read refuses a publisher revoked during action inspection」「rejected, cancelled and stale acceptance receipts record no uses」 | — |
