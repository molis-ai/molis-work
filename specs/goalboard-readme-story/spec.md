# Molis Work README 叙事与截图编排

## 完成等级

内部完整：中英文 README 以真实产品截图和可核对的产品事实完成推广叙事，可供 GitHub 访客理解与试用；不宣称已有签名安装包。

## 背景与目标

当前 README 已覆盖功能，但以能力清单为主，篇幅偏长，读者需要自行拼出产品解决的问题、与 Agent Orchestration 的边界及完整工作闭环。

新版 README 要在较短篇幅内回答：长程任务为什么会跑偏、Molis Work 的核心机制是什么、如何与 Runtime/Harness 配合、用户如何从 Goal 走到有依据的完成。

## 范围

- 重写 `README.md` 与 `README.en.md` 的产品介绍和截图编排。
- 使用 `docs/screenshots/showcase/` 中已经完成隐私处理的真实产品截图。
- 保留快速开始、Desktop Preview、文档入口、License 与事实性限制。

## 非目标

- 不改变任何功能、领域模型、状态机、权限或 Runtime/TUI 契约。
- 不把 Molis Work 描述成 Agent Orchestration、模型或 Harness。
- 不承诺尚未提供的正式安装包、云服务或协作能力。

## 内容结构

1. 每个痛点一句话：目标漂移、Session/Runtime 断层、复杂依赖失去全貌、完成缺少依据、人无法随时掌握进度。
2. 核心思路 2–3 句：共享 Goal 账本、用户掌握正式目标、Runtime 消费和写回同一事实。
3. 明确 Goal 层与 Agent Orchestration 执行层可以组合，但互不替代。
4. 用真实截图说明定义、拆解、选择、执行、证据、变化确认的完整闭环。
5. 覆盖 Desktop 工作站、Harness 同屏伴随窗口和 Web 三种使用方式。

## 验收标准

- 截图在首屏核心思路之后出现，不再埋在能力清单后面。
- README 用克制、准确、非口号化的语言讲清产品价值与边界。
- 明确长程 Goal 如何通过稳定 Contract、依赖、决定、证据和复核避免跑偏。
- 明确复杂 Goal 可以交给 Agent team/Orchestration 执行，并写回同一 Goal 事实。
- 中英文版本结构和事实一致，所有相对图片与文档链接存在。
- `pnpm test` 通过。

## 验证

- 人工阅读中英文 README 的结构、长度、承诺边界和截图可读性。
- 脚本检查两份 README 的本地相对链接。
- 运行 `pnpm test`。
