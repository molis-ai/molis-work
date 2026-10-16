# 最新进展：代码防腐

日期：2026-10-17。同一项审查做了两次完整测量。当前结论只认第二次。第一次留在分支上，作为更早提交的记录。

## 现在读哪一份

- 分支：`docs/anti-corruption-review-2026-10-16`
- 当前提交：`78beef35c`（`docs(reviews): add the c1531e6dd anti-corruption pass`）
- 当前文件：`docs/reviews/anti-corruption-review-c1531e6dd.md`、`docs/reviews/anti-corruption-checklist-c1531e6dd.md`
- 测量提交：`c1531e6dd`（#593，`docs(backlog): BL-143 — the Feed reader's retry flake in product-interaction`）
- 相对当前 `origin/main` `76758783a`：这条分支落后 14，超前 2
- 没有改产品代码、门禁、规格或测试，也没有开 PR

`c0f8fb29f` 里的 `docs/reviews/anti-corruption-review-2026-10-16.md` 测的是 `dfc81998a`（#565），写入时的 `main` 是 `1cbe75f2d`。那一次的计数（例如巨大单元 144）只属于那个提交。现在的计数以 `c1531e6dd` 为准。

## 第二次测量

命令：`node scripts/check-health-gates.mjs --base origin/main --report`。当时 HEAD 就是 `origin/main`，退出码 0。输出里没有 grew、FAIL 或 increased。只减家族等于基线：巨大单元 143（其中 139 待拆）、测试内部引用 494 / 244 个文件、浏览器空 catch 136 / 52、原始 fetch 87 / 44、手写 HTTP 状态 87 / 24、错误子类 28、公开 API 快照 64 个文件 / 2481 条声明、无人认领的文件 431、翻译冲突 192、死键 2437（只报告）。

清单 133 项都已勾选。勾选表示 pass，或点名下面的发现。清单写完后又按同一份清单对过计数和被引用的行。这次复审没有新增范围内的发现。页面资源预算没有跑：那一步是 `node scripts/gates/page-assets.mjs`，CI 在 `.github/workflows/ci.yml` 约第 193 行单独执行。全量测试、`boundary:check`、`secrets:check` 和命名的端到端测试都没有跑。没有打开真实 Home。

## 仍然开着的项

- RAC-19 / F-01：第 4 到第 6 波没有结束。Form 已由 Plugin Runtime 启动。构建期还剩 17 个：alchemist、artifacts、cognia、dataset、feed、goals、images、inbox、jelly、lingguang、pages、plugin-builder、ppt、schedule、sessions、workflows、todo。
- RAC-01：在「获批计划并且样板已经合入」这一支上为 pass。迁移文档和规格 §12.4 的旧句子是 F-40、F-41，不改变这个 pass。
- RAC-02 / F-02：`scripts/replay-plugins.mjs` 不在树上。`docs/system/CONTRACT-CHANGES.md` 第 56 行写明回放工具现在还没有。
- RAC-03 / F-39：`docs/system/EXTENSION-POINTS.md` 第 37–51 行里，方向 3、6、7、9、12、13 仍写「无切片」。第 238–243 行的演练仍高于目标。第 299 行写明 X-1 到 X-7 在写进路线之前不算承诺。
- RAC-04 / F-03：热点仍是巨大单元。`plugins/native/pages/src/editor-browser.ts` 3854 行。`assistant-service.ts` 文件 2081 行，类 `AssistantService` 1663 行、99 个方法。
- RAC-14 / F-30：`docs/system/HOME-DATA.md` 第 6 行的真实 Home 清单没有打开库。备份命令和备份类的记录仍缺。
- RAC-16 / F-31、F-40、F-41：规格状态仍是执行中。`RUNTIME-MIGRATION.md` 仍写 Form 迁移尚未开始。规格 §12.4 第 1992 行和第 2004 行与 `c1531e6dd` 的树不一致。
- RAC-18 / F-33：这次只跑了健康门禁，含静态检查和公开 API 快照，不含页面资源预算。

RAC-07、RAC-08、RAC-09、RAC-12、RAC-13、RAC-17 为 partial，发现编号见清单。`76758783a` 上没有重跑这套门禁。
