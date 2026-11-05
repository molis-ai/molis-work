# 第 02 批：稳定摘要、签名字节与服务身份

状态：2026-11-05 隔离实现与定向验证。需求来自[第③项开工检查](../../specs/post-anticorruption-roadmap/reference/batches/02.md#origin-reset-preflight)的 N4、N30。本片不操作真实 Home；已有请求摘要的切换仍依[发布检查单 §4](../releases/CHECKLIST.md#4-真实-home搬开后干净重建)。

SDK 的 `canonicalJsonValue` 按原始 UTF-16 码元排序。产生摘要或签名字节时使用同一模块的 `canonicalJsonText`，直接输出文本，避免整数形态键被 JavaScript 对象枚举规则改成数值顺序。数组保序，不对 Unicode 做归一化。IM、Memory 的服务描述符与 `schemaVersion` 归一到 v1/1；Memory 的其他工作保持原暂停决定。

## 消费边界

| 消费方 | 使用方式与保留的行为 |
| --- | --- |
| Goals 请求摘要、Agent 动作摘要、Home 选项修订、SDK schema 比较 | 默认沿原 `JSON.stringify(canonicalJsonValue(value))` 路径处理非 JSON 值：对象省略不支持的字段，数组补 null，顶层可返回 undefined，BigInt 拒绝；对象自有的 toJSON 沿该原路径执行。Home 用于修订的选项排序也不再依赖 locale。 |
| Runtime 清单摘要、签包及项目库形状比较 | 显式 `"null"`，沿原协议把不支持的标量写成 null；不对对象调用 toJSON。原签名资料不重签，清单版本和身份校验照常执行。 |
| 安装器配置指纹、Feed signal 正文摘要 | 显式 `"literal"`，保留原文本序列化对不支持值的处理，不把旧的输入边界改成新的 JSON 清洗规则。实际产品输入仍由各自入口校验。 |
| Builder 冻结资料与生成的沙箱测试 | 使用 SDK 的值投影，保留深比较和原始值语义。生成的测试入口同时携带该函数实际依赖的 SDK `isRecord`，没有另一份排序实现。 |

Coding 的配置读取只做两次读取的等价比较，不属于持久化签名字节协议。它从 SDK `/browser` 直接导入并转出纯 `jsonComparisonText`，沿原生 JSON replacer 按 UTF-16 排键，在替换前保留 toJSON 行为。这个比较工具与持久化序列化器各有明确用户和原有值语义；不把服务器的多种非 JSON 字节模式带入浏览器。实际 coding.js 从 290006 降到 289994 字节，净减 12 字节；现有预算的实测下调由统筹在最终合流同步。

## 验证

- **N4 / 公共入口**：固定字节断言覆盖嵌套、数形键、非 ASCII、组合与非组合 Unicode、代理项、数组顺序和各自的非 JSON 边界。真正启动 en-US、zh-CN 新进程，字节逐字一致。首个公共合同提交 `830b7eef20` 的入口、子路径和外部作者样本共 18/18。
- **N4 / 持久化与重启**：`tests/canonical-json-consumers.test.ts` 在两份隔离 Home 中分别执行英文→中文、中文→英文重启，共四个真实 Host 进程。Unicode/数形字段的报告重放原回执，只有一条报告；相同键改内容拒绝，事件列表与游标不变。
- **N4 / 签名**：`tests/plugin-package.test.ts` 为现行包验证两个语言环境的签名、清单摘要与签名字节一致，篡改正文得到 `plugin.signature_invalid`。两份原始 v2 来源资料只通过 Node crypto 核原签名，仍被现行清单解析器拒绝，不把历史资料变成可安装包。
- **消费链路**：15 份既有文件 413/413，加最终 Host 重启文件 1/1，合计 16 份文件、414 个断言通过。涵盖项目库拒绝、动作建议、Home 选项、Builder 生成测试、安装器、Feed、Coding 产物、Goals、声明检查、发行物、私有数据和升级。首次新夹具的项目引用形状错误及内存/持久化 JSON 原型差异保留在首败日志，修正夹具后只重跑该文件，没有修改生产语义或减少业务断言。
- **B2 / 浏览器读比较**：轻量提取的整体构建通过；`canonical-json-value` 和 `coding-client-bundle` 两份文件 12/12。实际以 browser 平台打包并执行，固定断言覆盖 Date、自有 toJSON、undefined、函数、Symbol、稀疏数组和 BigInt 拒绝。Coding 直接使用同一函数，未用别处压缩抵消体积。

核心摘要/签名范围的整体构建、健康和 51 项页面预算通过。轻量 Coding 提取的预算记录须随上述 12 字节实测下调，不放大预算。Home 提供方删除重复排序后由 182 行降到 180 行，仅同步其已有巨大单元例外的实测 size；门禁逻辑、阈值和理由不变。共享核心的最终 CI Full、真实 Home 切换及本人验收分别结算，定向通过不代替这些结果。
