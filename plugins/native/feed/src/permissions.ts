import { HOST_CONNECTIONS_OBSERVE_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-events";
import { PLUGIN_EVIDENCE_COLLECT_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

const OWN = "读写 Feed 内容、捕捉规则与首页事项，处理消息去向与管理来源";

/**
 * Every permission of Feed's Manifest. Feed runs as a dual-instance plugin (each project's half and the Home's reference ledger), so all of
 * them are required: a person cannot switch one off (specs/dual-instance-plugins, U1), and the gate `scripts/gates/dual-instance.mjs` reads
 * this list as a literal. `tests/feed-runtime-plugin.test.ts` holds it to what the actions, the jobs and the services declare, so a new
 * permission cannot be used without being listed here.
 */
export const FEED_PERMISSIONS: PluginPermissionDeclaration[] = [
  { permission: "feed:read", required: true, reason: OWN },
  { permission: "feed:write", required: true, reason: OWN },
  { permission: "goals:read", required: true, reason: OWN },
  { permission: "goals:write", required: true, reason: OWN },
  { permission: "model:invoke", required: true, reason: OWN },
  { permission: "inbox:read", required: true, reason: OWN },
  { permission: "inbox:write", required: true, reason: OWN },
  { permission: "storage:private", required: true, reason: "项目里的消息出口规则" },
  { permission: "attention:read", required: true, reason: "读取这个项目的 Inbox 事项" },
  { permission: "attention:write", required: true, reason: "把消息加入或移出 Inbox" },
  { permission: "context-ledger:read", required: true, reason: "读取消息与 Goal 的关联" },
  { permission: "context-ledger:write", required: true, reason: "记录消息与 Goal 的关联" },
  { permission: "artifact:write", required: true, reason: "把捕捉规则捕获的消息存进成果库" },
  { permission: "journal:project", required: true, reason: "把消息的变化记进项目历史" },
  { permission: "evidence:read", required: true, reason: "读取留存的原始正文" },
  { permission: PLUGIN_EVIDENCE_COLLECT_PERMISSION, required: true, reason: "删除 Home 引用账里已没有人引用的留存正文" },
  { permission: "plugins:read", required: true, reason: "得知哪些项目装了 Feed，引用账才知道自己记全了没有" },
  { permission: "sources:pull_feed", required: true, reason: "按平台的公开订阅源目录与格式描述来源、拉取公开订阅源" },
  { permission: "sources:pull_query", required: true, reason: "拉取固定的网页查询来源" },
  { permission: "sources:read_repository", required: true, reason: "读取 GitHub 研究库里发布的内容" },
  { permission: "schedule:read", required: true, reason: "查看是否已设好按时拉取" },
  { permission: "schedule:write", required: true, reason: "设定按时拉取到期的来源" },
  { permission: "actions:invoke", required: true, reason: "向 Feed 在 Home 里的引用账登记和释放留存的正文" },
  { permission: "scenes:use", required: true, reason: "绑定并运行捕捉规则的判断场景" },
  { permission: "judgments:read", required: true, reason: "读取捕捉规则的判断记录" },
  { permission: "judgments:write", required: true, reason: "记录捕捉规则的判断结果" },
  { permission: "functions:invoke", required: true, reason: "按 Inbox 绑定的规则，替当前调用者给 Feed 带来的新事项判断下一步" },
  { permission: "actions:delegate", required: true, reason: "替当前这个调用者请 Inbox 与首页判断下一步、读取已发布的判断规则" },
  { permission: "connections:use", required: true, reason: "读取你为每个账号来源选好的账号是否还能用" },
  { permission: "sources:pull_connector", required: true, reason: "用你为账号来源选好的账号拉取新消息" },
  { permission: HOST_CONNECTIONS_OBSERVE_PERMISSION, required: true, reason: "得知你的账号变了，让账号来源的状态跟上" },
];
