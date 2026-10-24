# PG-047：模型结果由平台再核

状态：已实现，在评审（PR #1165，2026-10-24，防腐线 ac-kernel 片）；做的是 `privileges.md` PG-047 行剩下的「平台不强制 `validateResult()`」一项与 §4 p（§10.29 裁定 5）。代码按 main `1dedc1f5c` 核过。

## 1. 要解决的

#744 以后，合同要求插件在提交之前调一次模型结果的 `validateResult()`，核原调用是否还有效、实际派出时的模型或连接是否没变。平台却不强制这一点。除 PPT 以外的内置消费者（Jelly、灵光、Todo、Form、Dataset、Cognia）都把结果丢了：人在模型答完后换了模型，这些插件照样按旧绑定提交。

## 2. 做法

- 模型服务（`packages/plugin-runtime/src/model-service.ts`）在拿到结果后（成功与可记账失败两条路），自己照常核一次，再用 `holdPluginModelResult` 把同一份检查留在这次调用上。这份检查包括取消、安装仍在、`model:invoke` 授权、调用方权限、同步的 `assert_authority_current`，以及宿主给的 `validateResult`。
- 留下的检查以调用的 `checked` 记录为键（`packages/plugin-runtime/src/action-scope.ts`），替这次调用续跑的后台执行共用同一份。下面几处都会再跑一遍留下的检查，失效就带原错误码拒绝：
  - `assertCapturedPluginActionCurrent`：每个平台写服务都调它，库事务在 `BEGIN` 前、每条语句前与 `COMMIT` 前各调一次，私有存储、文件、成果、事件、输出端口也调；每次嵌套调用也调。
  - 动作处理器拿到的 `beforeEffect`（`pluginActionBeforeEffect`）。
  - 后台执行交给工作的 `control.beforeEffect`（`background-service.ts`，同样经 `pluginActionBeforeEffect`）。
- 六个消费者都经 `database.transaction(() => caller.beforeEffect(), …)` 提交，因此不用改代码就被兜住。

## 3. 决策记录

| 日期 | 决定 | 谁定 | 理由 |
| --- | --- | --- | --- |
| 2026-10-23 | 平台在写事务或最后一次 `beforeEffect` 里兜住，不靠插件自己调 | 统筹（§10.29 裁定 5） | 作者忘了调也不能按旧绑定提交 |
| 2026-10-24 | 一次调用里，只要有一个模型结果失效，此后这次调用经平台的写入一律拒绝，包括看上去不依赖它的那些；同一次调用先后调两次模型、中间换了模型，也算这一种 | 统筹（#1165 一轮评审后确认） | 这正是裁定 5 的本意：平台不知道写入依赖哪个结果，就按最严的来，与「被取消、撤权的调用不再写业务记录」一致 |
| 2026-10-24 | 后台执行的 `control.beforeEffect` 也再核留下的检查，合同注释里的「每个 `beforeEffect`」对后台执行同样成立 | 统筹（#1165 评审建议 1） | 否则作者照合同注释依赖它，后台路径上会落空 |

## 4. 验收

- **RAC-333**（`tests/plugin-model-service.test.ts`）：经宿主的私有存储验证。插件不调 `validateResult()`，模型答完后换模型，`beforeEffect` 与写入都以 `actions.configuration_changed` 被拒，存储里没有写入。
- **RAC-334**（`tests/security-invariants-plugin-model-held-results.test.ts`）：模型答完后撤掉 `model:invoke`，`beforeEffect` 与写入都以 `plugin.grant_denied` 被拒，没有写入。变异：去掉留下的检查里的授权部分，这条失败。
- **RAC-335**（同上）：后台执行里调模型，结果失效后，工作的 `beforeEffect` 与写入都以 `actions.configuration_changed` 被拒，没有写入。变异：后台的 `beforeEffect` 不经 `pluginActionBeforeEffect`，这条失败。
