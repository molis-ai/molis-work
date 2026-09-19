# 去掉项目首页名人名言

状态：已完成，2026-09-17。完成等级 **3**（本机功能可用）。覆盖 `specs/home-quote-autoplay/spec.md`、`specs/poetic-project-home/spec.md` 与 `specs/home-narrow-footer-quotes/spec.md` 里仍有效的引语合同。

## 背景目标

首页不再用名人名言占注意力。切片上那句「千里之行，始于足下。」和产品里整套引语轮播一并拿掉。

## 当前行为与问题

生产 `renderProjectHome` 渲染 13 条引语（3 条有出处的古典短句 + 10 条 Adeptify 英文名言），约 8 秒自动轮换，悬停/聚焦暂停。切片 work 步 `p.intro` 也放了同一句道德经。

## 范围与非目标

范围：

- 生产：删 quotes 数据、引语 DOM、8 秒轮播、衬线 `--font-quote`、相关样式与 i18n。
- 切片：删 work 步名言。空态「目标和依赖会作为节点出现在画布上。」是产品说明，保留。
- 当前 SSOT：`DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`、`.impeccable/design.json` 里描述现有首页的句子。

非目标：

- 不重做首页月历、快捷方式、禁用 Agent。
- 不改 Feed 正文 `blockquote`。
- 不删历史 spec / review 档案。
- 不 commit，不打用户默认 home。

## 方案

首页日期旁不再有引语区。日历仍每 30 秒对日。切片 work 步月历下面直接接主继续。

## 验收

1. 生产首页没有 `[data-home-quote]`、`.home-reflection`、名言原文或 8 秒轮播定时器。**通过**（`tests/project-home-start.e2e.test.ts` 2026-09-17，3/3）。
2. 月历翻月、跨日同步、禁用 Agent、快捷方式仍可用。**通过**（同上）。
3. 切片 work 步看不到「千里之行」或出处 cite。**通过**（8791 `?v=noquote`：work 步月历下直接接主继续；empty 步仍有「目标和依赖会作为节点出现在画布上。」）。
4. 英文词条不再包含名言原文与上一句/下一句/轮播控件。**通过**（`apps/workbench/src/i18n/en.ts`；`tests/visual-foundation.test.ts` 无 `--font-quote`）。
