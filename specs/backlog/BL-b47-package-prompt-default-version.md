# BL-b47-package-prompt-default-version

分组：5. 插件

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-b47-package-prompt-default-version | 签名包升级后，改过的模型要求能提示「默认已更新」 | [第 47 批 47-1](../post-anticorruption-roadmap/reference/batches/47.md) | 已知缺口 | 要给安装包的 `prompts.json` 加可选字段，属于带版本文件的结构变更，须走合同流程并由用户确认 | `format.plugin.package`、`docs/system/CONTRACT-CHANGES.md` | 中 | 待分配 |

- 现状：从签名包装进来的插件，每条模型要求的默认版本恒为 1（`releaseInstructions(release, [release])`）。新版包改了某条默认文字时，「Prompt 与 Character」里你改过的那条不会提示「基于旧默认，默认已更新」。第三方签名包一直如此；第 47 批把创作台做的插件也改为只装签名包以后，它们同样如此（之前创作台的私有安装路按各发布版本的文字算版本，会提示）。
- 做法方向：发布者在 `prompts.json` 的每一项里写可选的 `version`（正整数，默认文字变了才加一），平台读它作为默认版本；创作台发布时用 `promptVersions` 按自己的发布历史填。没有这一项的包仍按 1。
- 验收：同一发布者的两个版本，后一版改了一条默认文字并把 `version` 加一；装前一版、改这条、升级后，这条显示「默认已更新」，没改文字的不显示。
