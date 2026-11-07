# 模型生成后端与人工验收适配的清单

后端由 MiniMax-M3.1-Flash（MiniMax CN）在隔离 Home 生成。原生成的空态投影失败、一次付费修订的共享 helper 缺失、原两份答案续跑遇到的负向表达缺口均保留。T412/T413/T414修复平台路径；用户明确批准一次人工验收／文案适配，保留后端与六类业务目标，零新增模型调用。

2026-11-02 17:58Z，c2cac66ce13e307636b8468717eacd37dd406f60 的公开 revise 实际接受一份 manual-design/1 完整设计，原两份模型 record不变；真实 prepareBuild、G1–G6、六例G7和公开publish/sign通过。只改必填提示、显式空值拒绝及读取故障／重试／草稿观察；后端 src/tests/package 原字节不变。生产状态为功能已验证、视觉未复查，不能称本样本由原模型答案全自动完成。

独立单样本生命周期在同一 c2cac66ce 输入自然通过：安装预览零写、确认pin，初始 items=[]，仅 add 一次“周五整理资料”并完整返回 added=true；兼容v2升级与Host关闭重开后，仅read，原id、created_at、正文、数量及同install/plugin/publisher均保持。原件在本机 w4-list-manual-continuation-run1 及其 independent-replay/。

原始TypeScript保留6处双重断言（as unknown as），原bundle还保留1处空catch，未通过平台源码lint；归档与签包功能验证不代表该生成源码符合平台实现的风格约束。它作为不可改写的历史输入保留，未关闭或放宽lint规则。

原始 TypeScript 与生成测试按相对路径原文保存在 [source.json](source.json)，是模型输出数据，不作为仓库实现导入或还原执行。回放只执行已签包的真实 bundle；bundle 仅保存在原签包和 v1/v2 的 files 内，不另留可执行的展开副本；原产品签名在 [release/signed-package.json](release/signed-package.json)。[v1.json](v1.json)／[v2.json](v2.json) 沿原批准方案用临时测试发布者重新签名，只改版本及升级兼容声明，源代码、界面和提示词不变，不保存私钥。包自带签名校验，不另建证据或状态清单。

固定输入与预期见上级 [corpus.json](../corpus.json)，原简报见 [brief.md](brief.md)。运行不需要模型、账号或外部网络。macOS 经真实沙箱／CLI 安装预览、确认 pin、同安装升级和 Host 关闭重开；其他平台明确报告 unsupported，不能称沙箱回放通过。原失败不被后续成功覆盖，最终承载 CI／Full 与实际采用另行结算。

回放用的 v1/v2 两份包各自保留插件发布版本，两者使用同一临时测试发布者重新签名。只更新回放包的清单格式与测试发布者，原始签包和生成源码仍可按以上路径核对。
