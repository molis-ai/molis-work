# Coding

编码会话、本轮执行，以及它们产出的变更集、报告与图。

包名：`@molis-ai/molis-work-plugin-coding`。

## 它拥有什么

- **三个 Artifact 类型**：`coding.changeset.v1`、`coding.report.v1`、`coding.diagram.v1`。
  每个都带产出它的那一轮执行，读的人总能回到「这是怎么来的」。
- **声明式落位**：导航、设置、端口全部写在 Manifest 里，宿主代码里不出现 `coding` 这个 id。

## 它不拥有什么

模型与凭据（宿主设置）、批准决定（用户在宿主审查面里做）、工作区目录（宿主授权后给）、
命令执行（走 Agent Host 的审批路径）。

## 两处刻意的取舍

**图不是 SVG。** 本轮执行产出的是节点与连线的结构，由宿主来画。
让模型直接吐 SVG 意味着模型输出变成应用自己 DOM 里的标记，中间只隔着一个消毒器——
那种白名单是会被绕过的。现在标签一律作为文本节点进入，注入面不存在。

**暂时没有输入端口。** Coding 想要 Shelf 材料和 Goal 上下文，但这两者今天都不产出 Artifact 类型
（六个内置插件全是 `produces: []`）。为一个没人能发布的类型声明输入端口，等于声明一条永远绑不上的连接，
所以先不声明。Goal 事实目前走 Goals 已注册的 16 个 Capability。

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`
- 需求书：[`specs/coding-plugin/spec.md`](../../../specs/coding-plugin/spec.md)
