# W5-13 C1：Assistant HTTP 失败日志收尾

状态：原两处日志及 4 文件 23 项证据已由首轮评审 6388105657 确认；同 PR 的三处静默 catch 已由 Codex 修复5接续实现，新增三条实际故障红绿及相关 6 文件有效并集 37 项通过，待修后独立 REVIEW/TEST、最终 CI 与合并。Codex（实现 1）保留 C1 整体归属，本轮只认领这三处；RAC-113/114 已合入、RAC-115 固定贡献保留，均不代表 C1 整体完成。

承接[总规格](../spec.md) W5-13 既有日志清理合同。准确基线 `0060920a314224b2eda6b71ee21b7e29323f6962`；29 个在途 PR 的完整文件清单已核，#1223、#1064、#1153 虽涉及同文件，但实际差异均未修改本片两个失败出口，现有 `host-log.ts` 无人在途改动。流水线确认这两处当前没有其他 writer；独立工作树并行，不改 Memory 功能或其 PR。

`assistantServiceFor` 的 `learnFromRound` 已将提炼交给当前 Memory Host，排程拒绝被 `.catch` 接住后原流程继续；提醒规则动作登记由同步 `try/catch` 接住，失败后仍返回并缓存同一个服务。两处当前 `console.warn` 都会打印原错误，可能携带人写的内容、网址或凭据。本片仅改日志出口，不改变上述继续语义、错误传播边界、缓存、排程次数或成功路径。

沿用唯一 `hostLog.warn`，分别记 `memory / learning_not_queued` 与 `assistant / rule_actions_registration_failed`；错误只留既有过滤后的 name/code，尚未关闭的调用范围自动附带编号，已脱离原调用的后台回调不捏造编号。不另加来自输入、工作标题、提示、URL、token 或 raw error 的字段。提炼本身的失败仍由原 `memory / learning_failed` 负责，区分“未排入”和“运行失败”；不建第二 logger、重试、错误模型或日志格式。

允许修改 `apps/local-host/src/assistant/assistant-http.ts` 的原两个失败日志及本轮下述三个 catch 与必要 import、既有定向回归及本 slice（必要时同包 README）。流水线在本片登记时明确授予 `tests/ci-product-subset.txt` 仅新增 `tests/assistant-http-logging.test.ts` 一行的串行边界；本轮在该已登记文件补测试，不再改公共清单。既有 carrier 冻结、其他 FIX/C2 未认领该行，登记前已确认没有重复。共享 logger、Memory/Agent 业务、desktop launch_args、C2 storage/Home、BL-372/carrier、公共 baseline/assets/编号文件、API/schema/权限/依赖均不改。既有巨大单元不增加行数或方法；不加测试专用公开接口或包内部 import。

**RAC-116**：经现有公开 `assistantServiceFor` 与真实隔离服务装配触发两个失败出口，分别验证恰好一条结构 warning、固定区域/事件、原错误 name/code 与当前调用编号，且没有原提示、URL、凭据、原错误 message/stack 或旧 console 输出。排程拒绝不会使已完成工作变失败，也不自动重排；登记拒绝仍返回并复用原服务、不会冒出成功登记或重复登记。恢复故障后，新的明确调用能正常排程或登记且不写失败 warning；保留既有成功路径与拒绝合同。

**评审 6388105657 的同 PR 修复（2026-10-24，执行 Codex 修复5；C1 整体归属仍为实现1）**：基于固定 `c72d23f9f3fa3d9f336c1dd8aafc74f53ac3b2b1`，只接续同文件三处静默 catch。现有调用者本来就约定尽力处理，保留其降级：通知结算失败仍列出已有通知（返回 0 不代表写入成功）；草稿只在绘制回复时补表单，无草稿自然为 `{}`；答卷已被 `agent.answer_invalid` 拒绝后，工作重读只补字段题面，失败仍返回原答卷错误与通用字段原因。后两条从 `AssistantStore.get` 得到的精确 `assistant.not_found` 表示工作已消失，安静保留原 fallback；其他存储、解析或宿主失败均经原 `hostLog.warn` 记固定 `assistant` 区域的事件，不带业务字段，沿用 name/code 与当前 call_id 的过滤，不记录原 message/stack。通知的正常无待结算记录返回 0，无异常也不记 warning。不把其他 `*_not_found` 一概当作正常工作缺席，不改正常 HTTP 状态、问卷或工作状态，不重试、补偿或重新结算。三个事件分别为 `handled_notices_settlement_failed`、`question_drafts_read_failed`、`answer_context_read_failed`。

- **RAC-116-01**：真实 HTTP 通知读取在结算存储故障后仍返回现有通知、原记录未被伪结算，一次请求只尝试一次并记一条安全日志；故障移除后下一明确请求正常处理，无新 warning，无待结算项安静返回。
- **RAC-116-02**：真实 HTTP 回复绘制时，草稿读取的意外失败只退回空草稿并记一条安全日志，已持久化草稿不变；没有草稿或绘制期间工作已消失时不记 warning；恢复后下一合法请求读回原草稿，不多写记录。
- **RAC-116-03**：真实 HTTP 答卷拒绝后的工作重读意外失败记一条安全日志，但原答卷仍被拒绝，保留通用字段原因、待答问题和草稿，不再调用一次 answer；正常读取能补回题面的限制，工作已消失的 `assistant.not_found` 安静；恢复后的合法请求照旧工作。三条均断言日志不含提示、URL、凭据、原错误正文或 stack，并核副作用与请求次数。

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

本轮修复证据在 `/tmp/molis-verify-2026-10-24/pr1238-fix5/`。原 c72 生产代码上的 `tests-before.log` 精确 0/3，三个真实故障均在缺结构 warning 处失败；`tests-after.log` 同一文件 5/5，通过通知保留与下一请求只结算一次、草稿读取失败后不写草稿及恢复原答案、SDK 真正拒绝越界答卷后保留待答与草稿、题面缺席的通用错误和正常恢复题面、合法答案仅发送一次并只清理一次草稿。故障端口观察到的当前调用编号与实际日志一致，日志无原错误正文、stack、提示、URL 或凭据。`tests-after-initial.log` 的另五个直接相关文件已有效通过 32 项（问卷回答、交互绘制、工作连续性/通知结算、原生 HTTP body、Assistant 错误模型），不重复重跑；有效并集为 6 文件 37 项、零跳过，原作者其余 21 项业务及 19 项 CI 清单证据保留。夹具准备的 Runtime 模式/审批端口/题型、HTTP 平铺错误和通用字段键、当前调用编号误判均有原日志，未改生产合同来迎合它们。整体构建、边界、严格测试类型与测试 Biome 通过；生产整文件仍只有原两处双重断言诊断。精确整个 PR affected 87 文件、本轮相对 c72 为 85 文件，二者 `full/storage/uncovered` 均为空；其余包级要求由独立 TEST/适用同头 CI 核收，本会话不启动 full 或浏览器批次。
