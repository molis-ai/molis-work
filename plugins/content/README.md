# 随安装包带上的内容包

这里放 Molis Work 随安装包带上、还没装的官方「只有声明的插件」（`kind: "content"`）的源：只有 Skill 与发布选择，没有代码，不是 workspace 包，也没有内置 `registration`。规则见[技能包合同稿](../../specs/skill-packs/contract-design.md)第 3 节，做法见[技能包需求](../../specs/skill-packs/spec.md)第 11 节「08-10 的做法」。

| 目录 | 内容 |
| --- | --- |
| `design-accessibility/` | 设计与无障碍（BL-165）：`accessibility-review`、`design-critique`、`design-handoff`、`design-system`、`ux-copy` 五个 Skill |

每个包目录：

- `skills/<skill_id>/SKILL.md`：frontmatter 每个值一行，写明 `name`、`version`、`description`、`when_to_use`、`when_not_to_use`、`argument_hint` 和 `applies_to`；附带文件只放在 `references/`，正文写明什么时候读它。
- `pack-content.json`：发布时的选择（插件 id、版本、名称、摘要、发布者与范围）。`name_text`、`summary_text` 引用 `locales` 声明的随包语言文件。宿主读取签名包里的声明和词，不读取此源文件。
- `locales/<语言>.json`：同一个包的显示词。技能目录按 `<主人>.skill.<skill_id>.<字段>` 读 `name`、`description`、`when-to-use`、`when-not-to-use`。没有对应词就显示技能声明的原文。参数提示沿用声明，技能正文来自它的 `SKILL.md`。

打包：`molis-work-plugin pack-bundled plugins/content/<包> <输出目录> --publisher-key <私钥>`，与 `pack-content`、从本机导入同一个打包函数，同一步签名（见 [plugin-cli](../../tooling/plugin-cli/README.md#随安装包带上的包)）。没有密钥就拒绝、什么都不写。官方发布者密钥和在发版构建里把包放进 `apps/local-host/dist/bundled-plugins/` 归第 26 批（26-1），这里不放任何密钥。

改了正文或资源，就给那个 Skill 的版本加一，并给包升版：两者都只改 `tooling/versions.json`（`method.design-accessibility.<skill_id>`、`plugin.content-design-accessibility`），再跑 `pnpm versions:generate` 改写 `SKILL.md` 与 `pack-content.json`；改完跑 `node scripts/run-tests.mjs tests/design-accessibility-pack.test.ts tests/security-invariants-bundled-packages.test.ts`。
