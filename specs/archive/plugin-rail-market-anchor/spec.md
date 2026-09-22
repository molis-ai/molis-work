# 插件市场钉在入口卡底

状态：已落地。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

插件栏中间那张入口卡（`.plugin-rail-items`）`flex: 1` 铺满项目岛和设置底栏之间。首页和已启用插件从顶往下排，「插件市场」DOM 虽在最后，视觉上却贴在最后一个工作插件下面，卡底空着。一骏选中市场按钮，要求它默认在这个容器最下方。

## 当前行为与问题证据

市场按钮是 `.plugin-rail-items` 的最后一项，没有 `margin-top: auto`。插件少时，入口卡下半截是空白，市场悬在中部。

## 范围与非目标

做：市场按钮钉在入口卡底（卡内 padding 之内），与工作插件之间吃掉剩余高度。DOM 仍是首页 → 已启用插件 → 市场。设置齿轮和账号仍在下一张底栏卡。

不做：不改点按、不把市场搬出入口卡、不改底栏、不改市场页。

## 使用场景

1. 打开项目：入口卡顶是首页和已启用插件，市场贴卡底；下面仍是设置 + 账号。
2. 启用很多插件、入口卡开始内滚：市场仍是列表最后一项，可滚到。

## 方案

`.plugin-rail-items [data-plugin-id="market"] { margin-top: auto; }`。工作插件继续 `flex: none` 从顶堆。

## 文件边界

允许改：`apps/workbench/src/styles/immersive-navigation.ts`、`specs/archive/chrome-plugin-rail/spec.md`；`tests/chrome-inner-scroll.test.ts`、`tests/immersive-directory.e2e.test.ts`。

## 验收标准

1. 市场按钮底边贴入口卡内容底（含 padding，误差 ≤2px）。
2. 市场顶边低于最后一个工作插件底边，中间有明显空隙（插件未撑满时）。
3. 点市场仍打开插件市场；设置/账号仍在底栏卡。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/chrome-inner-scroll.test.ts \
  tests/immersive-directory.e2e.test.ts
```

4174 打开项目，看入口卡底是否是四格市场图标。
