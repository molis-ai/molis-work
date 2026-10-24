# 评审问题巡查与修复状态（REVIEW-FIX-STATUS）

更新：2026-10-24 02:52Z（本会话 = 评审问题巡查/修复派单会话；用户 10-24 03:40 把合并职责交给 Codex 统筹，本文件只同步「无人处理的评审问题」与修复线状态）

## 本轮巡查结论（按 PR 最新头核对）

### 已派修复（此前无人处理）
- **#1141** Todo 批量「移到」菜单补 menu 语义与单一 Tab 停点（#902）｜head `ab8a43768`｜DIRTY｜无 ac-review 评论、不在 MERGE-QUEUE 派单表 → 派 `review-fix-owner`（task-6）：机械同步 main、只解生成物冲突、转可评审；认领评论已由该会话落 PR。
- **#1114** 复审报告（2026-10-20~23）汇总修复｜head `f0bc20f8c`｜DIRTY｜无 ac-review 评论、不在 MERGE-QUEUE｜18 文件含 S-56 嵌套（#1079）、#867 错误分类、cognia.import.directory_preview v2→v3（动作合同变更+page-assets 28B 放行） → 派 `review-pr-fixer`（task-7）：逐项核对「仍需要/已被取代」、机械同步、合同变更确认，回报后请统筹派一轮。

### 待一轮评审（无挡项，不需修复；请统筹排 ac-review）
- #1125 `21d4b3719`（spec 剩余风险登记，非草稿 CLEAN）
- #1128 `f26d7f8b8`（翻译门禁盲区文档，非草稿 CLEAN）
- #1126 `bcbc30c2e`（#955 startedAt + #928 英文 TaskBoard；page-assets coding.js +873B 一次性放行待评审核）
- #1127 `d461fb954`（#1018 link 通道 + #1090 flake；page-assets plugin-frame.js +263B 放行待评审核）
- #1135 `0460783c1`（tests-only VUX 审计，仍 draft）— 是否转 ready 请示下。
- #1141/#1114 同步完成后我会再提醒一轮。

### 认领异常（请统筹确认）
- **#1112** `0c0c0039d` DIRTY：Codex 17:39Z 最后认领，之后无推送/评论（>2h）。按 MERGE-QUEUE §1 第 7 条可收回改派；我们可派修复者接手（修后可合 2 条 + 规格板 (b) + 合 main/重测 page-assets），但按规则先问，未动。

### 已归 Codex/作者（本会话不碰）
- W5-06 链：#1098 `91e096524` CLEAN、#1107 `b8b5e3304` CLEAN（等作者合 main 进下一批）
- #1119 `015f74a03` BLOCKED（等 ac-review 排审）；#1120 已合 `aa4de404f`；#1147/#1150/#1151/#1137 归合并线（Codex）。

## 合并排队列现状（仅同步，不操作）
- 合并队列：pos1 #1158、pos2 #1156、pos3 #1137、pos4 #1142、pos5 #1116，全 AWAITING_CHECKS；main 停在 `aa4de404f`（02:19Z 起），合并动作归 Codex 统筹。

## 本会话边界
- 不入队/不取出/不写 MERGE-QUEUE §3（本状态文件除外）；修复者只动各自 PR 分支；不取消 CI、不 force push、不改门禁脚本。
