Role
The default product face (F1 in `../resources/fonts/system-sans.json`) pairs bundled `Inter Variable`
for Latin and numerals with bundled `Noto Sans SC` (full 400 Regular 6,085-glyph simplified set plus
1,471-glyph 500 Medium and 600 SemiBold UI subsets covering 100% of all shipped Workbench, IM-UI, and
native plugin Chinese locales including built-in skin names), falling back cleanly to platform CJK faces
(`PingFang SC`, `Hiragino Sans GB`, `Microsoft YaHei UI`, `Microsoft YaHei`, `Noto Sans CJK SC`,
`Source Han Sans SC`) for rare user-typed glyphs outside the 500/600 UI subset. With
`font-synthesis-weight: none`, every UI weight uses real outlines with zero faux-bold smearing.

Inter Variable (latin wght)
Source: https://fontsource.org/fonts/inter (variable, latin)
License: SIL Open Font License 1.1 — https://scripts.sil.org/OFL
Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)

Noto Sans SC Regular (400 full) & Medium / SemiBold (500 / 600 common UI subsets)
Source: https://www.npmjs.com/package/@fontsource/noto-sans-sc/v/5.3.1 (from https://fontsource.org/fonts/noto-sans-sc)
License: SIL Open Font License 1.1 — https://scripts.sil.org/OFL
Copyright 2022 The Noto Project Authors (https://github.com/notofonts/noto-cjk)

## Folio

Molis Folio Rounded SC is based on Resource Han Rounded CN v1.910. The 400, 500, 600 and 700 faces use the original weight outlines converted to TrueType. Each has a common-character WOFF2 and a tail WOFF2. The exact ranges and loading order are in [the Folio font scheme](../resources/fonts/folio-rounded.json). [Source release](https://github.com/CyanoHao/Resource-Han-Rounded/releases/tag/v1.910) · [Original SIL Open Font License 1.1](OFL-RHR.txt)

Folio's Latin face is the original Nunito variable WOFF2 distributed by `@fontsource-variable/nunito` 5.3.0. It covers weights 200–1000. [Source package](https://www.npmjs.com/package/@fontsource-variable/nunito/v/5.3.0) · [Original SIL Open Font License 1.1](OFL-Nunito.txt)
