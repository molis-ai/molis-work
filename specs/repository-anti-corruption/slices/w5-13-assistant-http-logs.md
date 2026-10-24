# W5-13 C1：Assistant HTTP 两处失败日志收尾

状态：本片已实现，作者定向 4 文件 23 项验证通过，待独立 REVIEW/TEST、CI 与合并；Codex（实现 1）保留 C1 归属。RAC-113/114 已合入、RAC-115 固定贡献保留，均不代表 C1 整体完成。

承接[总规格](../spec.md) W5-13 既有日志清理合同。准确基线 `0060920a314224b2eda6b71ee21b7e29323f6962`；29 个在途 PR 的完整文件清单已核，#1223、#1064、#1153 虽涉及同文件，但实际差异均未修改本片两个失败出口，现有 `host-log.ts` 无人在途改动。流水线确认这两处当前没有其他 writer；独立工作树并行，不改 Memory 功能或其 PR。

`assistantServiceFor` 的 `learnFromRound` 已将提炼交给当前 Memory Host，排程拒绝被 `.catch` 接住后原流程继续；提醒规则动作登记由同步 `try/catch` 接住，失败后仍返回并缓存同一个服务。两处当前 `console.warn` 都会打印原错误，可能携带人写的内容、网址或凭据。本片仅改日志出口，不改变上述继续语义、错误传播边界、缓存、排程次数或成功路径。

沿用唯一 `hostLog.warn`，分别记 `memory / learning_not_queued` 与 `assistant / rule_actions_registration_failed`；错误只留既有过滤后的 name/code，尚未关闭的调用范围自动附带编号，已脱离原调用的后台回调不捏造编号。不另加来自输入、工作标题、提示、URL、token 或 raw error 的字段。提炼本身的失败仍由原 `memory / learning_failed` 负责，区分“未排入”和“运行失败”；不建第二 logger、重试、错误模型或日志格式。

允许修改 `apps/local-host/src/assistant/assistant-http.ts` 的这两个 catch 与必要 import、一个有意义的定向回归及本 slice（必要时同包 README）。流水线在本片登记时明确授予 `tests/ci-product-subset.txt` 仅新增 `tests/assistant-http-logging.test.ts` 一行的串行边界；既有 carrier 冻结、其他 FIX/C2 未认领该行，登记前已确认没有重复。共享 logger、Memory/Agent 业务、desktop launch_args、C2 storage/Home、BL-372/carrier、公共 baseline/assets/编号文件、API/schema/权限/依赖均不改。既有巨大单元不增加行数或方法；不加测试专用公开接口或包内部 import。

**RAC-116**：经现有公开 `assistantServiceFor` 与真实隔离服务装配触发两个失败出口，分别验证恰好一条结构 warning、固定区域/事件、原错误 name/code 与当前调用编号，且没有原提示、URL、凭据、原错误 message/stack 或旧 console 输出。排程拒绝不会使已完成工作变失败，也不自动重排；登记拒绝仍返回并复用原服务、不会冒出成功登记或重复登记。恢复故障后，新的明确调用能正常排程或登记且不写失败 warning；保留既有成功路径与拒绝合同。

先构建准确基线，让新增回归在原两处 raw console 上失败，再修改生产代码、重建并验证实际行为：

```sh
pnpm install --frozen-lockfile --offline
pnpm build
node scripts/run-tests.mjs tests/assistant-http-logging.test.ts tests/host-log.test.ts --jobs 2 --verbose
node scripts/check-health-gates.mjs --base origin/main
pnpm boundary:check
git fetch origin main
pnpm secrets:check
node scripts/affected-tests.mjs --base origin/main --json
```

根据实际调用链补必要定向回归；README 主必跑与其余 affected 建议由作者、独立 TEST、固定头 CI 按实际证据核齐，不把本片通过说成整包全绿。整机一个 build/一个浏览器批次及 carrier 优先排程保留，等待资源时继续独立实现，不启动 full；实际命中 full 交 Claude 统一排。所有 Home、SDK、SQLite 与模型响应均为隔离夹具，不操作真实 Home/4207、系统凭据或外部模型。完整本片固定头后普通推送、一个非 Draft PR，直接交 REVIEW/TEST/流水线并抄 Root；RAC 编号在交付前再鲜核，不改公共编号表。

作者证据位于 `/tmp/molis-verify-2026-10-24/c1-rac116/`。`tests-before.log` 在准确基线生产代码上确认两个真实拒绝出口均缺结构 warning（0 通过、2 失败）；注入命中和原继续行为已先通过。修复后 `tests-after.log` 新用例 2/2 通过，覆盖隐私、当前调用编号、无旧 console、已完成工作不变、不自动重排、下一明确轮次真实入队，以及登记拒绝后的服务缓存与下一次新服务真实登记；同一最终生产代码的 `tests-after-initial.log` 已有效通过 Host 日志 5、提醒规则 5、Memory 动作 11，共 21 项。作者有效并集 23/23，零跳过、零 runner 重试，不为重复已有效的三文件而再跑一轮。新增测试先前的登记包装端口未命中、调用范围过早关闭两项夹具失败均保留原始日志；后者按内核“调用结束即关闭编号”的现行合同修正测试操作范围，未改变生产调用生命周期或放宽日志断言。

离线安装、两次整体构建、新测试的严格类型与 Biome 检查、边界及对准确 merge-base 的 health 均通过；整文件 Biome 保留原有两处 `as unknown as` 诊断，未宣称全绿。健康统计的 `console` 从 21 降至 19，既有巨大单元与包内部测试引用均未增长，不改公共 baseline。登记前实际 affected 选择 86 文件，`full`、`storage`、`uncovered` 为空；已跑其中新增一文件，另外三份直接相关验证作为补充，余下 85 个建议与 README 主必跑待独立 TEST/固定头 CI 核齐。新测试已加入现有 CI 产品子集，最后一轮登记只改清单与本 slice，生产和回归内容保持 `a56ee1685b2d5ce3fe20dd1b2ad0601f7b451354` 的已验证版本；Linux 证据仍待 CI/TEST，不把本机替身模型和真实 SDK 路径称为真实模型、最终产品或本人验收。
