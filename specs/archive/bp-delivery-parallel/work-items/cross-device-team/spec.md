# 手机、桌面、云端与团队接续

2026-09-26，用户授权实施。总约定：`../../spec.md`。目标：声明范围内部完整，提供本地可运行的服务端及客户端路径，不自动购买基础设施或部署公网。

## 要交付的结果

用户在手机看到桌面项目的真实状态，提交一个明确操作后桌面能够接续；两位团队成员看到共享项目/交付进展，知道谁在负责、哪些成果已更新。断线、重试和冲突可见且可恢复，私人材料与共享内容边界明确。

手机端首轮默认采用可在手机浏览器使用的真实入口，不将窄屏截图声称为真机通过；原生 iOS/Android 安装包不是本轮默认范围。服务端先可本地部署，外部服务实际部署另行记录环境依赖。

## 范围与边界

- 设备配对/身份、团队成员及项目访问、共享进度/成果引用、最小必要数据交换、离线继续与冲突处理。
- 先打通一台桌面与手机入口的任务接续，再完成两个成员的共享进度；复用原项目/Goal/Artifact/Action 身份和语义，不同步整个私有 Home 或直接共享 SQLite。
- 定义业务事实归属与同步范围，正确处理重试、撤销访问、设备失联和重复命令；Connector 密钥、模型密钥及私人内容不因共享项目自动共享。
- 覆盖工作资产换设备继续使用：清单、固定版本及必要依赖关系，缺插件或凭据明确提示；实现与本路径必要的迁移，不宣称兼容任意未来产品。
- AI 如确需加入，只使用 Prologue/既有 Agent Host。同步和权限使用确定性逻辑，不新造模型服务。
- 不接管当前 Thread 群聊界面设计、不实现音视频/完整即时聊天、不重写既有插件或动作运行时。

## 并行与文件

depends_on：现有项目/Goal/Artifact/Action 语义；当前正式 Server、Team access 和 sync 未实现。先核对仓库的 apps/server、packages/exchange、modules/identity-team-access、modules/sync-replication 规划，采用所需最小实现而不机械补空壳。使用独立工作树，先明确实际路径和精确最小协议补充本文。桌面共享入口与存储迁移由对应 owner 串行接线；可先用两个隔离客户端验证实际服务器。

## 验收

真实服务、持久化及两个隔离客户端通过共享进度更新、手机操作接续、离线后恢复、不重复副作用、权限撤回、冲突提示和换目录/设备资产重建；模拟客户端与真机证据分开。使用隔离数据验证，失败不能显示已同步；停机重启保持归属和进度。

建立准确的开发启动命令、相关包 build/typecheck、必要身份/同步/恢复集成测试、移动入口真实浏览器实操及部署说明；真机不可用时明确未验证，不停下其他授权工作，不自行公开服务。

## 实施契约（2026-09-26）

工作树 `/Users/yijunwang/.codex/worktrees/573f/goalboard`，分支 `feature/cross-device-team`；含动作迁移和 Prologue 的未提交基线。统筹更新：公共 Server 与身份由本线唯一负责，聊天 owner 只写 `server/src/im/**`。专属文件为 `server/**`（排除 `src/im/**`）、`apps/server/**`、`tests/cross-device-*.test.ts`、本子需求书；不改 Thread owner 的 `server/src/im/**`、共享 Action/Host、导航、锁文件及全局迁移。

采用独立可挂载的接续 HTTP 服务与浏览器入口。项目配置显式列出现有 project_id、允许的 goal_id 和固定 ArtifactReference；服务端只投影这些对象。原 Host 是 Goal/Artifact 唯一业务事实来源；服务的 SQLite 仅持有成员、设备、邀请和接续回执。没有新的 AI 或 Agent Runtime。生产通过既有本机 Action Gateway，允许 `goals.state.read`、`goals.contract.read`、`goals.progress.record`、`goals.progress.receipt`、`artifacts.read`；每成员独立 `runtime:cross-device:<member-id>` bridge client 及 Host 精确 grants；授权主体由适配器注入，手机不能提交 actor、权限或任意 Action。

第一轮允许的手机操作为“记录进展和下一步”，使用原 Goal 的 cursor/contract_revision 做 CAS，原 command id 作为业务幂等键；失败/未知保持待核对，恢复时先查询原回执。同键不同参数拒绝，冲突须查看最新状态并以新命令明确提交。浏览器只持久保存当前身份未发送草稿，成功后清除；访问撤回后清除本机显示与待发送内容。服务不后台代替用户执行 Agent 工作。

身份初次从本机一次性入口代码建立；同用户设备配对与项目成员邀请分开，令牌有期限、单次消费、仅保存摘要，设备可单独撤回。项目 owner 可授予 viewer/editor、撤回成员；读写及返回数据前均复查权限。默认 loopback；LAN 必须显式 HTTPS 配置，既有本机 Web 不对外暴露。

页面沿用现有浅灰工作台、连续纸面、紫色操作强调；手机在一个项目中查看成果、更新进展和下一步，桌面增加成员/设备管理。先实现逼真隔离数据可交互切片，再接真实持久化。资产包只带显式共享对象的固定版本/必要依赖及来源身份，绝不带 Home、SQLite 或账号凭据；迁移必须显示缺插件/凭据，不能把仅导出视为已恢复。

验证使用隔离 Home/数据库、真实 Action 服务和两个独立 cookie 客户端。必须覆盖断线后收到原回执、并发同键、异参重放拒绝、CAS冲突、撤权期间等待请求、设备撤回、重启、资产换目录及恶意路径。浏览器实操与窄屏截图分列，真机仍须独立记录。启动、typecheck、定向集成测试和未接线项统一记录在专属 README。


## 最终接入与迁移实现

公共 `server` core 只依赖 contracts/storage，供桌面和 standalone 共用。`apps/server` 组合启动器、群聊 UI、原受保护授权 endpoint、原本机 Action Gateway；不把 local-host/desktop 依赖放回 core，避免嵌入循环。主树 workspace/filter/inventory/lock 由 Builder 串行更新；入口 adapter 由 Thread owner 接入。本工作树不覆盖主树和其他 owner 文件。

恢复使用已有 desktop Catalog adapter（注入真实 panel schema/repository）及 local-host 公开的 LocalProjectDatabase、GoalProjectApplication.artifacts；落入原 Catalog 的正式项目数据库。资产确定性导入不初始化所有 Action provider。映射保留 source_project_id，先持久保存 Host 支持的恢复ID，再调用 Catalog.createProject；重试复用同项目和固定 Artifact ID/version。版本范围不是完整历史，所以 supersedes 不编造；原来源关系另存。目标接续摘要单独保留，明确不恢复完整 Goal 执行历史、权限或完成验收。

评审修复包含：外人撤回设备不能取消该设备请求；重试只发送固定业务字段；会话失效清理全部本页面私有缓存；迟到请求不能跨退出/项目切换恢复内容；SSE重连403补查并清理，普通离线保留草稿。已有真实业务回执和CAS继续负责最终幂等。

启动器在监听前原子同步显式项目配置；从列表移除项目即撤回其全部成员访问并作废旧邀请，保留回执历史。再次加入只恢复owner，成员需重新邀请。
