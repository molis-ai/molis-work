# 去掉目录目的地与列表之间的分割线

状态：已完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是本次视觉变更的唯一需求书。它覆盖 `specs/archive/home-directory-visual-unify/spec.md` 里「目的地与列表分割线仍在」那一条。

## 背景与问题

石墨目录在插件条和下面列表之间有一条 1px `--line` 横线。标题行已经贴着列表，这条线把同一栏切成两块，显得比需要的更硬。

## 范围与非目标

### 范围

- 去掉 `.directory-list-region` 顶部分割线。
- 目的地仍用 `margin-top` 把「插件市场」和下方列表略分开。
- 侧栏与工作面之间的竖线保留。账号区顶线改由 `specs/archive/directory-account-compact/spec.md` 去掉。

### 非目标

- 不改列表行高、标题行工具、全局搜索、筛选弹层。
- 不改编排宽度、抽屉、画布。

## 使用场景

打开任意插件：插件条下面直接是标题行和列表，中间没有横线。

## 文件边界

- `apps/workbench/src/styles/immersive-navigation.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- `specs/archive/home-directory-visual-unify/spec.md`（废止「分割线仍在」）
- `tests/immersive-directory.e2e.test.ts`

## 验收

1. 桌面工作台目录里，目的地和列表之间没有 1px 顶边。**通过**（4182 实测 `border-top: 0`）。
2. 侧栏右边竖线仍在。账号区顶线已改由账号 compact spec 去掉。
3. 定向 e2e 通过。**通过**。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/immersive-directory.e2e.test.ts
```
