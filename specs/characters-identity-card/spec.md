# Characters 入口放进身份底卡

## 背景

Characters 是个人角色库：草稿在 Home，不跟项目启用列表走。侧栏中间是项目工作插件。底卡是全局设置和账号。角色入口夹在工作轨里，和账号头像抢同一个「人」的位置。

## 当前行为

Manifest 仍声明 `navigator`。`renderPluginRail` 把所有 navigator 视图按顺序放进 `.plugin-rail-items`，市场用 `margin-top: auto` 沉底。底卡只有设置和账号。

## 范围

- 底卡顺序为插件市场、Characters、全局设置、账号。
- 点击仍打开原来的角色工作台和市场。选中态、色、标签页标题不变。
- 其他个人插件留在工作轨。市场不再沉在工作轨底部。
- 插件创作工作台作为元能力放在工作轨顶部，图标用魔杖，不用月亮，也不用四格目录。下面一条 16px 短线，不贴栏的左右边。没有它时不画这根线。

## 非目标

- 不新增视图槽。底卡仍是壳，不是插件能声明的位置。
- 不把角色收进设置目录。
- 不改草稿存储、发布或企业预设。

## 方案

壳在画轨时把 `characters` 从中间列表取出，插进底卡开头。Manifest 槽保持 `navigator`，目录、标签和搜索仍认这个入口。

## 验收

- 工作轨条目里没有 `data-plugin-id="characters"`。
- 底卡里 Characters 在设置之前，设置在账号之前。
- 未启用 Characters 时底卡仍只有设置和账号。

## 验证

`node --import tsx --test tests/characters-appearance.test.ts`

桌面页断言在 `tests/desktop-tui.test.ts` 的工作台共享用例里。
