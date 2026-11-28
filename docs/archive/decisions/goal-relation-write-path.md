# ADR：Goal 关系写入保留直接命令路径

状态：已接受（2026-09-19）。取代 `bca8aa8` 对 Goal 关系写入的退役结论，其余四个旧协议写入适配器的退役不变。

## 背景

`fa904cc` 为 Goal 关系创建与停用提供了 HTTP 写入适配器 `plugins/native/goals/src/http/relations.ts`。

`bca8aa8`（goals 收敛到事件工作流）把它删除，并在 `scripts/check-package-boundaries.mjs` 中把 `relations`
和 `draft`、`risk-impact`、`verification`、`input` 一起列入「必须保持删除」名单。当时的判断是：Goal 关系变更
应当只经 Governance 的 Proposal 路径产生——由 Runtime 提出关系提议，用户确认后才生效。

`fe9f980`（工作台重做）重新实现了该适配器（38 行）并接入 `http/index.ts`；
`plugins/native/goals/src/relation-client.ts` 的关系表单真实调用它。功能上线但检查规则未同步，
`pnpm boundary:check` 因此长期失败。

## 决定

保留直接命令路径：用户在关系画布上的显式操作，允许经公开 Goals Command API
（`addRelation` / `deactivateRelation`）立即写入，不强制先生成 Proposal。

`relations` 从「必须保持删除」名单移入与 `create`、`policy-guidance`、`lifecycle`、`decisions`、`events`
同一份受检名单。

## 取舍

- **保留的约束**：该文件仍受 `checkGoalStorageOwnership` 与 Host/Module 引用检查约束——不得自带 SQL、
  不得引用 Store、Module 实现或 Host 应用。它只能消费公开操作端口。已用故意注入 SQL 的方式验证该守卫仍然生效。
- **区分两类来源**：用户在界面上的显式关系编辑是直接命令；**Runtime 或 AI 推导出的关系变更**仍然只能走
  Proposal，由用户确认后生效。这条区分是本决定成立的前提，不是例外的扩大。
- **未采用的方案**：把关系表单也改走 Proposal。它会让用户自己连一条线也要再确认一次，且在改造期间关系画布
  无法编辑；与画布的直接操作手感不符。

## 影响

- `scripts/check-package-boundaries.mjs` 的两份名单已同步。
- `draft`、`risk-impact`、`verification`、`input` 四个适配器仍然必须保持删除，本决定不触及它们。
- 若未来关系写入要回到 Proposal 路径，需新开 ADR 取代本文，并同时改动 `relation-client.ts` 的写入路径。
