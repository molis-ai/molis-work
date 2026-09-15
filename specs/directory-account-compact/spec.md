# 目录账号行变矮

状态：已完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次视觉变更的唯一需求书。姓名分行、主题色、无下划线、设置入口仍遵守 `specs/home-narrow-footer-quotes/spec.md`。覆盖 `specs/directory-list-divider/spec.md` 里原先保留的账号区顶线。

## 背景与问题

用户选中 `.personal-account`：高度 60px，比插件条 32px 行和目录 44px 两行都高，底部空白过多。压矮之后，设置齿轮和「一骏 / 本地空间」所在页脚上方仍有 1px `--line` 顶边，把目录切成两块。

## 范围与非目标

### 范围

- 工作台目录底部账号行压到约 36px（链接本身），页脚内边距一并收紧。
- 姓名与「本地空间」仍上下两行，过长省略；头像与设置齿轮垂直居中。
- 去掉 `.personal-sidebar-footer` 与 `.directory-shortcuts` 顶部分割线，与目的地/列表同一石墨底。账号区和快捷方式不再用横线切开。
- ≤600px 抽屉里账号行不小于 40px，保证触控。
- 仍打开全局设置，带当前项目。

### 非目标

- 不改设置页自己的导航脚。
- 不改首页诗意区、插件条、列表行高。
- 侧栏右边竖线仍在。

## 文件边界

- `apps/workbench/src/styles/immersive-navigation.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- `tests/project-home-start.e2e.test.ts`

## 验收

1. 桌面账号链接高度约 36px，明显低于原来的 60px。**通过**（4182 实测 38px）。
2. 姓名在上、空间说明在下，无下划线，齿轮仍打开设置。**通过**。
3. 账号页脚和快捷方式分区都没有 1px 顶边。**通过**（4182 实测 0px；`project-home-start.e2e`）。
4. 390 抽屉里账号行 ≥40px，仍能点开设置。**通过**（`project-home-start.e2e` 761/760/600/390）。
5. 相关 e2e 通过。**通过**（账号测试）。
