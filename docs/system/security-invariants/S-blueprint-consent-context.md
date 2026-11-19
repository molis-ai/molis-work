# S-blueprint-consent-context

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-blueprint-consent-context | 本人采用场景可以改已确认的设置。设置子调用保留本人、项目和原授权检查，清除安装同意的出处。安装主人拒绝该子调用确认安装，项目运行时设置主人拒绝场景服务用系统身份写入。工作记录用同一次调用号和父执行号把真实设置写入连回本人采用。 | `horizontal/blueprints/src/index.ts`、`apps/local-host/src/blueprint-host.ts`、`apps/local-host/src/local-web-actions.ts`、`apps/local-host/src/plugin-install-actions.ts`、`apps/local-host/src/project-runtime-setting-actions.ts`、`packages/kernel/src/action-settlement.ts` | `tests/security-invariants-blueprint-consent.test.ts`「adoption passes its person's settings authority and never delegates installation consent」 | — |
