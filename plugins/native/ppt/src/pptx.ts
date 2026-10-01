import { strToU8, zipSync, type Zippable } from "fflate";
import type { PptRecord } from "@molis-ai/molis-work-contracts/modules/ppt";

/**
 * A real PowerPoint file (Office Open XML) from a saved deck: one 16:9 slide per page with its title, bullets and
 * speaker notes, in the deck's colours. It opens in PowerPoint, Keynote, WPS and LibreOffice; nothing leaves this
 * computer. Only what the deck holds is written: no images, charts or master editing (specs/archive/work-placement §9).
 */
export const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

type Deck = Pick<PptRecord, "title" | "description" | "color_primary" | "color_background" | "color_text" | "slides" | "updated_at">;

const NS = {
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  p: "http://schemas.openxmlformats.org/presentationml/2006/main",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  officeRel: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
};
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W = 12192000, H = 6858000;

// eslint-disable-next-line no-control-regex
const clean = (value: string): string => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/gu, "");
const esc = (value: string): string => clean(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const hex = (color: string, fallback: string): string => /^#[0-9a-f]{6}$/iu.test(color) ? color.slice(1).toUpperCase() : fallback;

function rels(entries: readonly { id: string; type: string; target: string }[]): string {
  return XML + `<Relationships xmlns="${NS.rel}">` + entries.map(entry => `<Relationship Id="${entry.id}" Type="${NS.officeRel}/${entry.type}" Target="${entry.target}"/>`).join("") + "</Relationships>";
}

const run = (text: string, size: number, color: string, bold = false) =>
  `<a:r><a:rPr lang="zh-CN" altLang="en-US" sz="${size}"${bold ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`;

function slideXml(deck: Deck, index: number): string {
  const slide = deck.slides[index]!;
  const primary = hex(deck.color_primary, "5E6AD2"), background = hex(deck.color_background, "FCFCFB"), text = hex(deck.color_text, "292A2E");
  const title = slide.title || (index === 0 ? deck.title : "");
  const bullets = slide.bullets.length ? slide.bullets.map(bullet => `<a:p><a:pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="•"/></a:pPr>${run(bullet, 2400, text)}</a:p>`).join("")
    : index === 0 && deck.description ? `<a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr>${run(deck.description, 2400, text)}</a:p>` : `<a:p><a:endParaRPr lang="zh-CN" sz="2400"/></a:p>`;
  return XML + `<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld>`
    + `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`
    + `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Accent"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(W * 0.006)}" cy="${H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${primary}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Title ${index + 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="457200"/><a:ext cx="10515600" cy="1143000"/></a:xfrm></p:spPr>`
    + `<p:txBody><a:bodyPr anchor="b"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p>${title ? run(title, 4000, text, true) : '<a:endParaRPr lang="zh-CN" sz="4000"/>'}</a:p></p:txBody></p:sp>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Content ${index + 1}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="1828800"/><a:ext cx="10515600" cy="4351338"/></a:xfrm></p:spPr>`
    + `<p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/>${bullets}</p:txBody></p:sp>`
    + `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function notesXml(deck: Deck, index: number): string {
  const notes = deck.slides[index]!.notes;
  const paragraphs = notes ? notes.split(/\r?\n/u).map(line => `<a:p>${line ? `<a:r><a:rPr lang="zh-CN" dirty="0"/><a:t>${esc(line)}</a:t></a:r>` : '<a:endParaRPr lang="zh-CN"/>'}</a:p>`).join("") : '<a:p><a:endParaRPr lang="zh-CN"/></a:p>';
  return XML + `<p:notes xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
    + `</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

function theme(name: string, primary: string, text: string, background: string): string {
  const fill = `<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>`;
  return XML + `<a:theme xmlns:a="${NS.a}" name="${name}"><a:themeElements>`
    + `<a:clrScheme name="Molis"><a:dk1><a:srgbClr val="${text}"/></a:dk1><a:lt1><a:srgbClr val="${background}"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>`
    + `<a:accent1><a:srgbClr val="${primary}"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="4472C4"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>`
    + `<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>`
    + `<a:fontScheme name="Molis"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>`
    + `<a:fmtScheme name="Molis"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst>`
    + `<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>`
    + `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>`
    + `<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const level = (size: number, bullet: boolean) => `<a:lvl1pPr marL="${bullet ? 342900 : 0}" indent="${bullet ? -342900 : 0}" algn="l" rtl="0">${bullet ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>' : "<a:buNone/>"}<a:defRPr sz="${size}" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>`;
const placeholders = (withText: boolean) => `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`
  + `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="457200"/><a:ext cx="10515600" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>${withText ? '<p:txBody><a:bodyPr anchor="b"/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>' : ""}</p:sp>`
  + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="838200" y="1828800"/><a:ext cx="10515600" cy="4351338"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>${withText ? '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody>' : ""}</p:sp>`
  + `</p:spTree>`;

function master(): string {
  return XML + `<p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>${placeholders(true)}</p:cSld>`
    + `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`
    + `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>`
    + `<p:txStyles><p:titleStyle>${level(4000, false).replace('<a:lvl1pPr', '<a:lvl1pPr').replace('kern="1200"', 'kern="1200" b="1"')}</p:titleStyle><p:bodyStyle>${level(2400, true)}</p:bodyStyle><p:otherStyle>${level(1800, false)}</p:otherStyle></p:txStyles></p:sldMaster>`;
}

function layout(): string {
  return XML + `<p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" type="obj" preserve="1"><p:cSld name="Title and Content">${placeholders(false)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function notesMaster(): string {
  return XML + `<p:notesMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>`
    + `</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`
    + `<p:notesStyle>${level(1200, false)}</p:notesStyle></p:notesMaster>`;
}

/** The complete .pptx package bytes. Deterministic for the same saved deck. */
export function buildPptx(deck: Deck): Uint8Array {
  const count = deck.slides.length;
  const primary = hex(deck.color_primary, "5E6AD2"), background = hex(deck.color_background, "FCFCFB"), text = hex(deck.color_text, "292A2E");
  const slides = Array.from({ length: count }, (_, index) => index + 1);
  const modified = /^\d{4}-\d{2}-\d{2}T/u.test(deck.updated_at) ? deck.updated_at.replace(/\.\d+Z$/u, "Z") : "2026-01-01T00:00:00Z";
  const files: Record<string, string> = {
    "[Content_Types].xml": XML + `<Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>`
      + `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`
      + `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`
      + `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
      + `<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>`
      + `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`
      + `<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`
      + slides.map(n => `<Override PartName="/ppt/slides/slide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
        + `<Override PartName="/ppt/notesSlides/notesSlide${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`).join("")
      + `<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>`
      + `<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>`
      + `<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>`
      + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`
      + `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    "_rels/.rels": XML + `<Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${NS.officeRel}/officeDocument" Target="ppt/presentation.xml"/>`
      + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`
      + `<Relationship Id="rId3" Type="${NS.officeRel}/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    "docProps/core.xml": XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
      + `<dc:title>${esc(deck.title)}</dc:title><dc:creator>Molis Work</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${modified}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${modified}</dcterms:modified></cp:coreProperties>`,
    "docProps/app.xml": XML + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Molis Work</Application><PresentationFormat>宽屏</PresentationFormat><Slides>${count}</Slides><Notes>${count}</Notes></Properties>`,
    "ppt/presentation.xml": XML + `<p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" saveSubsetFonts="1">`
      + `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst>`
      + `<p:sldIdLst>${slides.map(n => `<p:sldId id="${255 + n}" r:id="rId${10 + n}"/>`).join("")}</p:sldIdLst>`
      + `<p:sldSz cx="${W}" cy="${H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": rels([
      { id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
      { id: "rId2", type: "notesMaster", target: "notesMasters/notesMaster1.xml" },
      { id: "rId3", type: "theme", target: "theme/theme1.xml" },
      { id: "rId4", type: "presProps", target: "presProps.xml" },
      { id: "rId5", type: "viewProps", target: "viewProps.xml" },
      { id: "rId6", type: "tableStyles", target: "tableStyles.xml" },
      ...slides.map(n => ({ id: `rId${10 + n}`, type: "slide", target: `slides/slide${n}.xml` })),
    ]),
    "ppt/presProps.xml": XML + `<p:presentationPr xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"/>`,
    "ppt/viewProps.xml": XML + `<p:viewPr xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`,
    "ppt/tableStyles.xml": XML + `<a:tblStyleLst xmlns:a="${NS.a}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
    "ppt/slideMasters/slideMaster1.xml": master(),
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": rels([{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }, { id: "rId2", type: "theme", target: "../theme/theme1.xml" }]),
    "ppt/slideLayouts/slideLayout1.xml": layout(),
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": rels([{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }]),
    "ppt/notesMasters/notesMaster1.xml": notesMaster(),
    "ppt/notesMasters/_rels/notesMaster1.xml.rels": rels([{ id: "rId1", type: "theme", target: "../theme/theme2.xml" }]),
    "ppt/theme/theme1.xml": theme("Molis", primary, text, background),
    "ppt/theme/theme2.xml": theme("Molis Notes", primary, "000000", "FFFFFF"),
  };
  for (const n of slides) {
    files[`ppt/slides/slide${n}.xml`] = slideXml(deck, n - 1);
    files[`ppt/slides/_rels/slide${n}.xml.rels`] = rels([{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }, { id: "rId2", type: "notesSlide", target: `../notesSlides/notesSlide${n}.xml` }]);
    files[`ppt/notesSlides/notesSlide${n}.xml`] = notesXml(deck, n - 1);
    files[`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`] = rels([{ id: "rId1", type: "notesMaster", target: "../notesMasters/notesMaster1.xml" }, { id: "rId2", type: "slide", target: `../slides/slide${n}.xml` }]);
  }
  // [Content_Types].xml first, as Office expects; a fixed timestamp keeps the bytes stable for the same deck.
  const zippable: Zippable = {};
  for (const [name, body] of Object.entries(files)) zippable[name] = [strToU8(body), { mtime: new Date("2026-01-01T00:00:00Z") }];
  return zipSync(zippable);
}

export function pptxFilename(title: string): string {
  return (clean(title).replace(/[\\/:*?"<>|]/gu, "_").trim() || "演示稿").slice(0, 80) + ".pptx";
}
