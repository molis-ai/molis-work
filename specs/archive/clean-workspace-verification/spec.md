# 全新 workspace 的验证顺序

> 归档（2026-10-01，合入后梳理）：判定为**已实现**。package.json workspace:verify 顺序已改。没有剩余事项。

## 目标与证据

完成 v0.2.0 发布后的 GitHub 验证。运行 34579093665 在 Package boundaries 的 `pnpm workspace:verify` 中失败：contracts 的 `tsc --noEmit` 不生成 dist，随后 kernel/plugin-sdk 解析公开 Contract 子路径时产生 TS2307。包边界检查已经通过；本机先执行完整 build 后的 647 项测试也已通过。

## 最小行为合同

`workspace:verify` 保留既有边界测试、边界检查、workspace 构建和类型检查，只将 workspace 构建放到 workspace 类型检查之前，保证依赖声明文件先生成。既有拓扑构建顺序、错误传播、严格类型规则和 CI 必需检查保持。

允许修改仅 `package.json` 的 `scripts.workspace:verify` 一行。无业务、依赖、版本、App 或已发布 tag 变更。继续由 Grok 4.6 / xhigh 作为唯一源码 writer。

## 验收与验证

- 从无 workspace dist 的状态运行 `pnpm workspace:verify`，边界、构建、类型检查全部通过。
- 同一提交的 GitHub CI 通过，原 main 保护规则恢复。
- v0.2.0 已发布标签及本机 Runtime 不变；这次提交仅修复维护命令的执行顺序。

Codex 负责清理生成的 workspace dist、运行验证、Git 提交与状态核对。无需新测试文件，不修改测试断言。
