# BL-attention-404-by-code · 让宿主重启后，旧标签页自己恢复提醒

开着的标签页偶遇一次 404，服务回来后也应继续收提醒。项目真的删了，才停止反复查询。

预计 **4–8 工时**。维护范围为工作台外壳。正式交付项为 [56-1](../../batches/56.md#batch-56-item-1)。[原始待办](../../../../backlog/BL-attention-404-by-code.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-attention-404-by-code。正式交付项为 56-1，批次文件在 specs/post-anticorruption-roadmap/reference/batches/56.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-attention-404-by-code.md。产品决定与验收按该 BL 的现行记录。

目标
让宿主重启后，旧标签页自己恢复提醒。开着的标签页偶遇一次 404，服务回来后也应继续收提醒。项目真的删了，才停止反复查询。

实施
从 apps/workbench/src/scripts/client/attention.ts 的轮询与事件流两条路径，追到 apps/local-host/src/attention-http.ts。给确认目标已消失的响应稳定的原因码，优先复用已符合语义的合同。只在确认消失时永久停读该目标。其他短暂 404 沿已有节奏恢复。

验收
node scripts/run-tests.mjs tests/attention-route.test.ts tests/attention-context.e2e.test.ts。覆盖同一未刷新的标签页先 404 后恢复，以及删除目标后不再重复读取。核对两种读取路径。 涉及浏览器实操时用项目测试浏览器及隔离 Home。

协作
可先修读取与宿主合同，归 56-1 提醒唤醒验收。系统通知整批有自己的前置。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
