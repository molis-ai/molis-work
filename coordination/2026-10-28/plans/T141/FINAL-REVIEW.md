# T141 最终工程方案独立增量核

结论：**可作为 WAIT 工程书采用。原两项必修已在方案层闭合，无须再退回另一轮架构方案；不是 Ready、实施通过或执行派单。** 保留 `full=true`、#1672 registry 与 T143 Home 重叠文件 WAIT，新增测试 fixture 及准确写路径仍由根串行核定。生产测试控制 API 已撤回，密钥值层、公开升级与真实设置 DOM 没有被删减。

本次先列目录，读取父目录 REVIEW、revision-2 的 INDEPENDENT-REVIEW、当前 PLAN、secret-control-design、REVIEW-RESPONSE、REPORT 及 task/slice 候选；只复核原必修。源码固定本地已有对象 `86570ac4499871f46c52762f73a1cd91f68ccc20`，未 fetch/更新 refs。Home 装配、lifecycle/version/exposure、plugin-builder/secrets 及 test-imports 在方案基底 `717d14f2ab8c9cb1b447003fabb120a70b6d9dd3` 至此头没有差异。主检出仍 `08c9933d57e153d1d59bf2811f203056d4358992`，开始及结束干净。没有实验、构建、测试、浏览器、GH、coord 或产品文件写入；只写本报告。记忆搜索无相关命中，未采用历史记忆结论。

## 1. 真实返回、权限和补偿可观察

`home-installed-plugins.ts` 直接从 `./installed-plugin-lifecycle.js` 导入 `installedLifecycle`，正常装配在创建 Home storage、`pluginSecrets(home, '~home', storage)`、expose、prompts 等端口后调用一次该 factory。local-host 是 ESM、tsc 输出到 dist，公开包入口也指向 dist。方案指定的同 URL load 目标与这条链一致。

先注册同步 load hook，再动态加载公开 Host 和签包 fixture，避免父测试已静态加载 Host 后才捕获；不先 import 原内部模块、不造第二 URL，因而没有计划内的第二份 lifecycle/context/controller。追加代码包的是模块内可重新赋值的函数声明 binding，不是给只读 module namespace 赋值；真实 factory 同 context 调一次，原 lifecycle 原样返回，异常不吞。`APPROVED_KEY` 与 version 模块的原 ESM 循环不被复制。按此实现能够捕获 Host 实际使用的返回值；目前仍是静态可行判断。

真实 signed upgrade 继续执行 trusted/state/package/approval/version/secretRefs 检查；`changeInstalledVersion` 仍负责 Runtime 切换、same 安装/世代复核、apply、批准、expose、prompts，以及失败后的条件 restore/rollback。现有 `pluginSecrets` 的较新值条件恢复也未替换。成功、apply 后失败、较新停启及直接密钥编辑通过真实 owner 读回，有能力发现“仅 wrapper 命中但没有写入/恢复”的假绿。

该受控 lifecycle 调用**不证明公开 preview 的 actor/project/TTL/一次性消费或用户输入密钥**；候选已经正确把这些留给独立公开路径/DOM。它也不把 lifecycle 概括为每次都重新做 consent 确认。原公开入口权限与旧拒绝断言保留，未出现把测试控制能力加回生产对象的必要性。

## 2. 加载、性能和门禁风险的结算

Node 24 官方文档支持 registerHooks 的同步同 realm、注册后 dynamic import 及 nextLoad 链；API 加入版本早于仓库 Node>=24 要求。故“同进程捕获槽 + 加载时追加包装”有 API 依据，无明显必然加载失败。参见 [Node 24 module 文档](https://nodejs.org/docs/latest-v24.x/api/module.html#moduleregisterhooksoptions)。实际 Node/tsx 版本、返回 source 的编码/format、末尾追加及加载次数必须由实施证据证明，当前均 NOT RUN；不能把文档依据写成捕获测试已经通过。

包装只在隔离 child 存活；每次 load 一次目标匹配，非目标透传，目标一次 source 追加、factory 一次同步捕获。没有业务调用热路径轮询、重复实例或生产常驻 hook。静态未见需要性能专项或另造测试控制系统的理由；实际启动时长仍未测量。deregister 不会撤销已求值的模块包装，因此 child 退出/Host 关闭才是最终隔离边界，当前方案已包含这些清理，不可实施成 deregister 后复用同一 child 执行其他独立场景宿主。

`refs.mjs/parse.mjs` 确实只按 import/export/import()/require 字面量计内部引用；`graph.mjs` 将未被父测试导入的 fixture 单独作为进程检查。新 fixture 使用公开包、已有测试 fixture 与明确的 built URL 拦截，不需要新增生产导出或内部 import。这里仍是**内部依赖拦截**，不是公开 API 黑盒；候选已透明说明，没有把扫描未覆盖当成封装正确性证明。现有签包 fixture 导入公开 Host，必须保持在注册后动态加载。实际新文件的 import/混用与 merge-base health 仍待执行，不修改 gate/baseline。

## 3. 原屏障必修已闭合，落实时注意一个准确称呼

真实 exposure 顺序是 `exposeInstalledPlugin → registerProvider → exposed.set/changed → await catalog()`；因此先观察重新登记，再释放原 inspect，最后 await enable/旧升级，避免先等 enable 完成而卡在同一 catalogPending。升级的 apply/批准写入在 expose 前，inspect 内的真实 v2 snapshot 加 owner 读回可以证明屏障已到达。立即挂拒绝观察、finally 先释放再收尾也已明确。

**“ActionService provider 登记事件”应落实为测试侧对真实 `service.registerProvider` 的透传观察，而不是调用一个并不存在的生产订阅 API。** 当前 ActionService/CapabilityRegistry 没有该事件接口；现有 `installed-plugin-host.test.ts` 的 W2-18-UPGRADE-SECRETS-01 已用 `t.mock.method` 包住真实方法，先调用 bound 原方法、返回同一 disposer，再通知 deferred。新 child 可按同一语义做本地观察，匹配本安装/v2，停用完成后 arm，避免把初次升级登记或 cost refresh 当成重新启用。无需新增生产事件或另一控制 API。这是当前方案“真实重新曝光观察”的具体落法，可随根采用/作者实施说明准确化，不构成退回总体方案的新必修。

若共享 inspect 拒绝使 enable 自身清理停用，最终 disabled 是 enable 的真实失败结果，不能记成“重新启用成功”；旧升级未回滚较新版本/批准/密钥与 enable 的结果分别断言。候选已允许记录真实 enable 结果，原成功启用场景仍保留，不把超时或事件本身当最终状态证据。

## 4. WAIT 与未验证项

PLAN、接线说明、task/slice 候选均明确撤回旧 installedPackageControl 及 factory 附加 secrets/approvedFor 返回值；superseded-public-api 只作撤回历史。#1701 已合及锁释放仅按根交接采用，本线未查询 GH；RAC2447 新拒绝断言保留。#1672 与 T143 逐文件交接继续 WAIT，撤 API 不释放 Home 锁。

原 RAC 映射、source 完整 assertFree/同步刷新、真实旧服务恢复、晚回执 owner 零写入、完整 DOM 范围维持原审结论，不扩矩阵。全部动态证据 NOT RUN；实际加载、业务断言、import/health、准确组合 CI/Full、真实环境与用户验收分别结算。本报告仅允许根把此稿作为等待解锁的工程依据，不产生测试/实现授权，也不把 T141 降为 app-only。
