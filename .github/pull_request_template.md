## 做了什么

<!-- 一两句：解决什么问题，用户或调用方看到的变化。对应的 spec / 问题编号。 -->

## 验证

CI 只跑包边界、类型检查和动作合同子集（`pnpm test:contracts`）。全量回归在本机跑，写明结果：

- [ ] 改过 `*/src`、`scripts` 或 `package.json` 后已整体 `pnpm build`
- [ ] 健康门禁对照 merge-base 通过：`node scripts/check-health-gates.mjs --base origin/main`（CI 也这样比，在 PR 里 `--update` 放不过变大的）；数字变小就用 `--update --base origin/main` 在本 PR 更新 `tooling/gates/baseline.json`
- [ ] 全量非浏览器：`node scripts/run-tests.mjs` → 通过 / 失败数：
- [ ] 浏览器用例（界面改动时）：跑了哪些文件、结果：
- [ ] 失败逐项说明：与基线（`git worktree add --detach <base>`，同一批文件）对比，哪些是本 PR 引入的、哪些基线就有
- [ ] 界面改动：浅色 / 深色，1440 / 1024 / 390 宽度的截图或走查记录

## 没做 / 待定

<!-- 有意留下的范围、需要别人决定的事、未验证的部分。 -->
