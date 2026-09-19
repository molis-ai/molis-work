# 首页与 Onboarding 背景跟主题走

状态：已完成，2026-09-17。完成等级 **2**（切片）+ 生产 Onboarding 色值。覆盖 `specs/onboarding-palette-alignment/spec.md` 里把 canvas 写成 `#f4f5f8` / `#111216` 的合同。

## 背景目标

工作台主题场是 Linear zinc：`--page` / `--canvas` 浅 `#f3f4f5`、深 `#0f1011`。Onboarding 和首页切片现在用另一套偏蓝的冷灰底，和壳、主题对不上。

## 当前行为与问题

`packages/design-system/src/onboarding-styles.ts` 与 `.impeccable/review/home-field/index.html` 把场涂成 `#f4f5f8` / `#111216`。切片 `section.home` 整块舞台因此发蓝。

## 范围与非目标

范围：

- Onboarding `--onboarding-canvas` 与主题 `--page` 同值；深色 paper 跟主题 `--paper`。
- 切片 page / canvas / nav-bg / rail / paper 用同一套主题场，`--onboarding-canvas` 指向 `--page`。
- 更新 `specs/home-field-start/spec.md` 里过时的 canvas 色。

非目标：不改 Onboarding 步骤、动效、文案；不改生产首页布局；不重做 ink / accent；不 commit。

## 验收

1. 切片浅色舞台是 `#f3f4f5`，不是 `#f4f5f8`；深色是 `#0f1011`。**通过**（8791：stage `rgb(243, 244, 245)` / `rgb(15, 16, 17)`）。
2. 生产 Onboarding canvas 与 Coss `--page` 同值。**通过**（`tests/coss-control-language.test.ts`）。
3. 月历、主继续、时间流仍在；动效仍在。**通过**（切片浅/深截图）。
