# Shelf Runtime 迁移 Plan（负责人：主会话统筹，执行待分配）

状态：只读规划完成，未实现。基于专属 wt-shelf-runtime / 8e0152907；唯一需求仍为 specs/repository-anti-corruption/spec.md 的 W5-01，主会话接受后把本计划的行为/验收并入同一 spec，不另建第二份需求。目标是保持所有现行动线的功能可用迁移；全量、真实模型和本人验收分别列证据。未安装、构建、测试、启动 Chrome 或触碰真实 Home。

已使用仓库 molis-plugin-dev 与 molis-prologue-ai Skill，并对照 PROLOGUE-AI、包 README、并行规则和 roadmap-2026-10-07.md 的 W5-01/§4.6。roadmap 中旧的缺口计数只作线索，以下以当前代码为准。

## 1. 现状与真正根因

Shelf 的 hybrid 不是“只剩旧 URL”：

1. `apps/local-host/src/shelf-actions.ts` 把个人 SHELF_ACTIONS 与项目 SHELF_PROJECT_ACTIONS 分别手动注册到 Host；`project-host.ts` 有两处 provider 装配。个人动作调用 `openShelfStore(home, probe, materials, ai)`。Shelf Module 拥有 catalog.json v1、files/<item>/<name>、jobs/<id>/input|output、剪贴板和设置；它不是 SQLite 插件。
2. `plugins/native/shelf/src/plugin.ts` 的 Runtime 只提供 5 个项目动作（成果列表/预览/接收、材料输出读取/选择），要求 outputs。`project-plugins.ts` 给它注入 ShelfResultPorts，组合 Coding 结果转换与个人副本写入。
3. `shelf-native-plugin-http.ts` / personal-native-plugin-http.ts / web-request.ts 承担个人 HTTP、项目材料保存和 96 MiB 上传。客户端、桌面 Rust 的 shelf_http.rs 都用 /api/shelf；桌面 jobs 请求还有 620 秒超时分支。只改浏览器会让拖放、轮盘、剪贴板失效。
4. `shelf-ai.ts` 不只是模型调用：它递归准备冻结副本，发送原图、提取 PDF/HTML/文本、组织 coverage、执行领域结果验证，并返回完整 BoundedInferenceReceipt 与 validateResult。业务编排应归 Shelf；模型配置/密钥/调用/可信绑定复核仍归 Host。当前公共 model.complete 尚不能完整替代它。
5. 个人内容跨项目唯一，应该由 Home Runtime 一个实例拥有；但现有 Home activation 不提供项目 artifacts / processItems / inputs / outputs。`plugin-scope-entries.ts` 明确拒绝同一 plugin id 同时在 Home 与项目启动。不能通过“Home 个人实例 + 原项目实例”宣称迁完。

## 2. 保留、替换、忽略

保留：全部动作 id/version/schema/受众/权限/成本；常开侧栏而非新增主区页面；首次自动放入试用示例.pdf（一次性 seeded_sample）；catalog v1 与现有目录及历史内容；多选、文件夹、PDF预览/OCR/原图、网页抓取、编辑副本、结果再次作材料、剪贴板隐私、原件不变；独立 AI 模型选择与全部人工终端 engine；完整 reported/estimated/unknown 回执；失败任务顶层 snapshot；固定成果接收/原来源/重复接收保留编辑；固定项目材料版本/默认连线/显式输出选择；桌面拖放/轮盘/热键及终端恢复。

替换：Host 逐插件 provider 与短路由、Shelf 专用 AI 编排、项目监督器里的 ShelfResultPorts、Host 直接写 ShelfStore，最终收敛到 Home Runtime 的唯一动作/路由提供方。领域代码保留在 Shelf owner（现 Module 可继续作为 owner 实现），不以这次迁移为由复制第二份 Store。

忽略：不重做 UI、提示词、recipe、数据库格式、终端机制；不迁 SDK、不加任务平台、通用文件管理器或任意服务 map；不把个人架子复制到项目。部分前置完成不得把整个 Shelf 标 completed。

## 3. 依赖核对与必须补的具体合同

已满足：Home 常开监督器；动作原 invocation/安装生命周期；materials.extract/readSource 的授权与取消；精确 model selection 和已登记指令；模型调用 600 秒/12000 token；有限后台授权（Shelf 当前 runJob 等待完成，不必改后台）；项目删除的可信同步 live-owner 接缝。新模型选择不可用不回退。

未满足，必须在切换前实现并用真实 Runtime 验证：

A. 模型结果与原图。`plugin-model.ts` 只有 text/value/简单 usage，Host 会把完整结果压成 reported token 数；请求没有 images。建议在现 model.complete 同一路径补所需字段：受限原图输入（每项 label、mime、bytes 或可信 owner 文件引用，不能接受 root_path/任意绝对路径），返回原 BoundedInferenceReceipt、JSON 解码值，以及可信同步“本次模型绑定仍有效”检查。成功与失败都保留已有 receipt；未知用量不能补零、未报模型不能填请求模型。复核需覆盖 complete 返回之后、Shelf 最后 beforeEffect 等待期间配置变化；仅在 complete 返回前检查不够。检查权来自 Host 保存的此次 snapshot/闭包，不让插件传 revision 自证，也不授予写权限。bytes 方案可用现有 agent-host 可接入能力时优先；若必须短期 staging，限定可信插件目录并在结束/取消清理，不建素材仓库。

B. 模型选择列表。Shelf 设置保存在 catalog.settings.model_selection，不应套 Jelly preference/custom provider 写入器。需要只读 metadata choices，输入无身份/路径/凭据，输出已有 ShelfModelChoice 等价的 provider_id/model_id/display metadata，默认与显式选择语义保持；保存选择仍归 Shelf catalog。发现不解密、不联网。不要为了读列表给 Shelf 开 Jelly 的 provider 编辑权限。

C. 文件与生命周期。现 files 服务仅一层 ASCII 文件名、create-exclusive/remove，不能承载 Shelf 的 Unicode 文件夹树、编辑覆盖、catalog 原子替换、冻结输入与任务目录。不能把 `directory` 偷传成 Home root，也不能为迁移把 catalog 改 SQLite。需一个可信声明限定的 owner 根与现行路径操作接缝，输入仅 owner 内相对路径/字节，读写拒绝 traversal/symlink/跨owner；写前 beforeEffect + 当前代次复核，停止后旧函数不能写。声明仅在可信 Host 条目，不在 Manifest 或请求里给根路径。具体最小操作应从 Store 的 read/write/rename/mkdir/copy/tree/remove/freeze 当前调用归并，而非先设计 VFS。首次示例写入、构造函数 mkdir、启动恢复属于明确的可信生命周期效果，不能把 query 的副作用漏过授权。Module 对原件 origin_realpath 的只读 Hash 校验与桌面拖出真实路径要单独保留可信边界，不能让普通网页输入路径获得读取权。

D. 项目作用域服务。Home 的项目动作需要从当前调用上下文选择项目、当前 actor、现行安装/项目可见性，不能用 start context 的空 project 或输入 project_id。最小需求是固定版本 read、当前插件的过程项 head/readOwn/record、按已声明 consumes 列出候选、inputs.reference、outputs.reference/select。每个操作绑定当前已验证项目，写之前再次检查项目存在及授权；持久输出仍写原项目图。现 processItems 只有 record，artifact head 针对成果，不能用它假装拥有 Shelf 过程项的最新版本。这里同时消除 Host 手算版本/producer 的 publishShelfMaterial；同内容复用/旧输出CAS语义保持。不要暴露任意项目 services 字典。主会话应决定此项与正在做的 Pages 项目桥共用哪个现有合同，避免两个分支各造一套。

E. 生产者读取。coding-shelf-material.ts 当前 import Coding 实现的 preview 函数。迁入 Shelf 后不得改成 plugin→plugin import。使用 Coding 公开 owner 动作返回固定报告/变更的预览内容与来源，或把真正共享的形状验证留在公开 contract；Shelf 负责复制文案/指纹。列表必须保留未接端口但已保存的项目成果，不能只列两个 inputs 来缩范围。

F. 本机提取 metadata 与预览。materials 已有执行能力但缺 imageTextAvailable 被动状态，需窄只读 availability；不能把 extract 存在当 OCR 可用。现 Runtime bytes 只允许 PNG/JPEG/WebP inline，Shelf 旧路径把 PDF 等内联；迁移必须证明 PDF 预览仍可用（现有插件客户端若已按 bytes 渲染可继续），不能简单改成强制下载。如确需新增安全 MIME 行为，由主会话先明确专门合同/安全回归，不能默默放宽 Host 的 HTML/SVG 拒绝。

## 4. 最小完整第一片与顺序

推荐第一片 SHM：先补 A+B 的公共模型合同，并将 Shelf 原 Host AI 路径接到同一实现验证语义等价；目标只称“模型迁移前置功能可用”。不切 Runtime 装配、不改路由、不搬数据。原因是这片依赖最少，可独立证明现模型路径没有丢原图/回执/最终绑定检查，也直接解锁后续 Shelf owner 编排。

允许范围：contracts/platform/plugin-model.ts；plugin-runtime/src/model-service.ts；local-host/src/plugin-model-service.ts 及现 host-complete-text/configured-models 必要窄复用；Shelf AI 适配与对应 tests；配套 API 快照/开发说明由主会话串行纳入。不得动 Prologue vendor、通用预算、门禁规则；不得先把 Shelf 转 Home 后保留隐藏的旧 Host provider 兜底。若主会话同时写公共模型文件，此片先交接口/测试需求，由唯一 writer 串行实现。

第二片：C 的 owner 文件生命周期与 D/E 的项目服务，分别以真实 fixture 验证后合入；同公共文件不能并行写。可以先在 Shelf 目录提取纯 prepare/finalize 领域编排，但只有主会话已确定完整接缝后才执行，避免搬家后又搬回。

第三片：同一个可回滚提交切换 Shelf 唯一 Home definition、全部动作/路由/客户端/桌面调用，并移除旧 provider、项目 Shelf entry、ShelfResultPorts、旧 HTTP/AI 专属 Host。projectScopeEntries 的双实例拒绝不放宽。保持同一数据格式，回滚靠代码回退，无读取兼容分支。相关聚合文件（builtin-plugins、project-host、web-request、personal-native-plugin-http、native-plugin-api、公开出口、安装冻结表、package inventory、API/动作/资源快照）主会话串行收口。

## 5. 验收建议（并入唯一 spec）

- W5-01-SHM-01：真实 Runtime 精确选择下发送文字+原图，JSON/domain 输出一致，完整成功/失败回执保留，缺报模型/用量保持 unknown；默认选择与显式无效不回退。
- W5-01-SHM-02：源请求对象/图片字节在首次等待后修改不影响已冻结本次输入；读取发现不联网不取 secret；错权限、跨安装、动作结束后拒绝；模型返回后最终提交等待中撤权/换连接/改选择零业务写。
- W5-01-SHF-01：保留 catalog v1、Unicode/嵌套文件夹、编辑、冻结 input、PDF/图片预览；错版本与 symlink/traversal拒绝且原内容不变；首次示例仅一次。
- W5-01-SHR-01：全部 Home/项目动作仅一个 Runtime provider；页面、MCP/workflow、桌面拖放/轮盘/剪贴板/侧栏文件/人工终端同路径；旧短路由删除后的调用方全迁。
- W5-01-SHP-01：接收 Coding 报告与变更，重接同版本保编辑；保存未变材料复用版本，改内容产生新版；旧 preview fingerprint 和旧 expected_reference 拒绝；选输出不改已有 Coding 会话。
- W5-01-SHP-02：无项目/另一项目/伪 actor/隐藏或失效实例拒绝；删除项目时停止依赖该项目的原 invocation，不能污染同id重建；个人材料及已接收副本继续保留，不能新增清空个人 Shelf 的 purge。
- W5-01-SHR-02：取消/撤权/停止/重启时迟到成功与失败不写；旧 running 不自动重新调模型，旧任务不继续锁材料，显式取消可关记录；失败的授权内任务保留 error 与顶层 snapshot；部分文件恢复与原件hash保持。
- W5-01-SHU-01：真实浏览器完整多选→提取/生成→编辑→保存项目材料→选择输出→Coding消费及项目成果接收；无模型、取消、失败、隐藏返回；桌面原生路径另记实操，不以浏览器测试替代。

## 6. 验证命令与边界

实施后按单构建/单浏览器批次排期，先 pnpm build。第一片运行：

`node scripts/run-tests.mjs tests/plugin-model-service.test.ts tests/plugin-model-selection.test.ts tests/home-plugin-model-lifecycle.test.ts tests/security-invariants-plugin-model-metadata.test.ts tests/security-invariants-plugin-model-progress.test.ts tests/host-configured-text.test.ts tests/shelf-ai-host.test.ts tests/shelf-job-runner.test.ts tests/shelf-recipes.test.ts tests/shelf-settings.test.ts tests/prompt-registration.test.ts tests/action-model-scheduling.test.ts`

完成切换追加两包 README 必跑集合（去重）以及 shelf-current-format、shelf-material-extraction、material-extraction、shelf-terminal-recovery、shelf-coding-materials-http、shelf-project-results-http、shelf-jelly-cognia-images-error-model、plugin-host-services、security-invariants-plugin-materials、security-invariants-plugin-files；新增真实 Home Shelf fixture 覆盖上述编号。不能保留只 mock 旧 Host provider 的迁移“证明”。

浏览器：shelf-plugin.e2e、shelf-client-boundaries.e2e、shelf-dropagent-parity.e2e、shelf-side-links.e2e、desktop-shelf-side.e2e；原生 Rust 变更跑项目 native-checks/rustfmt/clippy 与对应 shelf_http 测试。整体 API/actions 快照、boundary、merge-base health、资源实测与 shared core 全量由主会话安排，不能未经授权调高预算或减少断言。

当前无测试结果，本文件只给源代码规划证据。最大的未决是 C/D 的可信文件与项目服务形状，公共口缺失不能由临时 Shelf 专用 Host map 掩盖；A/B 可先行，整条 Shelf 迁移仍保持执行中。
