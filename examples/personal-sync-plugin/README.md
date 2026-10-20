# 个人同步独立插件样例

`plugin.ts` 只依赖公共 Plugin SDK（以及 Node 标准库），不导入 Host、Storage 或同步协调器。集合把笔记和附件作为一个完整资产；原子私有 KV 同次提交业务数据和日志，公共 codec 显式投影原始附件字节，不上传数据库、密钥或机器路径。

真实 Host 仅在个人 Home 激活时注入 `context.sync`，本地空间和裸执行器没有这个上下文。`start` 通过 `contribution.sync` 兑现 Manifest 集合，可信 Host 再依安装身份、当前启用和用户选择装配。样例不自行调用云接口，也不安装或执行其他插件。

实际 Web 空间已复用同一个 Host 发现 Home 与项目里的已启用实现，纳入共同协调器；固定 owner 优先，不安装、补权或自动选中新集合。验证用例为 `tests/security-invariants-runtime-sync.test.ts`、`tests/security-invariants-runtime-host-sync.test.ts`，需要先在根目录整体构建，再用仓库测试入口运行。`apps/sync-worker/runtime.test.mjs` 用该作者样例与真实 Host，通过临时 Rust/WASM、D1 和私有 R2 验证完整正文/原字节、冲突及删除，不以 JSON 模拟响应替代。样例可独立打包但尚未发布；公网和真实设备验证不在本次范围。

样例的便笺属于整个个人 Home，明确声明 `belongsToProject` 为 false；项目生命周期检查不因独立便笺而误阻塞。共同 SDK 仍对未声明归属的文档报告不支持，不能把不明归属当作干净。此样例只有数据接口，没有页面，因而不伪造内容定位。


独立开发和分发：在干净目录只复制本目录源文件，安装已构建的公共 SDK/Contracts 包，然后执行 `npm run build`、`npm pack`。没有 TypeScript、Host、Storage 或 Prologue 依赖；Node 自带类型擦除生成 `plugin.js`，Manifest 从唯一 PluginDefinition 导出。归档只包含执行入口、Manifest 和说明，不包含仓库或开发状态。安装仍需 Host 的正常包校验、身份与用户授权；本地打包不等于正式签名发布。

读取动作是 `io.molis.work.example.personal-notes.read@1`，输入 `{id}`；保存动作是 `io.molis.work.example.personal-notes.change@1`，输入 `{id,expected,value}`，其中笔记为 `{text,attachment}`、不存在为 null、附件为原字节的 base64。比较原内容后同次 CAS 写入，旧编辑拒绝；调用者身份来自当前 Home。动作只面向用户，不增加 Agent/MCP 授权。每次 `start` 的处理器捕获该次文档，不借用另一 Home 的全局数据。`createPersonalNotesSample` 的 edit/read 仅是本地测试门面，分发使用默认 PluginDefinition。
