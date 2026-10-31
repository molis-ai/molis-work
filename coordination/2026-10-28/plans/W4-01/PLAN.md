# W4-01真实生成插件corpus收口准备

负责人：Codex起草线；根已核A/B/C修订并接受为WAIT工程书，非READY/非实现。初稿只读main对象`86570ac4499871f46c52762f73a1cd91f68ccc20`，本轮按审阅基点`b0567bf`复核相关打包/项目升级实现；另核本地可见历史、GitHub PR搜索及已有协调材料。本轮不调用模型、不生成/构建/安装、不访问真实Home/Keychain，不读账号配置或密钥。根后续明确模型执行范围、时段及成本预算后才能实施。

## 1. 去重结果与现行owner

现行owner是`docs/system/CONTRACT-CHANGES.md` §4.7和`slices/w5-02-registry.md` §6的W4-01/ac-registry线；实现入口为`scripts/replay-plugins.mjs`与`tests/replay-plugins.test.ts`（RAC-790/791），安装半边为`tests/probe-plugin-installed.test.ts`（RAC-792）。根指定唯一writer，不另造回放框架或第二语料账。

核对结果：

- main corpus目前仅plugin-sample、text-stats-packed两项，about仍写真实创作台样本to come。`git log --all -- tests/fixtures/replay-plugins`只核到原f2b5fe16e/08145f2a6和batch-41；两原提交corpus也各2项，未见额外样本提交。f2提交关联#1310，main经29f1ffd47采用该回放实现。不是工具没做。
- 现行slice §6明确当时挂起两项前置：本机真实Agent时段，以及A3开发定义归属修复。后者历史指定进batch-41，不能今天继续把那条历史红当未修；执行前只核最终路径差集，不重造A3。真实样本必须走T2安装，不能pluginFixtures。
- 协调BOARD/MISC/ESTIMATE/RISKS的定向搜索未找到已派真实corpus样本writer。PR关键词replay/W4-01/corpus搜索原件在pr-search-*.json；replay结果达到100项上限、也含不相关词，不能据此证明远端所有PR都无样本。未发现可复用的未采用样本，不宣称任何未公开工作都不存在。根发执行前先问既有ac-registry owner是否有未入库源码/代码包；有就先核产物而不重生成。
- T315/W6-03真实smoke走propose→experience→detail到设计冻结，docs/platform/STUDIO-SKILL-REPLAY.md也明确该范围；其原答卷/报告不是生成代码包，不能替代本corpus。本计划不从用户Home旧项目或已删临时Home搜数据。

## 2. 生成目标与固定oracle

本片固定两个真实完成样本，不增加第三样本。两者均为project scope：每次运行使用独立临时Home不代表插件runtime.scope为home，生成/打包时不写runtime.scope=home。简报与精确oracle已分别冻结在brief-counter.md、brief-list.md；失败/修复轮完整记录，不循环挑绿。

| 样本简报（执行前冻结） | 固定输入/输出契约 | 必须可离线重放的行为 |
| --- | --- | --- |
| 本地短文本计数器 | text.count输入JSON为`{"text":"一行\nline"}`，实际含一处LF换行；严格结果为`{"characters":7,"utf8_bytes":11,"lines":2}` | 安装前不可发现；安装后、v2后、Host重启后各用同输入完整比较，不调用网络/模型 |
| 本地清单 | items.list先为`{"items":[]}`；items.add `{ "text":"周五整理资料" }`只执行一次，严格返回`{"added":true}`；后续list按附件固定schema与正文投影精确等于一条 | v1添加后、v2升级后、Host重启后只list，不再add；数量和顺序固定，id/时间仅按预冻结规则校验，不临时挑字段 |

简报、允许effects、输入schema、精确期望在生成前冻结。代码可以由模型自行实现；模型写的单测或实际输出不能反过来计算oracle。若生成契约与冻结需求不同，按原流程修复/拒绝，记录原因；不能为通过改oracle或手工重写代码后仍称全模型产物。任何人工修补都保留逐项diff，最后明确样本是否仍符合真实生成来源。

## 3. 真实生成与安装/升级路径

真实生成用当前产品创作台全链：隔离临时Home和合成项目/工作区 → 选择根指定文字模型 → 真实设计冻结 → Agent编写后端代码/测试 → 现有build-checks类型检查/打包/沙箱试跑 → 发布代码与清单。`studio:replay smoke`只可作前序诊断，不能当生成完成。plugin-builder README及apps/local-host/src/plugin-builder/{build-project,build-checks,installed}.ts是已有生产入口；模型调用必须经agent-host。不得直接import生成代码在Host进程执行。

保留真实生成源码及发布原件，不拷依赖/缓存/整个Home。可信测试侧机械包装两版project scope包，步骤如下，不要求BL589新工具或新生产导出：

| release原件 | 包中映射（用现有SANDBOX_PACKAGE_FILES常量定位） |
| --- | --- |
| plugin.mjs | entrypoint原字节，不掺入手写fixture CODE |
| contract.json | contract原字节；pluginId/revision/operations来自真实生成合同，必须符合冻结简报 |
| interface.json | interface原字节，保留实际parts/nodes/presentation/acceptance，不换成手写笔记界面 |
| prompts.json | prompts原字节，本片运行不允许模型effect；不删除/改写生成内容来绕校验 |
| manifest.json（发布目录） | **是BuildManifest，仅保留为来源材料，不直接放进包作为PluginManifest** |

可信测试侧调用local-host现有公开`sandboxPluginManifest`，以实际pluginId、发布名称、界面presentation与合法effects、临时测试publisher指纹生成包PluginManifest；project scope不写Home runtime，固定v1=1.0.0。用既有payloadOf结构：payload.schema_version=1、payload.manifest及同内容的包manifest.json、四份原件按path/content_base64入files；signPluginPackage使用现有plugin-runtime公开函数签名，不复制签名算法。复用夹具仅限签名/文件封装，不能调用其带手写CODE/contract的signedPackage来替代真实产物。

v2=1.0.1，四份原件与v1逐字相同，只改包Manifest版本及upgrade_compatibility包含1.0.0（用现有helper upgradesFrom），更新包内manifest.json并重新签名。两包同pluginId、同publisher；这是回放的机械版本，不冒第二次模型生成。公钥/签名可入fixture，私钥只在临时测试侧使用后清理，不给生成Agent、不入库。同plugin+publisher的buildId按现行packagedRelease派生，不因包版本自动变化；capability_id在安装发现时绑定，不能反向更改oracle或新增版本化命名规则。原件无法无损表达当前包格式时报告具体差异WAIT，不豁免形状。

runner最小增量：给既有corpus source增加真实sandbox package分支，保留原directory/packed两路。包分支复用RAC-792的真实resident Host + CLI install预览/confirm/pin；升级走现有已实现安装生命周期/本人确认入口，不用platform.upgrade一个pluginFixtures里的sandbox定义。现有nextVersion只适用于原两路，不能拿改内存Manifest冒充签名升级。每份样本自己的临时Home，发现并调用v1动作→写固定业务值→真实同发布者v2升级→读同值与固定结果→重启后同安装/数据仍在。未安装前无动作、预览不写和安装后pinned信任沿原公开路径核。

项目级现成升级链为PluginInstallService.preview/confirm→assertUpgradeOf→installed-plugin-host.installPackage选择install/upgrade→installedLifecycle/changeInstalledVersion；CLI仍是`molis-work plugin install <v2包> <project-id> --confirm`，不是新升级后门。记录真实结果同install_id、同plugin/publisher、v2 running；重启真正从保留v2包启动。BL623-01的正向升级/重启结构可复用。RAC792旧注释“无升级入口”及未写兼容声明的拒绝不作为此路径不存在的依据。T141 Home升级、T143 Home模型服务、T149 Home签名身份均不是这两个project样本的前置；生成时创作台调用模型不等于样本声明模型服务。

package分支只增加有限前置写/固定读回步骤和附件所定投影，不造通用流程DSL。报告保留load/install、before、upgrade、after、restart及restarted_read每步真实结果；未执行保持null并标原因，不能以ok:true掩盖缺步骤。清单add只在before阶段一次，after/restarted_read只list。原directory/packed语义和RAC791拒绝全部保留。

复用现有测试夹具/包签名算法，必要时抽取原RAC-792已有夹具的最小共用函数；不新增生产导出、不加source/dist混用、私有深引或虚构信任。若当前工具没有可复用的包安装/升级公开接缝，先给根具体阻塞，不能为corpus私开绕过安装授权的入口。包分支是现有runner的必要适配，不是新增执行框架。

## 4. provenance和安全材料

每个样本README记录：生成基点/Skill和提示词版本、provider/model非secret标识、简报、开始/结束时间、生成/修复轮、代码包真实来源、人工修改diff、G1等实际检查结果、v1/v2包与动作引用及冻结oracle。记录“模型生成”和“本机打包/签名”两种来源，不把手写sandbox-package.ts现有fixture包装成生成样本。provenance用简短人读README，不新建hash链/状态manifest；包本身已有签名和校验，不重复造完整性机制。

只用合成资料/本地存储effects，样本运行无需模型/网络/真实账号。生成者只读该临时工作区，不能挂用户项目、真实Home或Keychain。入库前读源码/清单/prompt、扫描临时绝对路径与凭据；secrets:check按项目推前流程，不在文档/报告输出token、credential_ref、账号地址或原始模型请求头。留存原始答卷若含敏感内容先在临时范围人工核，原密钥/完整Home始终不提交。

## 5. 文件范围、体积与锁

预期改：tests/fixtures/replay-plugins/corpus.json、其下新增2个样本目录（源码/清单/v1-v2包/README）；scripts/replay-plugins.mjs的包分支、tests/replay-plugins.test.ts精确预期列表与必要包路径断言；现有安装夹具确需共用才最小调整。不另建model runner、数据库或状态系统。CONTRACT-CHANGES与w5-02 slice的待补状态由根串行精确更新。

体积基准：当前corpus.json 1035字节；公开plugin-sample/index.mjs 3902字节、manifest.json 9374字节。新样本尚未生成，不能预报实测大小。目标是每个小型源码/清单加两代码包，不入二进制依赖、构建缓存、完整模型trace；交作者时逐文件列字节和总量，异常增长回到产物必要性核查，不能将大材料藏在未计量目录。新fixture不是新HTTP资源，也不是.impeccable评审图。

locks.json为本轮27个open PR完整分页文件核对原件：没有PR改replay-plugins语料/runner/测试或probe-installed路径，未见已提交待采用的对应样本；这不排除作者尚未提交的私人产物。CONTRACT-CHANGES被保护#1101占用，文档差集只交根，不进入或改保护分支。领取前根再次fresh核认领/head/路径。当前builder/SDK/共享包如被其他单锁住，本片不动其实现，只使用最终采用版本；生成和回放只在独立临时环境。无锁不等于已授权模型调用。

## 6. 模型、账号和费用的非secret现状

代码已确认创作台通过studioModels读取所选provider/model配置与引用，凭据只在内部resolve；smoke会因隔离Home无可用文字模型SKIP，退出0不能当成功。历史T315报告使用MiniMax真实调用，只证明当时隔离配置可用。当前可用账号、余额、速率/价格、当前隔离Home是否仍存在或有效均未核验；没有为“确认可用”读真实Home/env密钥、执行Keychain命令或发试探请求。

执行前根明确：批准的独立Home与模型选择、固定两个样本、每样本最大耗时/修复轮、总token或金额上限及失败后的停点；作者仅在授权隔离配置中检查非secret的provider/model/启用状态，费用按服务商当次可用信息核实。设计到实际代码完成比smoke长，当前没有足以给美元估算的token/输出量依据，不捏造固定成本。生成阶段保留usage/耗时，超预算停止并交失败产物，不无限重试。

## 7. 验证与完成边界（尚未执行）

macOS package分支须真实完整运行，其他不支持平台明确返回样本status=unsupported、ok=false，步骤未运行=null；整个corpus不得报告全部通过，顶层退出非0并说明范围。原directory/packed仍照常运行，不能因package不支持将它们一起skip。CI若只验证原两路，须明确列该子集及两真实样本unsupported/未运行，不能抵Mac新增样本。此片无需改CI、放宽门禁或把SKIP算成功。

生成与runner改动分别留准确base/head/tree。后续获执行授权后经公共build槽正常整体build，包安装/升级回放在macOS沙箱及独立Home按jobs1；完整tests/replay-plugins.test.ts保持RAC-790两原样本、加入真实生成样本的load/run/upgrade/run_after及固定业务读回；RAC-791三个坏样本不放宽，RAC-792真实安装/重启证据按实际输入核抵。新增source分支至少有错误包/错误oracle的对应失败，不重造大矩阵。失败和SKIP单列，不能将smoke设计冻结或文件可解析当真实安装通过。

boundary、merge-base health、test-import graph、推前secrets按实际diff执行；full档由根按runner/夹具最终影响核定，实际CI/Full与本机必要沙箱证据分账，本机不擅跑Full。无需真实模型参与日后每次corpus回归，生成只是一次来源采集；无需真实Home或用户真实数据。整个W4-01及W6复合验收仍由根按既有编号/已迁生命周期一起结算，本片准备不签完成。

## 8. 根执行前需要解除的条件

先核原ac-registry作者是否有未采用样本；确认A3在最终基点适用差集；根批准本机Agent时段/成本与独立配置，确认本书两附件和runner精确修改范围，fresh核锁并串行文档。项目升级能力已在main，不等待T141/T143/T149，也不因BL589通用工具未做推迟本片机械测试包装。环境授权必须能兑现实际隔离，临时cwd不等于完整文件访问隔离；不得挂真实目录补能力。当前只交最终WAIT候选，不生成、签名运行、构建或安装，不占新号。
