# DV3 — Plugin 作者完整开发路径

依据 accepted `goal-reorg-dv3` revision 1；日期 2026-09-05。目标是干净目录中的首个真实 Plugin，不以 SDK 类型或 CLI 帮助页替代完整交付。

## 当前证据与边界

SDK 已有 definePlugin/polling helper；Runtime 已有签名身份、grant、安装/启动/崩溃恢复/卸载；UI Host 与 Artifact owner 已实现。Plugin CLI 仍仅 package descriptor，examples/plugin-sample 不存在。SDK 内嵌 Manifest 校验，Runtime 另有有限的安装身份检查；尚无可安全接收外部 JSON 的公开 Contract parser。PluginStartContext 目前只有身份和 requireGrant，不能据此声称插件私有存储或 Artifact/UI 接线已提供。

保留原官方 Integration 行为、身份/grant/版本规则与现有公开入口；补齐作者侧调用和开发工具。不建立第三方市场，不发布到外部 registry，不处理用户密钥，不安装到真实用户 home，不改变本地私有/主动共享原则。Sample 是 Molis Work Plugin，不是 Codex Plugin，不使用 Codex plugin scaffolder。

## 顺序与模块职责

1. Contract 拥有 Manifest 校验；将 SDK 原校验迁入 Contract 公开入口，补外部 JSON 结构检查，SDK 保留原错误类/入口兼容。Plugin CLI 首先提供真实 validate 命令，拒绝不兼容版本和损坏输入，不能执行入口代码或伪造安装成功。
2. 作者 SDK 导出必要的 Plugin/UI/Artifact 公共类型；通过具名、按安装身份/grant 绑定的 Host 接口提供私有存储、Artifact 生产/消费、UI 注册。复用既有 Runtime、Artifact、UI owner，不在 SDK 建 Store 或复制权限算法。代码隔离的现有参考实现限制必须明示，不把 in-process 调试称为沙箱。
3. CLI 创建可运行源码、校验、调试、打包；签名交给显式安全 Adapter 或调用者提供的发布环境，不在源码生成虚假官方签名或预置私钥。安装/运行与错误结果必须真实来自 Runtime。示例位于 examples/plugin-sample，排除生产 workspace。
4. public testing fixture 组合真实 owner；从干净临时目录经 CLI 脚手架运行样例，验证私有数据不串签名、Artifact type/schema 消费及 id/version 引用、UI 注册/卸载、权限拒绝无副作用和版本不兼容。覆盖实际重启/错误路径，不用 fixture 自证。

允许路径：packages/contracts 的相关公开 platform 类型、packages/plugin-sdk、packages/plugin-runtime、必要的 Host 接线、tooling/plugin-cli、examples/plugin-sample、相关 package/lock/boundary 配置、对应 tests 和开发文档。新信息改变接口或隔离方案时先补本计划再编码；不迁其他 Module 业务。

## 验收与命令

- dv3-boundary：公开包入口，无 deep import、跨 owner Store 或重复业务算法；调用链能定位到唯一实际 owner。
- dv3-legacy-exit：样例不依赖仓库内部路径，不进生产 workspace/发布链；没有伪装第三方生态。旧 SDK 校验职责迁出后 caller 使用 Contract。
- dv3-result：干净目录脚手架→校验→安装/运行→私有存储→Artifact 交换→UI 注册完整结果，另验证权限拒绝及版本错误。前述每项须实际执行，未完成一项就不提交整项通过。
- 按切片运行 Contracts/SDK/CLI/相关包 build、根 TypeScript、Plugin 相关定向回归、pnpm boundary:check、git diff --check。整体真实前后端 E2E 仍在全部开发后执行。

完成等级：开发者路径功能可用；不自动等同外部发布或任意不可信代码隔离。

## 进度

第 1 步已实现：Contract parser、SDK 转调、真实 CLI validate 和公开可执行 bin；6 项解析/CLI/官方 Integration 回归、Contracts/SDK/CLI build、根 TypeScript 与边界检查通过。CLI 已加入 migrated build，保持干净构建能运行其测试。还未提供脚手架、安装调试和完整 sample，DV3 保持进行中。

后续进展：CLI create 和非 production workspace 的 examples/plugin-sample 已建；公开 SDK 类型、私有 SQLite 存储、官方 Artifact client、UI client、Local Host executor 已接通。11 项相关回归通过；另有干净目录 CLI scaffold → pnpm pack → npm offline install → public SDK Plugin → Host 安装/缺权限拒绝/授权 → 个人 Artifact/私有计数/UI → crash/recover/uninstall 的端到端开发者测试通过。该测试仍通过 Host API 运行，完整 CLI dev/打包/签名流程与 public testing fixture 尚未收口，不能提交 DV3 完成。

环境记录：pnpm install 遇到现有 node_modules 需要 purge 的非交互拒绝，未允许重建依赖目录；lockfile-only 更新成功，pnpm pack 与临时目录 npm offline install 成功。pnpm run 的依赖自动检查也受影响；当前使用已安装 TypeScript 的实际 bin 构建、直接运行边界脚本和测试，未伪称标准 pnpm build 已在变更后通过。后续开发环境/分发验收需收口这个问题，不改用户全局配置。

样例代码模板触发真实边界误报：scanner 从 `export const ... =` 跨过模板字面量匹配到模板里的 `import`。修正现有 test-kit import 提取的声明匹配范围并增加回归，不能靠增加无实际导入的 CLI dependency 或放宽包边界压掉误报。

## 本地分发包与签名切片

开发工具使用可检查的单文件 JSON bundle（schema_version 1，Manifest 与明确列出的相对文件/base64 字节），不引入自定义压缩器或执行 package lifecycle scripts。pack 只读取 package.json 的显式 files 列表及 package.json/manifest.json，拒绝绝对路径、父目录跳转和 symlink；入口必须包含在包内，Manifest 文件须与声明一致。CLI 对 bundle 输入设置 64 MiB 上限并报告，不假装支持无限大小。

签名能力归 Plugin Runtime：Ed25519，签整个确定序列化 payload；Manifest publisher.signature 为公钥 SPKI 的 SHA-256 身份（ed25519:sha256:...）。verify 必须使用调用者显式指定的可信公钥，同时校验签名与 Manifest 身份。未签名开发包不被 verify 当成发行物；同名不同签名仍按原 Runtime 规则是不同安装身份。既有官方 reference 的字符串身份不静默转换，不因此宣称已签署现有官方发行物。

CLI 提供 pack、identity（读取公钥）、sign（显式私钥文件）、verify（显式可信公钥）。核心 signer 接口允许发布环境/安全 Adapter 实现，不要求把密钥交给 SDK 或 Plugin。实现测试仅生成临时密钥，不访问用户现有密钥、不发布 registry、不授予新 Runtime 权限。后续开发加载/安装入口必须在执行代码前验证对应身份与文件内容，不能只校验外层 Manifest 后执行另一份代码。

## 开发调试与公共 fixture 接线

开发运行入口采用 `molis-work plugin dev <source-directory> <isolated-state-directory> <comma-separated-grants> --allow-unsigned-development`。明确标记执行本地、未签名开发代码，不是 sandbox 或已审核发行物安装。状态目录必须新建/空目录或已有 Molis Work 开发标记，不能误用用户项目。主 CLI 仅委托 Plugin CLI，后者调用注入的具名 development runner；项目数据库初始化仍由唯一 root Local Host composition 装配，禁止在 CLI 重新构造 Store/Coordinator。

Local Host 的 public development fixture 执行 install/start/health/poll/render/uninstall，使用真实 Runtime、Artifacts 和 UI owner；安装记录及私有数据由 Runtime 自己的 SQLite repository 持久化。调用结束撤销代码/UI，保留 Artifact 与个人数据，下一次调试恢复计数。加载前检查 Manifest 与 local entrypoint containment，加载后检查 definition.manifest 一致。源码模式明确授权执行任意本地 JS，不把 grant 当成 OS 隔离；签名 bundle 的验证不会静默授权执行源码目录。

第 2 步的 Artifact 接线先明确为：作者只得到 `publish`（个人默认、不能自填 board/actor/producer）和 `read(id, version)`；Host 绑定项目、用户和安装 Manifest。官方 Artifacts Plugin 持有具名适配器，调用既有 Artifacts public API，按 Manifest 的 type/schema 与 Runtime grant 判断；SDK 只公开类型，不复制内容规则。读取不限制生产者 Plugin，但个人 Artifact 仍限当前用户；Team 分享沿用现有用户授权路径，不借本样例自动开启。此接口不是任意 method/unknown bus。

持有 Host client 的代码在卸载或崩溃后不能继续写入：原 Runtime context 的 requireGrant 只检查冻结 grants，旧引用仍可调用。接入实际 Host 写能力时，为每次启动建立可撤销 context；启动失败、crash、成功卸载撤销，recover 创建新 context，不能让旧 client 随恢复重新取得权限。此为当前能力接线的权限边界，不扩展自动授权或隔离承诺。

私有存储由 Plugin Runtime 拥有独立 SQLite table，以 Runtime 生成的签名绑定 install_id 分区。Host 注入数据库，作者只见具名 get/set/delete 字符串接口，无路径、SQL 或 namespace 参数；JSON 结构由插件自行编码。Manifest + 当前 grant 都必须含 storage:private，复用同一可撤销上下文。不同签名不继承值；重启可恢复，单条写入用 SQLite 原子语句。卸载是否保留由 Host 按原 retain_private_data 决定，不由私有存储擅自删除交换后的 Artifact。

UI 使用现有 UiHost 的注册/挂载，不创造第二套 HTML 系统：Host 绑定 Manifest + context，只允许声明的 contribution ID 和自身 plugin_id；注册/移除检查 ui:register，渲染也检查当前 grant 生命周期。返回作者 client 与 Host-only dispose，Host 负责停止时撤销所有本次注册。描述符在注册时复制，避免后续修改改变已验身份；所有 Slot/格式兼容仍由原 UiHost 判断。接线执行器归 Local Host，通过可选 `context.services` 提供这三类具名 API，原 Integration start 无需改动。

Host 停止 hook 抛错也必须撤销本次 UI；卸载失败不能仍假装 running。Runtime 记录 crashed、撤销旧 context/contribution，保留数据与错误供重试；后续 uninstall 可从 crashed 完成。启动失败撤销已注册 UI，但不跨 owner 回滚插件已经主动保存的个人内容，避免吞掉部分成功结果。
