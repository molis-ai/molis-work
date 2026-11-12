"""Local preview only. Download inputs and OFL texts into FOLIO_FONT_DIR first.
Normalize OpenType coverage ordering without changing glyph order; subset, then CFF cubic -> quadratic TrueType, at four actual weights.
"""
import json, os
from pathlib import Path
from fontTools.ttLib import TTFont, newTable
from fontTools import subset
from fontTools.ttLib.reorderGlyphs import reorderGlyphs
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

root = Path(os.environ.get('FOLIO_FONT_DIR', '/private/tmp/folio16-fonts'))
chars = set()
for a in range(0xA1, 0xF8):
    for b in range(0xA1, 0xFF):
        try: chars.update(bytes([a,b]).decode('gb2312'))
        except UnicodeDecodeError: pass
for lo,hi in [(0x2e80,0x2eff),(0x3000,0x303f),(0x31c0,0x31ef),(0xfe10,0xfe1f),(0xfe30,0xfe4f),(0xff00,0xffef)]:
    chars.update(chr(n) for n in range(lo, hi+1))
source=TTFont(root/'ResourceHanRoundedCN-VF.otf')
reorderGlyphs(source,source.getGlyphOrder())
opts=subset.Options(); opts.name_IDs=['*']; opts.name_legacy=True; opts.name_languages=['*']
sub=subset.Subsetter(options=opts); sub.populate(unicodes={ord(c) for c in chars}); sub.subset(source)
source.save(root/'preview-normalized-subset.otf')
print('Normalized and subsetted original tables',flush=True)
result=[]
for weight in [400,500,600,700]:
    variable=TTFont(root/'preview-normalized-subset.otf')
    axes={axis.axisTag:axis.defaultValue for axis in variable['fvar'].axes}; axes['wght']=weight
    font=instantiateVariableFont(variable, axes, inplace=True)
    glyphset=font.getGlyphSet(); glyphs={}
    for name in font.getGlyphOrder():
        pen=TTGlyphPen(None); glyphset[name].draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True)); glyphs[name]=pen.glyph()
    glyf=newTable('glyf'); glyf.glyphs=glyphs; glyf.glyphOrder=font.getGlyphOrder(); font['glyf']=glyf
    font['loca']=newTable('loca'); font['maxp']=newTable('maxp'); font['maxp'].tableVersion=0x10000
    for attr in ['maxZones','maxTwilightPoints','maxStorage','maxFunctionDefs','maxInstructionDefs','maxStackElements','maxSizeOfInstructions']:
        setattr(font['maxp'], attr, 2 if attr=='maxZones' else 0)
    for table in ['CFF ', 'CFF2', 'VORG']:
        if table in font: del font[table]
    font.sfntVersion='\x00\x01\x00\x00'; font['head'].glyphDataFormat=0; font['post'].formatType=2.0
    font['post'].extraNames=[]; font['post'].mapping={}; font['post'].glyphOrder=font.getGlyphOrder()
    style={400:'Regular',500:'Medium',600:'SemiBold',700:'Bold'}[weight]
    names={1:'Molis Preview Rounded',2:style,3:f'Molis Preview Rounded {weight} 1.910',4:f'Molis Preview Rounded {style}',6:f'MolisPreviewRounded-{style}',16:'Molis Preview Rounded',17:style,18:f'Molis Preview Rounded {style}',20:f'MolisPreviewRounded-{style}',21:'Molis Preview Rounded',22:style,25:'MolisPreviewRounded'}
    for record in list(font['name'].names):
        if record.nameID in names: font['name'].setName(names[record.nameID],record.nameID,record.platformID,record.platEncID,record.langID)
    font['OS/2'].usWeightClass=weight
    font['OS/2'].fsSelection=(font['OS/2'].fsSelection & ~0x61) | (0x20 if weight==700 else 0x40 if weight==400 else 0)
    font['head'].macStyle=(font['head'].macStyle & ~3) | (1 if weight==700 else 0)
    font.flavor='woff2'; path=root/f'rounded-{weight}.woff2'; font.save(path)
    result.append({'weight':weight,'bytes':path.stat().st_size,'glyphs':len(font.getGlyphOrder()),'outline':'TrueType','internalFamily':'Molis Preview Rounded'})
    print(result[-1],flush=True)
(root/'font-report.json').write_text(json.dumps(result,indent=2))

for weight in [400,500,600,700]:
    latin=instantiateVariableFont(TTFont(root/'package/files/nunito-latin-wght-normal.woff2'),{'wght':weight},inplace=True)
    latin.flavor='woff2'; latin.save(root/f'latin-{weight}.woff2')
