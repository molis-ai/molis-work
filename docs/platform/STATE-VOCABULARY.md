# 平台公开状态词汇

由 `node scripts/gates/state-vocabulary.mjs --table` 生成。

业务状态的迁移由各自主人执行。插件的状态由自己的 Manifest 声明。

| 词表 | 主人 | 状态 | 家族 | 公开性 | 消费合同 |
| --- | --- | --- | --- | --- | --- |
| `pluginLifecycle` | `plugin-runtime` | `installed` | `idle` | 公开 | `platform/plugin` |
| `pluginLifecycle` | `plugin-runtime` | `running` | `running` | 公开 | `platform/plugin` |
| `pluginLifecycle` | `plugin-runtime` | `disabled` | `paused` | 公开 | `platform/plugin` |
| `pluginLifecycle` | `plugin-runtime` | `crashed` | `failed` | 公开 | `platform/plugin` |
| `pluginLifecycle` | `plugin-runtime` | `quarantined` | `blocked` | 公开 | `platform/plugin` |
| `pluginLifecycle` | `plugin-runtime` | `uninstalled` | `archived` | 公开 | `platform/plugin` |
| `connectorConnection` | `connector-host` | `connected` | `connected` | 公开 | `services/connector-host` |
| `connectorConnection` | `connector-host` | `reauth_required` | `answer` | 公开 | `services/connector-host` |
| `connectorConnection` | `connector-host` | `disconnected` | `disconnected` | 公开 | `services/connector-host` |
| `agentRun` | `agent-host` | `starting` | `running` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `running` | `running` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `awaiting-review` | `answer` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `awaiting-input` | `answer` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `paused` | `paused` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `compacting` | `running` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `completed` | `done` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `failed` | `failed` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `cancelled` | `paused` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `stopped` | `paused` | 公开 | `services/agent-host` |
| `agentRun` | `agent-host` | `reconcile-required` | `verify` | 公开 | `services/agent-host` |
| `knowledgeCard` | `knowledge` | `pending` | `waiting` | 公开 | `services/knowledge` |
| `knowledgeCard` | `knowledge` | `ready` | `connected` | 公开 | `services/knowledge` |
| `knowledgeCard` | `knowledge` | `listed` | `done` | 公开 | `services/knowledge` |
| `knowledgeCard` | `knowledge` | `failed` | `failed` | 公开 | `services/knowledge` |
| `knowledgeCard` | `knowledge` | `over_quota` | `blocked` | 公开 | `services/knowledge` |
| `knowledgeCard` | `knowledge` | `missing` | `disconnected` | 公开 | `services/knowledge` |
| `placementObject` | `placement` | `ok` | `connected` | 公开 | `services/placement` |
| `placementObject` | `placement` | `missing` | `disconnected` | 公开 | `services/placement` |
| `placementObject` | `placement` | `unavailable` | `blocked` | 公开 | `services/placement` |

## 状态环家族

| 家族 | 文案 | 既有视觉别名 |
| --- | --- | --- |
| `idle` | 未开始 | `idle` |
| `connected` | 已就绪 | `ready`、`connected` |
| `running` | 进行 / 执行 | `doing`、`starting`、`running`、`generating`、`saving`、`indexing` |
| `done` | 完成 / 已保存 | `done`、`saved`、`round-ended`、`staged` |
| `waiting` | 排队 / 等待 | `queued`、`waiting` |
| `answer` | 等你处理 | `answer`、`approval`、`reauth` |
| `paused` | 暂停 / 停止 | `paused`、`stopped`、`cancelled`、`disabled` |
| `blocked` | 无法继续 | `blocked`、`unavailable`、`quarantined` |
| `syncing` | 同步中 | `syncing` |
| `retrying` | 重试中 | `retrying` |
| `failed` | 失败 | `failed` |
| `partial` | 部分完成 | `partial` |
| `interrupted` | 已中断 | `interrupted` |
| `verify` | 需要核对 | `verify`、`conflict` |
| `stale` | 已过时 | `stale` |
| `disconnected` | 已断开 | `disconnected` |
| `unsaved` | 待整理 / 写入 | `unsaved`、`draft`、`unstaged`、`untracked` |
| `unread` | 未读 | `unread` |
| `read` | 已读 | `read` |
| `archived` | 已收存 | `archived`、`material` |
| `trashed` | 回收站 | `trashed` |

作者写法见 [插件开发 Skill](../../skills/molis-plugin-dev/state-machine.md)。
