# main 三天合入与按批次复核（2026-11-21）

状态：复核完成；修复见 [三天复核修复](../../specs/archive/main-review-1121/spec.md)（同一 PR），没改的记在 BL-mr21-review-followups 与 BL-mr21-personal-purge-finalize。基线 main `b428472f46`。范围：2026-11-18～11-21 合入的 75 个 PR，以及路线书全部已合入批次（01～22、24～36A、38、39、41、42、44、48-1、56-1、58、59、61、73-3、92～98、100～102）。

方法：12 个只读评审按 PR 组与批次分头读 diff、现行代码、批文档、认领板 #1743；P1 均由主会话再读代码核实。没有构建，也没有跑测试；静态门禁 `health:check`、`workspace:check`、`versions:check`、`secrets:check` 通过（对照 main 自身，只说明内部一致）。「CONFIRMED」=读代码确认，「PLAUSIBLE」=需运行验证。

## 一、结论

- 主体质量可用：没有发现数据丢失或可被利用的安全漏洞；硬约束里「模型调用只经 agent-host」「平台不 import 插件」「vendored SDK 单包带校验」「DOM 事件登记」均成立。
- 真实缺陷集中在近 3 天的三批：第 101 批（定时任务串行、存译文）、个人云同步（OPT-16 虚报）、第 36 批合后修复（主线安放半写入）。
- 系统性问题比单点 bug 更值得处理：四次大清理（#2163 删旧迁移、#2155 第 44 批、#2156 CI 提速、#2188 门禁改革）删了测试和机制，但没回写批文档与 spec，造成约 20 批的验收证据断链和文档失实；验收编号「测试名里写编号」的规则大面积没守住；认领板多处过时。

## 二、按批次评级

A 完整可靠 · B 主体成立有小缺口 · C 有用户可见缺陷或违反硬约束 · D 主体未成立

| 批 | 评级 | 要点 |
| --- | --- | --- |
| 01–04 | A | 文档/设计批；01.md 对 BL-953、BL-320 的描述与现文件不符 |
| 05 | B | SSC-04（撤权后下一次读写被拒）无测试；golden-replay-design §1a 描述已删机制 |
| 06 | B | BSH-07/11/14 的验收被 #2163 掏空、spec 未改；死兜底 `PROJECT_POSITION_KEY` |
| 07、08 | A | 引用已删的 page-asset-allowances 文件 |
| 09 | B | CPK-08/10 证据测试被 #2156 删，spec 仍引用（现状手工核对仍成立） |
| 10 | A | 实施方案仍写「Enter 换行、⌘↵ 发送」，已被 11-16 决定反转 |
| 11 | B | UIV-20 只做拒绝面；K6（IM、灵光、创作台等其余入口）无任何跟踪项；灵光仍只认 ⌘↵ |
| 12 | B | DRT 13 个编号无测试；BCD-13 前提已被 #2163 取消 |
| 13 | B | ASC-46/48/49/64 无编号测试 |
| 14 | A | 首屏许可说法已过时 |
| 15 | B | **项目首页不显示 Todo 的到期/逾期**（已登记 BL-todo-home-presentation，测试固化现状） |
| 16 | B | FSS-23 无编号测试；引用已并入 BL-capsule-redo 的 BL |
| 17–22 | A | 22：BL-955 正文仍写「十二处」 |
| 24 | B | EVD 18 个编号测试随 #2155 删；「做出者自己重报只算自述」（`modules/acceptance/src/service.ts:54`）、同轮去重、幂等重放无测试 |
| 25 | B | 运行面板随胶囊删除后文档未同步；U3 异常路径只在 macOS 本机跑 |
| 26 | B | 26-8 状态词汇门禁被 #2188 删，`STATE-VOCABULARY.md` 无新鲜度检查 |
| 27 | B | STOP-03、UI-07 无测试；27.md 仍写旧首屏机制 |
| 28–30 | A | 文档里「观测库 1→2」已过时 |
| 31 | B | 记忆导出未内嵌 SDK Export v2（已登记）；文档符号已不存在 |
| 32 | B | **PWA-137（停止运行时不显示仍在执行）唯一测试随胶囊删除** |
| 33、34 | A | 34：SRB-03 无编号测试 |
| 35 | B | 引导会话 Markdown 标题可被外部会话伪造（PLAUSIBLE）；附件无配额；认领板仍「待评审」 |
| 36 | B | **主线安放同时改事件与事项时半写入**（见 P1-4） |
| 36A 逐屏打磨 | B | 本轮交付成立；第 3、4b、6、7 项未做；75 个编号仅 26 个可追溯；spec 状态句过期 |
| 38 | B | 失败文案存译文；沙箱「不可采用」无代码产生；撤销结果依赖顺序；预览不清理；ONB-31/34、SPC-03 无测试 |
| 39、41 | A | APR-19 spec 仍要求已删的旧库移交验证 |
| 42 | A | 合后小修 #2173：占位符逆向还原仍有歧义、`/api/skills` 请求体上限整体放宽到 256 KB |
| 44 插件同等地位 | B− | 宿主已清点名；工作台外壳仍按名字给 Goals 开路（已记 BL）；**Feed/Inbox 分支漏记**；PEQ-08 样式仍在 9 个共享文件；按项目导出含别项目的内置插件文件 |
| 48-1、73-3 | B | 48-1：文档承诺的 `details.state_directory` 不输出；73-3：BL-tests-umask 已做完未销号 |
| 56-1、58、92–94 | A | 94.md 无合入记录；58：WLN-25 无编号测试 |
| 59 | B | SAI-14/15 无编号测试 |
| 61 | B | 放卡与写记录非同一步（PLAUSIBLE）；认领板两项仍「待评审」、spec 仍写 CI 待完成 |
| 95、96 | B | 95：文档写的桌面命令已被 #2155 删；96/#2178：`finally` 里 `invalidate()` 停用时会抛错盖掉成功结果 |
| 97、98 | A | 98.md 无合入记录 |
| 100 门禁改革 | B | 经决定 58 批准、CI 绿；**预算棘轮可通过改归属绕开**（P1-5）；合并后的 Gates 作业超出自定超时规则 |
| 101 | C | P1-1、P1-2；修掉后可到 B |
| 102-2 | B | 安全面收紧有测试；`attention-refresh` 的 detail 与合同不符；在线快照一致性与 maintenance 网关接受页面会话（PLAUSIBLE） |
| 102-1 | 未开工 | 批文档没写明 |
| 个人云同步 #2179 | B | P1-3；不属于任何批次 |

合计：A 29 批、B 28 批、C 1 批（101）、未开工 1 项（102-1）。

## 三、P1（已核实）

| 编号 | 位置 | 问题 | 失败场景 |
| --- | --- | --- | --- |
| P1-1 | `apps/local-host/src/web-project-schedulers.ts:63-77`（#2189） | 每轮 `await Promise.all(ticks)`，`periodic.every` 在上一轮未完时跳过下一轮，`schedule.tick()` 等 wakeup 处理完 | 项目 A 的一个定时任务跑 10 分钟，这期间所有项目的定时任务都不触发 |
| P1-2 | `apps/workbench/src/scripts/client/plugin-event-recovery.ts:118`（#2189） | 用 `t.text(...)` 的译文填服务端必填 `reason` 并存进恢复历史 | 中文界面跳过一条，切英文后历史仍显示中文；违反「存键不存译文」 |
| P1-3 | `apps/local-host/src/project-deletion-service.ts:103-160`（#2179） | OPT-16 标「通过」，但 `finalizeExpiredPersonalProject` 生产代码无调用方；且先取消回收再删除 | 云端已清理的项目本机永不清理；删除失败时项目以未回收状态复活并被同步 |
| P1-4 | `horizontal/mainline/src/index.ts:377-394`（#2121） | 同时给 `to` 与 `item` 时先在任务主人处改事件关系，再放事项；后者失败不回滚 | 把任务移到 N2 并放进已满的事项：报 `mainline.limit`，但任务已改挂 N2；与 B36F-06 不符 |
| P1-5 | `scripts/gates/page-assets-policy.mjs:88-108`（#2188） | 「只许收紧」只比 `maxBytes`，不比路由的 `assets/prefixes/suffixes`，新增路由也不查 | 只改预算表，把资源移出某路由或加一条宽前缀路由，即可绕开预算 |
| P1-6 | `apps/local-host/src/system-materials-actions.ts:73,387` | 没有自己的阅读位置时回退读项目级旧键，写入方已随 #2163 删除 | 纯历史取值读取，违反「合同只认现行取值」；只有测试手工写这个键 |
| P1-7 | `apps/workbench/src/scripts/client/frame-container.ts:19,114,132,167,397,486,607,683` | 外壳按 `"feed"/"inbox"` 分支、写死 `/api/stage/feed/objects/`；不在 44 批任何 BL 里，也没有门禁能发现字符串分支 | 第三方插件拿不到同样的画框与正文加载；违反「不另写名单或宿主分支」 |
| P1-8 | `.github/workflows/full-suite.yml:201`、`visual-audit.yml:8-41`（#2156） | PR 全量排除 13 个 VUX 巡检，补位的 visual-audit 路径过滤漏掉 323 个界面文件与 `apps/local-host/**` | 改这些文件的 PR 在合并前不跑 VUX，只靠夜间 |
| P1-9 | 测试证据丢失 | PWA-137（#2155）、CPK-08/10、WMD-13（#2156）、EVD-13/16/18（#2155）的唯一测试被删，spec 仍引用 | 需求日后被改坏没有测试会红 |
| P1-10 | `plugins/native/todo/src`（无 presentation） | 项目首页 Todo 是「未声明」卡（已登记 BL-todo-home-presentation，中优先级） | 用户看不到今天到期和逾期的待办 |

## 四、需要你决定的

| 编号 | 事项 | 现状 |
| --- | --- | --- |
| D-1 | Work Brief 固定版本把来源名译成句子存进成果库（`plugins/native/work-brief/src/fix.ts:20`） | #2118 正文写「待定」，未登记为保留机制。选项：升格式版本存引用，或登记为「固定版本按固定时语言存文字」的例外 |
| D-2 | AGENTS.md 仍写「超过 10 KB 或新增资源先问用户」「门禁只许变严」，而决定 58 已换成总量预算、放宽巨大单元上限 | 门禁现在会拒绝 `page-asset-allowances/` 目录，这条规则已无人执行。选项：改 AGENTS.md 对齐决定 58，或在预算门禁里恢复单次增长检查 |
| D-3 | #2156 做了 ci-acceleration spec 列为「非目标」的 P2（共享构建、PR 全量分层、删 7 个测试），#2156 与 #2188 在 GitHub 上都是 0 review | 找不到用户批准记录。选项：追认并补回丢失断言，或回退 PR 侧收窄 |
| D-4 | 删除项目会接管「没有回执的旧暂存目录」（`project-deletion-stage.ts:24-34`，#2130），只可能来自旧代码 | 未登记为保留机制。选项：删掉，或登记 |

### 决定记录（用户 2026-11-21 弹窗）

- 修复范围：P1 与 P2 一起修。
- D-1：登记为例外——固定版本按固定时的语言存文字，只此一处，写进 CONTRACT-CHANGES「当前保留机制」。
- D-2：改 AGENTS.md 对齐决定 58；同时修 P1-5，让预算表的归属变化也被门禁拦住。
- D-3：追认 #2156 的范围并补洞——补全 visual-audit 路径过滤，补回 WMD-13、CPK-08 与浏览器断言，在 ci-acceleration spec 记追认。
- D-4：未问，按「不留兼容」删除。

## 五、P2 摘要（按主题）

- **同类问题只修了点**：按 UTF-16 单位截断用户文字仍有几十处（`apps/local-host/src/assistant-*`、`horizontal/knowledge/src/organize.ts` 等）；子进程输出逐块 `toString()`（`connector-tool-process.ts:23`、`build-dependencies.ts:88`）；约 68 处 `maxlength` 按单位计。建议加一条门禁而不是逐处修。
- **公网地址判断有三份实现**：`material-source-reader.ts:10`、`plugin-sandbox/src/https-proxy.ts:17`、`rss/src/custom-rss.ts:80`，对 `3fff::/16`、`2001:10::/28`、`198.18/15` 判定不一致。
- **第 102-2 批**：`molis-work:attention-refresh` 带了合同未登记的 detail；在线快照分库不同时刻备份（PLAUSIBLE）；`/api/internal/home-maintenance` 接受页面会话，能把 Home 写到任意路径（PLAUSIBLE）；`discoverOne` 兜底写了三份；生产代码里按 `NODE_TEST_CONTEXT` 开开关。
- **第 44 批**：内置插件主人文件按整个 Home 导出（`plugin-data-export.ts:120-130`）；设置页项目指导路由没钉提供方；项目简介按 Goal 的样子画；`demo-seed.ts` 由宿主写 Goals 业务数据；工作终端面板只增不减。
- **第 38 批**：失败步骤 `error.message` 存库（`horizontal/blueprints/src/adopt.ts:106`）；`sandbox_unsupported` 无产生处；撤销结果依赖顺序。
- **第 96 批**：`plugins/native/schedule/src/plugin.ts` 的 `finally` 调 `tellOpenPages`，停用时 `invalidate()` 抛错会盖掉成功结果。
- **#2163 残留**：`server/migrations/sync/0001_sync.sql` 仍是 `version=6`；`guardNodeDispatch` 死包装仍导出，APR-11 三个用例只测它；`secret-allowlist.txt` 24 条对应已删金样；`v1-reset-exceptions.json` 未清。
- **门禁改革**：tests 类型错误棘轮对照提交的基线，余量会累积（已有 12）；单行多语句门禁不看模板字符串里的客户端脚本。

## 六、文档与认领板

- 认领板 #1743 过时：35（2 行）、61（2 行）仍「待评审」；#2178、#2195 已合仍「待评审」；44 各行只写 #2155，不提 #2187/#2192 和 4 条转出的 BL；25 第 160 行仍写运行面板；26 第 170 行仍写词汇门禁已交付。
- 批文档缺合入记录：35、61（缺 #2153）、94、98；102.md 没写 102-1 未开工。
- spec 状态句过期：`screen-polish/spec.md`、`specs/README.md:65`、`batch-35/36/61-audit-fixes`、`plugin-equal-standing/spec.md`。
- #2163 后的断链：`modules/projects/README.md:89`、`docs/platform/UI-PLATFORM.md:93`、`apps/workbench/src/judgment-rules/README.md:19`、`apps/local-host/README.md:392`、`scripts/ci-check-selection.mjs:15`、`tests/ci-shard-weights.json`（列着已删测试）。
- 文档与代码相反：`packages/storage/README.md:3` 与 `docs/system/CONTRACT-CHANGES.md:53` 写 Memory ledger 基线为 2，代码是 1；`CONTRACT-CHANGES.md:461` 仍把已删的 `private_value_upgrades` 写成现行字段；S-14 文档仍写放行 localhost，代码已拒绝。

## 七、建议的处理顺序

1. 修 P1-1～P1-4（代码缺陷，各一个小 PR）。
2. 修 P1-5、P1-6、P1-8，补回 P1-9 丢失的断言。
3. 你定 D-1～D-4 后按决定改。
4. 一个文档 PR：认领板、批文档合入记录、spec 状态句、断链、CONTRACT-CHANGES 与代码对齐。
5. 加两条门禁：用户文字截断必须走 `cutHead`；外壳与宿主不许出现插件 id 字符串分支。
6. P1-7、P1-10 与 44 批 BL 一起排进后续批。

## 八、没覆盖的部分

没有构建、没有跑测试，「测试存在」不等于现在通过；界面效果（390 宽、深色、英文）没有实看；#2155、#2101、#2138、#2179 只按风险抽查；Prologue 仓库一侧的测试未核对；真实 Home 未触碰。
