# W4-01 真实生成 corpus 工程书独立审查

**结论：方向可采纳为 WAIT 工程书；下列三项最小修订并回 PLAN 后可作为执行依据，当前不能转 READY 或签 W4-01 完成。** 这是原 W4-01 的真实生成样本缺口，不是新增可选 P2。保留两个样本、离线回放、现有 runner 与唯一事实源，不另建框架或产品路线。

本轮只读 PLAN 与现行本地 `origin/main=b0567bf545a74b858e4fdeddd5e66432b1065b21`；主检出 HEAD 为 `08c9933d57e153d1d59bf2811f203056d4358992`，没有用其旧工作区内容判断当前实现。对 PLAN 基点 `86570ac4499871f46c52762f73a1cd91f68ccc20` 比对，本文核对的 runner、三份回放/安装测试、安装服务/生命周期、读包、studio-ports 及两处 SSOT 均无差异。未 fetch、改 refs、构建、测试、调用模型、访问真实 Home/Keychain/账号配置、修改源码/协调文件或 GitHub。本文代码与测试引用是静态证据，不能写成本轮运行通过。

## 1. 现成路径与未来依赖：项目级可以做，不能误等 Home 能力

当前 `scripts/replay-plugins.mjs` 的 directory/packed 两路确实通过 definition factory、`pluginFixtures` 与内存 `nextVersion` 回放；它不能直接承接真实签名沙箱包。PLAN 给同一个 runner 加 package 分支的方向正确。

**项目级签名包已有公开真实升级路径：**

- `PluginInstallService.preview/confirm` 验签、校验形状、本人确认和 pin；`plugin-install-service.ts:159–185` 对项目同发布者调用 `assertUpgradeOf`，只有 Home 仍拒绝原位升级。
- `installed-plugin-host.ts:205–207` 的 `installPackage` 按已安装记录选择 install/upgrade；`installed-plugin-lifecycle.ts:124–139` 进入 `changeInstalledVersion`，保留原安装与数据。
- `package-upgrade.ts:9–11` 要求版本严格升高，且 `compatible_from_versions` 包含旧版本。公开 CLI 仍是 `molis-work plugin install <新包> <project-id> --confirm`，不是新建升级后门。
- `tests/security-invariants-plugin-lifecycle.test.ts:41–57` 的 BL623-01 已写有同 install_id、旧数据、新代码及重启验收；RAC-1839 则验证缺兼容声明的拒绝。这里只核代码，未运行这些用例。

`tests/probe-plugin-installed.test.ts` 中“没有升级入口”的注释已落后于实现：它构造的 v1.1.0 **没有写 upgrade_compatibility**，拒绝本身不能证明升级不存在。RAC-792 可复用 resident Host / CLI / pin / 重启办法，不能核抵正向升级。先前中途据其旧注释作出的“当前签名包不能升级”判断已撤回，以生产调用链为准。

**必修 A：PLAN 明确两份样本都是 project scope；补以上实际调用链和依赖边界。**

| 后续项 | 对这两个样本的关系 |
| --- | --- |
| T141 / BL-711 | Home 包原位升级；本片项目级样本不依赖。不能把每样本临时 Home 混同为 runtime.scope=home。 |
| T143 | Home 包模型设置/模型服务；本片运行只用纯计算和私有存储，不依赖。生成时调用模型是创作台的能力，不是样本声明 model 服务。 |
| T149 | 创作台产物装进 Home 及本机签名身份；本片不装 Home 插件，不依赖。 |
| BL-589 | 通用作者工具与创作台直接出签名包尚未实现；本片可使用现有公开包格式及签名函数做明确标注的测试包装，但不能声称已验证 BL-589 的产品发布闭环。 |

BL-589 不必成为这份 corpus 的硬阻塞，但 PLAN 要把“通过现有签名包工具”写成确切包装步骤：`studio-ports.ts:105–117` 的 release 有 plugin.mjs、contract、interface、prompts，**其 manifest.json 是 BuildManifest，不能直接拿来作为 PluginManifest**。保留这些真实发布文件及源码；用现有公开导出 `sandboxPluginManifest`（local-host）生成签名包清单，保留实际 pluginId、界面形状与 effects；用已有 payload 组装方式和 `signPluginPackage`（plugin-runtime）签名。v2 仅变包版本与兼容声明并重新签名，标明这是回放用的机械包装版本，不冒称第二次模型生成的版本。

这些都是仓库测试已经在用的公开包入口，不需要新生产导出、私有深引、SDK 迁移或新 pack-sandbox 工具。不得把 `signedPackage()` 内置的手写笔记 CODE/contract 混入真实生成样本；它只可提供签名/文件封装的复用方式。安装始终经过验签、preview/confirm 和正式生命周期；包装成功也不授权执行。若实际产物无法按当前格式无损表达，应报具体差异 WAIT，不在 corpus 增加形状豁免。

## 2. 冻结 oracle 与 runner 输入输出

短文本的值正确：实际输入是一处换行的 `一行\nline`（不是反斜杠加 n 两字符），characters=7、utf8_bytes=11、lines=2；纯操作不需网络/模型 effects。README 必须清楚呈现 JSON 转义与实际输入。

**必修 B：将两个样本的操作顺序及比较投影冻结为明确数据，补进现有 runner 的 package 分支合同。** 当前 runner 只支持 `sample.action` 一次调用，`JSON.stringify` 精确比较，升级后再调同一个动作；照搬到清单会重复添加，或只测到空列表。至少写清：

1. 计数器：安装前不可发现；安装后固定输入得到固定三个整数；升级后和重启后同样输入得到相同结果。
2. 清单：安装后 list 为 []；add `{text:"周五整理资料"}` **一次**，其返回 schema/确定结果在生成前固定；list 以预先规定的正文投影精确等于 `["周五整理资料"]`，必须恰好一条。v2 升级后与 Host 重启后只 list，不再 add，投影仍完全相同。ID/时间可以排除，但排除规则、字段名、数组数量和顺序在生成前固定，不能按实际输出临时挑字段。
3. upgrade 记录来自真实安装结果：同 install_id、同 plugin/publisher、v2 running；restart 必须启动保存的 v2 包，再核数据。步骤未执行保留 null/明确状态，不能让 `ok:true` 遮住缺步骤。保持两原样本与 RAC-791 的拒绝语义。

不要求通用流程 DSL：给现有 corpus 最小的前置写/读回步骤及固定投影即可，字段在实施 spec 冻结。生成前冻结的是用户业务合同、输入/输出和 effects；安装后 capability_id 可按当前正式发现结果绑定，但不得反向改变 oracle。当前签名包的 buildId 来自 plugin_id + 发布者身份（`sandbox-package-store.ts:24–25`），同发布者同 plugin 的 v1/v2 不因版本自动换动作名；PLAN 的条件式提醒可保留，但不要为本片另造版本化动作规则。

PLAN 的 provenance、人工修补 diff、失败轮留存、禁止用模型单测计算 oracle 等约束可保留。A3 的当前代码已有同 scope supervisor Manifest 分支（`declaration-owners.ts:31–45`），旧红不作为未修事实；实际原两样本回放结果仍留到授权执行验证。

## 3. 平台、权限与执行边界

**必修 C：补 macOS 沙箱的适用范围与未执行表达。** RAC-792 和现有签名生命周期用例均 macOS-only，而现有 replay 测试没有这个限制。新增 package 样本后要明确非支持平台如何报告 unsupported/未运行，不能悄悄跳过再让整份 corpus 返回“全部通过”，也不能把两个原 directory/packed 回放一并跳掉。本机真实 package 回放在 macOS 完整执行；CI 若只覆盖原两路，则报告其范围，只有实际支持并运行的环境才核销新增样本。无需为本片修改 CI 或放宽门禁。

安装使用本人授权的测试入口；它不是给生成 Agent 增加安装能力。生成 Agent 只操作合成临时工作区，不拿签名私钥、安装控制 token 或 provider 凭据；包装/签名由可信测试侧做，私钥不入库。沿现有沙箱和 agent-host 的限制执行，不把“cwd 是临时目录”写成完整文件访问隔离证明。PLAN 的环境边界是要求，实施时须核实际配置能兑现；不能用挂真实目录补齐。

只用该次获批隔离配置和临时 Home，不查真实 Home、Keychain、全 env 或旧模型账号。T315 只证明过去发生过一次调用，不证明当前账号有效、余额足够或获准费用。超时、失败、SKIP、未拿到模型都不能当生成成功；成本、时段、最多样本数/修复轮仍由根在已有授权范围内明确。

## 4. WAIT 的具体条件和可独立准备项

当前硬 WAIT 是：没有本轮真实模型配置/凭据使用与成本的现成授权证据；没有获准的执行时段/单 writer 与最终锁；两份简报的精确 schema/序列尚待按 B 冻结。不是缺项目级升级能力，也不是必须等待全部 Home/模型合同任务。

可独立准备：把 A–C 并回同一 PLAN，完成两个合成简报与输入输出、写清 release→签名包的材料映射、精确列出允许改动路径与回放报告形状；根可用已授权联系范围核对既有 ac-registry 是否有未采用产物。没有联系授权的旧 chat 不由本线唤醒。准备不包括生成、签名运行、构建/测试、配置账号或更动保护分支。

RAC-792 旧注释与 SSOT 的历史状态不在本次审查中顺手修改。CONTRACT-CHANGES §4 第 7 项及 w5-02-registry §6 仍是唯一归属；保护 #1101 等只给根精确文档差集，不能改保护分支。后续样本全部真实完成、离线签名安装/升级/重启回放通过，才由根按 W4-01 原验收结算；本报告只认可修订后的 WAIT 工程书。

— Codex，独立只读审书，2026-10-31
