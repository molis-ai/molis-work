# 已删除或不在 main 的 BL 编号

本表只做墓碑，不重新打开事项。现行文档引用历史编号时先查这里；`specs/backlog/` 下没有对应文件，不代表事项仍未处理。

上半张表是关键历史编号和替代关系；末尾「缺失编号速查」是完整允许名单，按当前活文档生成，不是新的待办。两者重复的编号以替代关系为准。

| 编号 | 处置 | 依据 / 替代 |
| --- | --- | --- |
| BL-041、BL-102、BL-112、BL-138、BL-910、BL-958 | 第 27 批验收集中跟踪 | 第 27 批 #2010 收成 [BL-batch27-acceptance](../specs/backlog/BL-batch27-acceptance.md)；原条目删除 |
| BL-091、BL-096、BL-103、BL-131、BL-367、BL-569、BL-701、BL-803、BL-819、BL-821、BL-901、BL-911、BL-913、BL-914、BL-915、BL-918、BL-919、BL-920 | 已完成并删除 | 第 27 批 #2010（`539d2d7d46`，2026-11-12）；验收余项见 BL-batch27-acceptance |
| BL-plugin-dev-state-dir-before-locale-check、BL-catalog-specimen-default-margin | 已完成并删除 | 第 14 批登记的两条小缺口，2026-11-13 14／27 收口 PR 修掉；见 [14.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/14.md#实现进度与合入记录) |
| BL-376 | 已并入 BL-377 | [BACKLOG.md](../specs/BACKLOG.md) 顶部说明；Alchemist 由 [BL-377](../specs/backlog/BL-377.md) 整体重做，编号不复用 |
| BL-928 | 已完成并删除 | 真实 Home 干净重建，2026-11-07 #1914（`d125b36f5c`） |
| BL-linux-ci-browser-reds | 已完成并删除 | 2026-11-13 #2044 放宽首页截止、#2046 修其余 Linux 浏览器用例；批次 15 已记「BL 已删」 |
| BL-side-files-merged-reads | 已完成并删除 | 第 06 批 N52 已并入并完成；批次 06 与依赖表保留历史说明 |
| BL-1071 | 已关闭；两个历史事项曾同号 | 2026-11-07 #1921 删除 S-102 的条目；Memory 的 SDK 采用随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入。编号不再复用 |
| BL-memory-p0-closure | 已完成并删除 | Memory P0 经 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入；继续跟踪的事项已列在 [BACKLOG](../specs/BACKLOG.md) |
| BL-1076、BL-1077 | 已按用户决定关闭 | 随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入；[本人走查](../specs/backlog/BL-memory-own-app-walkthrough.md)另列，历史真实 Home 影响仍未知 |
| BL-161、BL-164 | 已完成并删除 | 第 12 批第一项（`4d8bc20bf2`）：计划卡与任务板按位置编号、「未开始」统一为「等待前一步」；见 [12.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/12.md) |
| BL-feed-wake-resets-page、BL-assistant-card-press-scrolls | 已修复并删除 | 随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入，Feed FBR-07/FSS-35 与助理 AC-05 在[最终 Linux 全量](https://github.com/molis-ai/molis-work/actions/runs/43467505571)首轮通过 |
| BL-coding-skill-auto | 已完成并删除 | 2026-11-11 第 09 批审计整改补做，见 [specs/README](../specs/README.md) 与 [第 09 批](../specs/post-anticorruption-roadmap/reference/batches/09.md) |

其余在 git 历史中曾经出现、后来随事项完成或总表迁移删除的编号，按同一规则处理：先查对应 PR/提交，不为历史编号新建文件，也不复用编号。

## 已并入 BL-b16-server-text-residue

BL-455、BL-456、BL-457、BL-459、BL-460、BL-461、BL-462、BL-463、BL-464、BL-545、BL-546 已合并为 [BL-b16-server-text-residue](../specs/backlog/BL-b16-server-text-residue.md)。第 16 批 #2031（`206884b447`，2026-11-12）删除了所有 `plugins/native/*/src/en.ts`；旧条不再单独跟踪，残留服务端文案按新条逐插件核。

## 缺失编号速查（2026-11-13）

共 171 个编号在非归档文档里被引用，但 main 的 specs/backlog 没有对应文件。

| 编号 | 引用文件数 | 处置 |
| --- | ---: | --- |
| BL-915 | 13 | 已完成/并入/验收条目；见上表 |
| BL-411 | 11 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-701 | 11 | 已完成/并入/验收条目；见上表 |
| BL-491 | 10 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-910 | 10 | 已完成/并入/验收条目；见上表 |
| BL-108 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-321 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-376 | 9 | 已完成/并入/验收条目；见上表 |
| BL-530 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-628 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-914 | 9 | 已完成/并入/验收条目；见上表 |
| BL-157 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-301 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-303 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-144 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-309 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-803 | 7 | 已完成/并入/验收条目；见上表 |
| BL-901 | 7 | 已完成/并入/验收条目；见上表 |
| BL-911 | 7 | 已完成/并入/验收条目；见上表 |
| BL-912 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-928 | 7 | 已完成/并入/验收条目；见上表 |
| BL-102 | 6 | 已完成/并入/验收条目；见上表 |
| BL-1071 | 6 | 两个历史事项曾同号，均关闭；见上表 |
| BL-131 | 6 | 已完成/并入/验收条目；见上表 |
| BL-145 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-149 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-156 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-352 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-367 | 6 | 已完成/并入/验收条目；见上表 |
| BL-543 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-544 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-569 | 6 | 已完成/并入/验收条目；见上表 |
| BL-588 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-596 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-645 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-680 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-880 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-900 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-937 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-041 | 5 | 已完成/并入/验收条目；见上表 |
| BL-096 | 5 | 已完成/并入/验收条目；见上表 |
| BL-138 | 5 | 已完成/并入/验收条目；见上表 |
| BL-146 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-152 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-163 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-180 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-183 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-493 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-595 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-700 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-791 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-819 | 5 | 已完成/并入/验收条目；见上表 |
| BL-918 | 5 | 已完成/并入/验收条目；见上表 |
| BL-919 | 5 | 已完成/并入/验收条目；见上表 |
| BL-958 | 5 | 已完成/并入/验收条目；见上表 |
| BL-coding-skill-auto | 5 | 已完成/并入/验收条目；见上表 |
| BL-091 | 4 | 已完成/并入/验收条目；见上表 |
| BL-103 | 4 | 已完成/并入/验收条目；见上表 |
| BL-1058 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-112 | 4 | 已完成/并入/验收条目；见上表 |
| BL-150 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-154 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-221 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-323 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-350 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-455 | 4 | 已并入 BL-b16-server-text-residue |
| BL-490 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-492 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-501 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-521 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-646 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-713 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-790 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-821 | 4 | 已完成/并入/验收条目；见上表 |
| BL-side-files-merged-reads | 4 | 已完成/并入/验收条目；见上表 |
| BL-1077 | 3 | 已关闭；见上表 |
| BL-121 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-130 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-141 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-143 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-151 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-172 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-181 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-300 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-354 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-356 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-366 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-379 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-388 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-403 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-404 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-459 | 3 | 已并入 BL-b16-server-text-residue |
| BL-470 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-545 | 3 | 已并入 BL-b16-server-text-residue |
| BL-546 | 3 | 已并入 BL-b16-server-text-residue |
| BL-581 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-583 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-589 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-691 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-710 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-711 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-715 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-802 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-814 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-913 | 3 | 已完成/并入/验收条目；见上表 |
| BL-920 | 3 | 已完成/并入/验收条目；见上表 |
| BL-935 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-936 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-browser-site-decisions-unreadable | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-composer-source-refresh | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-083 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-088 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1036 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1067 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-114 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-132 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-147 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-155 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-158 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-159 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-18 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-311 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-322 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-353 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-355 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-363 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-372 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-386 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-393 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-396 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-456 | 2 | 已并入 BL-b16-server-text-residue |
| BL-457 | 2 | 已并入 BL-b16-server-text-residue |
| BL-460 | 2 | 已并入 BL-b16-server-text-residue |
| BL-461 | 2 | 已并入 BL-b16-server-text-residue |
| BL-462 | 2 | 已并入 BL-b16-server-text-residue |
| BL-463 | 2 | 已并入 BL-b16-server-text-residue |
| BL-464 | 2 | 已并入 BL-b16-server-text-residue |
| BL-481 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-494 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-555 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-559 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-615 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-616 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-618 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-714 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-755 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-780 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-781 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-916 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-926 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-939 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-956 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-background-inherits-page-locale | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-coding-write-check-row-acceptance | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-computer-records-shape | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-contract-comment-stale-versions | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-first-screen-gate-prework | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-json-parse-copies | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-linux-ci-browser-reds | 2 | 已完成/并入/验收条目；见上表 |
| BL-local-protection-version-check | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-memory-p2 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-model-preference-save-overwrite | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-phone-home-tools-stay-visible | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-020 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-090 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-099 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-100 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1076 | 1 | 已按用户决定关闭；见上表 |
