# 项目选择页内容左右居中

完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

「选择一个项目」到达面。用户说内容没有居中，指的是**左右**，不是上下。选择块应在顶栏以下的剩余视口里水平居中，垂直仍从顶栏下开始。

## 当前行为与问题证据

用户桌面截图（1024×454）量过：三张卡片整体宽约 837px，左边距 50px，右边距 137px，整块偏左。

根因：工作台 `personal-shell` 把 `body[data-desktop-shell="true"]:not(.settings-page) .topbar` 放进 `grid-column: 2`。项目选择页一直带着 `data-desktop-shell`，选择器比到达面自己的 `grid-column: 1` 更强，于是顶栏变成右侧约 102px 空列（红绿灯 88px padding），主区只剩左侧。选择块在主区里居中，相对整窗仍偏左。

上次误做成垂直居中，不是用户要的。

## 范围与非目标

做：标题 + 搜索 + 卡片 + 说明作为一块在主区水平居中。垂直保持贴顶。项目多时仍只滚 `.project-index-body`。

不做：不改顶栏、搜索、建项、卡片内容和主题；不改工作台；不再做垂直居中。

## 方案

到达面顶栏、主区盖过 `personal-shell` 的 `grid-column: 2`，整页单列。`.project-index` 用纵向 flex：`align-items: center`（左右居中），`justify-content: flex-start`（贴顶）。面板 `margin-inline: auto`。窄屏 `align-items: stretch`。

## 验收

1. 三个项目的到达面：选择块相对窗口左右居中，左边距和右边距接近。
2. 垂直仍贴顶栏下方，不沉到视口中线。
3. 标题、搜索、新建、三张卡片关系不变。
4. 项目很多时只滚卡片区，顶栏不跟着滚。
5. 390 窄屏内容拉满宽度。

## 验证

```
pnpm exec tsx --test --test-concurrency=1 tests/project-index-arrival.test.ts
```

浏览器打开项目选择页，对照宽屏左右边距与贴顶。
