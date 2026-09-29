Role
The product face is the system sans (`FONT_STACK` in ../src/typeface.ts): SF Pro / PingFang SC on
macOS, Segoe UI / Microsoft YaHei on Windows. The two files below are offline fallbacks only, used
when no system face covers a glyph. Noto Sans SC ships Regular (400) alone; with
`font-synthesis-weight: none`, 500 and 600 fall back to the system face instead of a faux bold.
Do not add these files back as the primary face, and do not force a weight on every element.

Inter Variable (latin wght)
Source: https://fontsource.org/fonts/inter (variable, latin)
License: SIL Open Font License 1.1 — https://scripts.sil.org/OFL
Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)

Noto Sans SC Regular (chinese-simplified)
Source: https://fontsource.org/fonts/noto-sans-sc
License: SIL Open Font License 1.1 — https://scripts.sil.org/OFL
Copyright 2022 The Noto Project Authors (https://github.com/notofonts/noto-cjk)
