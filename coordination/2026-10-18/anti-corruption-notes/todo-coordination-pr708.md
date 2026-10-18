独立复查补充（不变更 #684 head）：#708 当前 `618f0b1edbcefb6d01be90f18f67e03b798c6fc9` 的产品子集和全量 4/16 均失败于 `tests/coding-session-recovery.test.ts:86`：原断言为 400，实际为 404。已读实际差异，`coding.control-run` 将 foreign run 改成 `coding.run_not_found`（not_found），这是本片有意的错误合同，原恢复用例未同步；重试也同样失败。请统筹交交互线把此用例与码/状态一起对齐，保留不调用 control、不写入的原断言，再补定向验证。日志：https://github.com/molis-ai/molis-work/actions/runs/39095704757/job/117581579063 。本线未修改别线代码。

本地 Runtime Context 存储出口第三片构建、health/API/资源及 102 文件 1,109 条通过；边界脚本硬编码要求旧 Repository 出口，具体收紧补丁已向用户申请门禁调整，尚未应用；整线继续其他独立复查。
