# W5-13 C1：卸载失败收据的真实结果

状态：工程实现与四文件 17 项直接回归通过，Codex 承接 RAC-114；独立审验和合入待核验。RAC-113 已随 #1183 合入；本片不代表 C1 整体完成。

承接[总规格](../spec.md) W5-13 与协调分支 C1 派单。流水线在 C2 B2a 固定 #1209 并明确释放后授予本片唯一 writer。起点为鲜 main `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a`，复用本 chat 已干净的 managed 工作树；41 个在途 PR 的文件清单与本片允许路径无重叠。

## 问题、行为与边界

`MolisWorkUninstallService.confirm` 在删除前先写 `in_progress` 收据。卸载步骤失败后，它尝试写 `failed` 状态，却把这次写入的错误吞掉，再向调用方声称“进度收据已保留”。此时磁盘上可能只有旧的 `in_progress` 收据，失败进度并未保存。

失败收据只尝试写一次，记录该次写入是否成功。成功时保留现有提示和收据；失败时如实提示“失败进度未能写入收据”，仍返回原有 `installer.uninstall.step_failed` 和原卸载步骤失败文字，不以收据错误替换它。写失败只经现有 `hostLog.warn` 留一条 `installer / uninstall_receipt_write_failed` 诊断，错误只留 name/code，字段只放阶段计数、布尔等调用处自定值；不输出收据写错误的 message、stack、路径或敏感内容。保留现有调用编号贯穿，不新增日志接口。

初次收据写入仍在删除前，失败直接传播；正常卸载、取消、所有权、强确认、收据 schema、原子写方式与步骤顺序不变。不增加重试、状态、公开 API、错误码、兼容路径或临时清理框架，不触及真实 Home、Keychain、4207 或全量排期。

允许修改 `apps/local-host/src/installer/uninstall.ts`、新 `tests/uninstall-receipt.test.ts` 和本 slice；必要时仅调整直接相关的既有卸载回归。沿用私有 `../host-log.js` 接线，无需改 logger、公共出口、词典、BACKLOG、主 spec、privileges 或其他共享文件。RAC-114 用于本片，其余预留号保持。

## 验收与验证

- **RAC-114**：公开 `prepare/confirm` 的卸载步骤失败，收据能写时仍保存真实 `failed` 状态并保留原有提示；失败收据的原子写再失败时，原卸载错误保持为 primary，提示不虚称失败进度已保存，旧收据字节和未删用户文件保持。诊断恰好一条，带现有调用编号、错误 name/code 和自定计数/布尔，不含收据异常 message/stack/路径或敏感值。每次确认只尝试一次失败收据，无自动重试；解除写故障并明确重新预览后能写入真实失败进度。初次收据写入失败仍在任何删除前原样拒绝。

测试只使用临时 Home、公开服务与现有可注入端口。原子写故障仅注入目标收据的 `rename`，真实初次写入和失败状态写入均走生产实现；核对落盘记录、原文件、返回错误、日志与后续重试观察，不用只检查字段存在的夹具代替。

先运行新用例记录修前红例，再改生产代码、整体构建并定向验证：

```sh
pnpm install --frozen-lockfile --offline
pnpm build
node scripts/run-tests.mjs tests/uninstall-receipt.test.ts tests/uninstall.test.ts tests/host-log.test.ts tests/uninstall-inspection.test.ts --jobs 2 --verbose
node scripts/check-health-gates.mjs --base origin/main
pnpm boundary:check
git fetch origin main
pnpm secrets:check
node scripts/affected-tests.mjs --base origin/main --json
```

包 README 更广泛的必跑项按作者直接验证、独立 TEST 与同头 CI 的实际证据核齐；未跑项明确交接。`full` 以实际选测为准，只由 Claude 排批。build/browser 走公共 machine-slot；本片不需要浏览器。按现行合并规则 §1a，功能 PR 不刷新共用 baseline 或反复同步公共冲突；新 head 固定后直交 REVIEW/TEST，明确释放源码供下一 writer 接续，不等 CI 或合并。

## 工程证据与未验证项

RAC-114：通过。原生产实现上的四条新回归为 2 通过、2 失败，分别精确复现“收据仍宣称已保留”和“没有诊断”。最小源码修改后四条全部通过；旧收据字节、保留文件、原错误、单次写入、显式新预览恢复与日志脱敏/调用编号均有断言。连同既有卸载 4 条、Host 日志 5 条、RAC-113 预检 4 条，共四文件 17/17 首次通过，零跳过、重试。

离线安装、原始实现的整体构建、修改后的整体构建、两文件 Biome、新测试独立 TypeScript 检查、merge-base 健康门禁通过。构建只保留已有的 4 条 PTY 打包告警。生产只增加现有日志 import 及失败分支的保存结果判断，受控数字无变化，不改公共 baseline。源码与测试通过后保持不变；最终包边界、提交范围密钥扫描和固定 head 在 PR 中记录。

实际 `affected-tests`：merge-base `645853cb60c0c76c4fa86ba27bbbbc0f35ba868a`，三文件、`full=[]`、`storage=[]`、`uncovered=[]`，83 个非浏览器建议文件。已运行其中三个直接文件，另外的 Host 日志文件主动补跑；其余 80 个建议文件交独立 TEST 与同头 CI 核覆盖，不把四文件 17 项称作整包验证完成。#1206 后的新 main 没有改本片目标，按明确派单保留既定基线，不机械同步。

原始日志目录 `/tmp/molis-verify-2026-10-24/c1-rac114/` 保存 `build-before.log`、`tests-before.log`、`build-after.log`、`tests-after.log`、`lint-after.log`、`test-typecheck.log`、`health.log`、`affected.json` 与最终 `boundary.log`、`secrets.log`、`diff.patch`、`handoff.md`。未运行 full、浏览器或真实 Home 操作。作者定向结果不代替独立评审、测试或实际合入，C1 完整余项保持。
