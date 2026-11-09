# 中英文界面文字的写法

两种语言各守各的规矩。先把意思定准，再分别用各自的习惯写出来，不逐字对译。

## 中文

- **标点用全角：** ，。：；？！「」（）。句末的句号在按钮、标签、标题、表头里不加；在完整的说明句、错误提示里加。
- **引号用直角引号「」，** 引号里再引用时用『』。
- **中文与英文、数字之间加一个空格：** 「已同步 3 个文件」「连接 GitHub 账号」。和全角标点相邻时不加。
- **数字用阿拉伯数字，** 单位和数字之间按产品已有习惯统一（「3 分钟」）。
- **不用「您」和「你」混用，** 选一种全程一致；界面里多数时候可以省掉主语。
- **少用「请」：** 按钮和标签里不用；只在真的是在请求人做一件事时用。
- **不堆语气词和感叹号，** 不用网络流行语。
- **说法短而完整：** 「没能保存」比「保存失败了哦」清楚，比「保存失败」多了一点人味；按产品语气选定一种，全程一致。

## English

- **Sentence case** for buttons, labels, headings and menu items: "Delete project", not "Delete Project". Proper nouns keep their capitals.
- **No full stop** on buttons, labels, headings or single-phrase messages; use one at the end of full sentences in descriptions and errors.
- **Verbs first on buttons:** "Send invite", "Archive". Avoid "OK", "Yes", "Submit" when a specific verb fits.
- **Plurals agree with the count:** "1 file", "2 files", "No files". Never "file(s)".
- **Contractions are fine** where the product voice is friendly ("can't", "don't"); pick one register and keep it.
- **Address the reader as "you"** only when needed; most interface text needs no pronoun.
- **Dates and times** follow the reader's locale; use relative times for the recent past ("3 min ago").
- **Use straight wording,** not idioms or puns that will not survive a later translation.

## 中译英、英译中时

- 先确认术语表里的对应词；没有的，提出一个并说明理由，不在一处临时发明。
- 英文通常比中文长 30%～100%，短标签可能长到两三倍：按钮、表头、标签页要按英文的长度检查是否放得下，放不下时改说法，不靠缩小字号。
- 中文里省掉的主语和宾语，英文里常要补出来；反过来，英文里的冠词和代词在中文里多半要去掉。
- 状态词成对翻译，保持对称：已启用 / Enabled，已停用 / Disabled。
- 不在英文里保留中文的标点，也不在中文里用英文的半角逗号和句号。

## 对照示例

| 位置 | 中文 | English |
| --- | --- | --- |
| 按钮 | 删除项目 | Delete project |
| 成功提示 | 已归档 2 个项目 | Archived 2 projects |
| 空状态 | 还没有记录。新建一条开始。 | No records yet. Create one to get started. |
| 错误 | 没能保存：网络连接断开了。内容还在，连上后重试。 | Couldn't save: the network connection dropped. Your changes are still here; try again once you're back online. |
| 危险确认 | 删除「季度计划」？删除后不能恢复。 | Delete "Quarterly plan"? This can't be undone. |
