# Chinese and English UI copy style guide

Each language follows its own conventions. Nail down the exact meaning first, then write naturally in each language rather than translating word for word.

## Chinese

- **Full-width punctuation:** `，。：；？！「」（）`. Omit trailing periods on buttons, labels, headings, and table headers; include them on complete descriptions and error sentences.
- **Corner quotation marks:** use `「」`, and `『』` for nested quotes.
- **Single space between Chinese and Latin letters or digits:** `已同步 3 个文件`, `连接 GitHub 账号`. No extra space adjacent to full-width punctuation.
- **Arabic numerals** with consistent unit spacing (`3 分钟`).
- **Consistent address:** never mix `您` and `你`; omit the pronoun altogether when natural in UI copy.
- **Use `请` sparingly:** omit on buttons and labels; use only when genuinely asking the person to take an action.
- **Restrained tone:** avoid exclamation stacks, filler particles, and internet slang.
- **Short and complete:** pick one product voice (e.g., `没能保存` vs `保存失败`) and hold it consistently.

## English

- **Sentence case** for buttons, labels, headings, and menu items: "Delete project", not "Delete Project". Preserve capitalization on proper nouns.
- **No full stop** on buttons, labels, headings, or short phrase toasts; use one at the end of full sentences in descriptions and errors.
- **Verbs first on buttons:** "Send invite", "Archive". Avoid generic "OK", "Yes", or "Submit" when a concrete verb fits.
- **Proper plurals:** "1 file", "2 files", "No files" — never "file(s)".
- **Consistent contractions:** friendly contractions ("can't", "don't") are fine; pick one register and stick with it.
- **Use "you" only when helpful:** most labels and statuses read cleaner without a pronoun.
- **Locale-aware dates and times:** use relative times for the recent past ("3 min ago") and localized dates otherwise.
- **Plain phrasing:** avoid idioms or puns that fail in translation.

## Translating between Chinese and English

- Check the glossary first; propose and document any new term instead of coining one ad hoc.
- English runs 30%–100% longer than Chinese (and up to 2–3× on short labels): verify buttons, tabs, and headers fit in English and reword rather than shrinking font sizes.
- Restore omitted subjects and objects when translating Chinese → English; trim unnecessary articles and pronouns when going English → Chinese.
- Keep paired state labels symmetric: `已启用` / Enabled, `已停用` / Disabled.
- Never leak Chinese punctuation into English or ASCII commas/periods into Chinese prose.

## Side-by-side examples

| Element | Chinese | English |
| --- | --- | --- |
| Button | 删除项目 | Delete project |
| Success toast | 已归档 2 个项目 | Archived 2 projects |
| Empty state | 还没有记录。新建一条开始。 | No records yet. Create one to get started. |
| Error | 没能保存：网络连接断开了。内容还在，连上后重试。 | Couldn't save: the network connection dropped. Your changes are still here; try again once you're back online. |
| Destructive confirmation | 删除「季度计划」？删除后不能恢复。 | Delete "Quarterly plan"? This can't be undone. |
