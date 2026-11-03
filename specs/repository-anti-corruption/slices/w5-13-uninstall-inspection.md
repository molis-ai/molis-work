# W5-13 C1：卸载预检的读取错误

状态：工程实现及 18 项直接回归通过，由 Codex 承接 RAC-113；独立评审、测试与合并待核验。C1 的 desktop、local-host 其他区域继续保留，不以本片代表整项完成。

承接协调分支 `CODEX-TASKS.md` 的 C1、`SLICE-RULES.md` 和[总规格](../spec.md) W5-13。起点为 main `d28794061a189aea2d4e5ebfe74b558ed9a8e169`；#1151 已合入，本片不重复其 server/CLI 工作。修复1交付 #1173 并明确释放 writer 后接槽；开工核对的 38 个在途 PR 没有修改本片文件。

## 问题与实现范围

`apps/local-host/src/installer/uninstall-files.ts` 的两处捕获把所有文件系统错误当作“不存在”：读取 `releases/` 失败返回空列表，检查登记的数据路径失败返回 false。卸载预览因此可能漏掉现存的程序或用户数据，并把无法检查的 Home 当成完整预览。

只把 `ENOENT` 解释为缺失；`ENOTDIR`、`EACCES` 及其他错误保留原错误向上抛，交给现有公开调用方处理。做法与同文件 `readText`、`pathFingerprint` 的缺失判断一致。正常预览、所有权判断、保留目录、取消和强确认行为沿用现有合同。失败发生在 `prepare`，不进入删除步骤。

生产修改只限该文件；新测试放在 `tests/uninstall-inspection.test.ts`，经公开 `MolisWorkUninstallService.prepare` 调用实际预检实现，运行于一次性 Home。项目端口只提供空项目清单，Runtime 和 Web 服务用现有的隔离配置。无需改公共 API、动作、schema、日志接口、权限、兼容路径或 C2 的快照模块；不修改共享 spec、BACKLOG、privileges 状态与协调文件。RAC-110～112 已用于 #1151，剩余 RAC-114～119、BL-445～449 保留。

## 验收与验证

- **RAC-113**：缺失的 `releases/` 或登记数据路径仍能生成原有预览；真实的 `releases` 普通文件引起 `ENOTDIR` 时拒绝预览；仅对临时目标注入的 `readdir` 权限错误和 `stat` 非缺失错误原样传播。失败不删除原文件、不写卸载收据，解除故障后同一服务能再次生成包含实际登记路径的预览；成功预览的所有权、保留目录和强确认回归保持。

先运行新用例取得修前失败，再改生产代码并重建验证。必要命令：

```sh
pnpm install --frozen-lockfile --offline
pnpm build
node scripts/run-tests.mjs tests/uninstall-inspection.test.ts tests/uninstall-catalog.test.ts tests/uninstall.test.ts tests/cli-protocol.test.ts --jobs 2
node scripts/check-health-gates.mjs --base origin/main
pnpm boundary:check
git fetch origin main
pnpm secrets:check
node scripts/affected-tests.mjs --base origin/main --json
```

公共 build 槽照常排队；不启动浏览器或全量。包 README 的更广泛用例和 `affected-tests` 实际列出的延后项交独立测试及 Claude 的统一窗口，提交时写明精确 head、实际运行结果与原始日志。若受控数字下降，才运行 `node scripts/check-health-gates.mjs --update --base origin/main`；本片不为清数字而修改其他 catch。

## 本片工程证据

RAC-113：通过。生产源码未改时，新增四条用例为 1 通过、3 失败；失败均为公开 `prepare` 没有拒绝对应错误（`Missing expected rejection`）。修复后四条全部通过，验证了原错误身份、文件保留、收据未写及同一服务解除故障后的重新预览。原卸载四条（含真实临时安装、CLI、强确认、失败收据）、catalog 五条、CLI 协议五条一起通过，共四文件 18 条，运行器未重试。

离线安装、修前及修后整体构建、新测试独立 TypeScript 检查、两修改文件的 Biome 检查、纳入新文件后的 merge-base 健康门禁通过。健康门禁的受控数字没有变化，无需刷新 baseline。构建保留原有四条 PTY 打包告警，未涉及本片代码。包边界和提交范围密钥扫描的最终结果随固定 head 写入 PR。

实际 `affected-tests`：基点 `d28794061a189aea2d4e5ebfe74b558ed9a8e169`，`full=[]`、`storage=[]`，选出 77 个非浏览器文件；其中本片新文件已运行，其余 76 个选测文件交独立测试及统一窗口。工具仍将内部 `uninstall-files.ts` 列为 `uncovered`：新测试经公开服务间接调用它，静态文件匹配没有追到这条调用链；上述修前红例与修后结果证明这两个分支实际被执行，没有为清除此提示增加内部引用或公开出口。另主动运行的三个既有直接文件不在该静态选测清单内。

原始日志位于 `/tmp/molis-verify-2026-10-24/c1-rac113/`：`build-before.log`、`tests-before.log`、`build-after.log`、`tests-after.log`、`lint-after.log`、`test-typecheck.log`、`health-final.log`、`boundary.log`、`affected.json` 与后续提交范围 `secrets.log`。本机未运行全量或浏览器，未操作真实 Home；独立审验及实际合入前不标记本片或 C1 整体完成。
