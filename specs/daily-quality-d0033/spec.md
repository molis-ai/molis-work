# D0033：真实侧栏隔离核查与结论纠正

状态：实施中（2026-11-08 用户授权优先处理日评高项）；没有产品行为变更，补真实拒绝证据与更正文档。

## 证据与方案纠正

原评估只看 side-panel 的外层 iframe 没有 sandbox，遗漏它装载的是可信宿主包装页。当前 Home 插件 HTML 经 renderHomePluginPage → renderPluginFrameSurface → 同一 mountFrame 运行在 allow-scripts allow-forms 的不透明 frame；该接线由 f562ed466 / #1018 在 2026-10-23 已引入。安装包的 renderHomePackageDocument 也经 renderPluginDocumentShell。外层只是外壳桥，不把插件脚本放进宿主同源上下文。

因此无需按原计划重新接线侧栏外层。继续加强已有 S-47 的真实侧栏拒绝验证，纠正 SECURITY-INVARIANTS 第 4 节的滞后描述。未将此结论泛化为真实 Tauri IPC 已验收：S5 真桌面探针仍待执行，当前 Chrome 不替代 WebView。

## 开工前检查

小修／安全核查；只改既有安全测试与文档，不改产品源码、UI、动作合同、注册或依赖；不新增桥、不增加生产请求或模型调用，不碰真实 Home。七项自查：开工前检查与批准范围过；仓库硬约束过；系统审查面过（两层 frame 实际调用链）；调用次数不涉及（无生产改动）；门禁过且不改规则；代码质量过（复用真实浏览器夹具，断言拒绝）；偏离已解释（旧评估遗漏已有隔离）。

## 验收

1. **D0033-01** 从项目外壳打开真实 Shelf 侧栏，插件不能读可信 parent/top DOM 或控制令牌、没有原生 IPC 对象，跨 owner 与项目桥请求均返回 403；它自己的获准内容仍可读，侧栏可以关闭。

测试位于 tests/security-invariants-plugin-pages.e2e.test.ts。干净 main d20f07c98 的既有隔离与侧栏用例 7/7 已通过，新断言与相关回归结果在 PR 记录。不新增任意插件可读父页的未经复现结论。

新增专门探针 D0033-01 已在真实项目侧栏通过；同文件原有 5 项隔离回归通过、侧栏 in-hand 2 项和平台 8 项通过（共 3 文件 16 项）。自身获准路由的正向对照使用 Manifest 声明的 GET 根路由，未放宽任何拒绝断言；未做真实 Tauri WebView 探针。
