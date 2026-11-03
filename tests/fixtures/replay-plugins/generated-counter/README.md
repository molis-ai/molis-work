# 真实模型生成的短文本计数器

MiniMax-M3.1-Flash（MiniMax CN）在隔离 Home 生成后端；最终公开修订／G1–G7／发布输入为 8315c6936745c992d75b4ef21f800baeffa81f8e。真实四例覆盖空串、中文、多行和完整对象返回；没有人工修改生成后端。

2026-11-02 的单样本独立回放在 40f86eb9f58f3e4ab39f360fdd44ab3321902927 完成：text.count 对实际含 LF 的“一行\nline”完整返回 characters=7、utf8_bytes=11、lines=2，兼容升级与 Host 重开后保持同一安装和完整结果。该有效结果沿用，未为入库重跑。原生成/修订失败、各轮模型记录与未公开费用保持原口径，不由后续通过补写；原件位于本机 w4-live-counter-submit-only-run1 及其 independent-replay/。

原始 TypeScript 与生成测试按相对路径原文保存在 [source.json](source.json)，是模型输出数据，不作为仓库实现导入或还原执行。回放只执行已签包的真实 bundle；bundle 仅保存在原签包和 v1/v2 的 files 内，不另留可执行的展开副本；原产品签名在 [release/signed-package.json](release/signed-package.json)。[v1.json](v1.json)／[v2.json](v2.json) 沿原批准方案用临时测试发布者重新签名，只改版本及升级兼容声明，源代码、界面和提示词不变，不保存私钥。包自带签名校验，不另建证据或状态清单。

固定输入与预期见上级 [corpus.json](../corpus.json)，原简报见 [brief.md](brief.md)。运行不需要模型、账号或外部网络。macOS 经真实沙箱／CLI 安装预览、确认 pin、同安装升级和 Host 关闭重开；其他平台明确报告 unsupported，不能称沙箱回放通过。原失败不被后续成功覆盖，最终承载 CI／Full 与实际采用另行结算。
