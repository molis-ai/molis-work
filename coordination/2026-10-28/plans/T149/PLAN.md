# T149 / BL589 最小交付缺口图

负责人：Codex起草线。只读候选，非实现/非READY；源码参考现存main `b0567bf545a74b858e4fdeddd5e66432b1065b21`。没有读取真实Home、Keychain或签名key，没有生成/签名/安装/调用模型，不改产品选择。

## 1. accepted边界

唯一需求源：`specs/BACKLOG.md` BL589，`pg011-pg017-remaining.md` §4、§10 D2甲及RAC2656～2658。T149不必等BL377整体重做，但要复用BL589“创作台发布出签名包”；可以在BL589之后接入，或根将二者同一完整交付安排。不重问已否的unsigned Home方案，不把本机签名当host_build待遇，不改变S80/S84信任。

## 2. 当前链与最小差集

| 环节 | main实际路径/行为 | 复用与缺口 |
| --- | --- | --- |
| 生成/发布事实 | plugin-builder/src/agent-workflow.ts发布时调用ports.publish后保存AgentRelease；Host `plugin-builder/studio-ports.ts:105-119`写release目录中的plugin.mjs、manifest.json、contract.json、interface.json、prompts.json | 生成/检查/发布事实继续由创作台拥有；该目录不是已签名可安装包，不靠改packagePath字段假装完成 |
| 生成包的执行定义 | `plugin-builder/installed.ts` generatedPluginManifest调用sandboxPluginManifest，publisher signature是installedSignature(buildId)即agent-built:<id>；sandboxedPluginDefinition只代理到沙箱 | 沙箱执行代理和现有release读路径可复用，不把这串开发身份当Ed25519签名或pinned publisher。保留既有项目release的已定生命周期，不默默搬旧数据 |
| 沙箱Manifest唯一生成器 | `apps/local-host/src/sandbox-plugin-manifest.ts`由Host生成/重建固定形状，目前依赖contracts、SDK图标类型以及design-system的presentation capability标识 | BL589要求共享算法进SDK、作者和Host共用同一份。SDK只依赖contracts，不能直接把design-system私有依赖搬进去；先核标识是否已有contracts owner，否则将该稳定ID置现有合同并让原owner引用同一份，不复制字面量或保留Host第二算法。公共导出/API快照按合同流程核 |
| 作者打包/签名已有工具 | tooling/plugin-cli/src/cli.ts已有pack/sign/verify/identity，package-files.ts封装路径/大小/输出不覆盖，package-signing.ts复用runtime公开signPluginPackage/verify | 没有pack-sandbox。复用既有包容器、签名验证与文件IO，新增沙箱输入打包命令调用SDK同份Manifest算法；不实现第二密码学/包格式，不误把普通开发项目pack当完整沙箱构建检查 |
| 外部签名包读取/安装 | sandbox-package.ts重建并核Manifest；sandbox-package-store.ts保存验过包，packagedRelease转换；PluginInstallService preview验证范围/签名/冲突，confirm检查actor/作用域/时限后pin/save/installInHome | 唯一S84路径保持。T149发布后的可安装产物从同一路预览/确认进入，不直接调Home supervisor/runtime.install绕过授权，不给molis-studio特殊信任 |
| Home资格 | runtime/trust-rules.ts assertHomeScopeAllowed和home-package-admission.ts按签名/沙箱及能力范围拒绝不合声明 | 未固定的本机签名不能获得Home安装资格；明确本人固定后才进入既定确认安装流程。外Home签名仍未固定，不自动信任Home来源或creator名称 |

## 3. 允许实现边界候选

**BL589完整输出**：SDK拥有固定Manifest生成与必要共享标识/纯校验；Host读取和创作台发布消费同一公开函数；plugin-cli的pack-sandbox读取现有沙箱contract、bundle、interface/prompts必要文件，产出既有包容器，再由原sign/verify签验。保留现行包读写限额、路径拒绝和payload形状，不新增包格式、归属表、数据库或兼容读。固定形状要以T143/T144/BL916届时已采用合同为准，不能拷贝旧版本后单独演进。

候选代码路径：`packages/plugin-sdk/src/`的单一沙箱Manifest模块及出口；原`sandbox-plugin-manifest.ts`所有实际消费者改用SDK（不留Host兼容包装）；`tooling/plugin-cli/src/{cli,package-files,index}.ts`及必要单职责打包模块；`plugin-builder/studio-ports.ts`发布输出必要接线。共享标识若涉及contracts/design-system，先给根精确public diff/消费者，纳入同一正式书与锁后做；不自行扩大平台规则。

**T149完整输出**：在BL589产物上支持Home范围发布，使用该Home唯一的发布者key引用、本人的显式固定与确认。签名私钥只经既有secret owner保存和取用给Host签名操作，不进入Agent输入、release目录/manifest、日志或浏览器。公钥/指纹按已有publisher格式。Home删除复用已有secret/store生命周期，不手写清理另一套Keychain值；密钥丢失/撤销拒绝，不能静默新key替换原publisher。当前只准备方案，不初始化任何key。

候选路径：studio-ports发布接线、创作台现有发布/安装选择与其actions/客户端、现有Host安装预览/确认调用方、必要secret引用owner；动作/返回形状实变才按现行合同升版。S84的准确说明、共享slice、BACKLOG归根串行。只用最小既有设置/发布流程，不重做BL377界面/全套工作流。

签名key首次创建应是明确发布操作中的副作用；普通读取/预览不初始化key。对已签产物的安装预览保持无pin/package/installation副作用，取消确认不固定发布者、不安装。已发布产物保留与安装成功/失败分开，不能用失败安装回写或覆盖release。存量agent-built项目版本不是本片数据迁移授权；若新发布包的身份/安装ID不能与既有版本自然衔接，先给根具体冲突和既有升级合同，禁止制造兼容别名或自动重装。

## 4. 验收与独立oracle候选

- BL589：同一冻结输入经SDK生成、作者pack-sandbox与Host重建得到同一现行Manifest；独立固定期望钉runtime scope、permission/effects、action/entry/routes等关键合同。不能只让三方调同函数再互比自证；旧Host算法应删除、SDK无私有依赖通过边界/真实外部作者两包安装路径。
- 拒绝：缺文件/不合法路径、超限、声明与contract不符、bundle被改、签名/公钥不符分别走既有拒绝；不落不完整输出或安装/固定记录。沿原package/signature测试，不新造验证框架。
- 发布：原AgentRelease引用的bundle/contract/interface/prompts与签名包实际内容逐项读取对应；固定input调用生产沙箱动作，返回预先冻结结果，不只验包能解析。包导出不含private key/secret引用/临时Home绝对路径，真实key仅临时测试key而非用户Keychain。
- RAC2656：Home A临时key产生的包未固定时安装拒，核零安装/零publisher pin；RAC2657：本人显式固定、预览确认后可在Home沙箱运行，Host重启从验签存档恢复同一安装和业务值；RAC2658：Home B未固定A的publisher仍拒，不用“两个指纹不一样”代替实际安装拒绝。
- 撤销publisher或调用中取消/停用后旧回执无迟到业务写；恢复、卸载/清理沿当前owner与T141已采用生命周期。升级功能如果本次依赖同安装接续，测试绑定T141最终合同，不用直接runtime.install伪造。
- 真实生成不是本片必要模型成本：可用现有合法合成release/固定bundle触发真实生产发布/签名/安装来证明管道。W4-01 corpus的真实生成来源另线，不能用本书手写fixture抵真模型样本。

工程候选甲档/full=true（SDK共享核心、安装信任和凭据边界），最终由根按正式diff排准确头独立审验/CI Full；本机只定向公共槽。API/动作/manifest变化、外部作者pack与安装路径、秘密扫描/资源实测按真实范围验证，所有结果当前均HOLD。

## 5. 真实依赖、锁与未解技术交接

没有BL377整体前置不等于可立即开工：#1675/T143占`sandbox-plugin-manifest.ts`及包格式/Home链；#1680和保护#1101占SDK index；共享SI/README等另有多PR锁。沿已存在完整快照的这些交集，只能由根fresh读头/最终路径、串行交接后释放，不进入保护分支或借用其代码。T144/BL916尚未实施的声明块不在本片猜测支持；以最终正式范围冻结shared builder输入。

发单前根需要精确冻结：①BL589共享Manifest函数的模块出口与presentation ID唯一owner；②现有产物签包的确定文件集合及发布范围选择；③每Home签名key引用存放/清除由哪个已有owner承接；④新发布签名包与既有agent-built项目安装的身份边界，只做已定新发布路径还是要承接原安装——如需承接须给原升级事实和单独具体接续，不能暗改已定产品；⑤与T141/143的安装/包格式最终基点。前四项是工程输入/接缝确认，不重新提unsigned/Home信任选项，不访问真实key做试验。

本图可供根据此审具体实现书/锁窗口，不是自动实施授权；不新增task号、号段或为了READY数拆可选P2。
