import json,os,re,sys,collections
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from data import FINAL,MAP
DATA,BATCHES,TPL,OUT=sys.argv[1:5]
d=json.load(open(DATA));N={n['id']:n for n in d['nodes']};T=d['batches']
prog=json.load(open(sys.argv[5]))
bid=lambda x:re.match(r'((?:SRV|REL)-\d+|\d+)',x).group(1)
B=sorted({bid(u) for u in N},key=lambda x:(2 if x.startswith('SRV') else 1 if x.startswith('REL') else 0,int(re.sub(r'\D','',x))))
def clean(s):
    s=re.sub(r'<a id="[^"]*"></a>','',s);s=re.sub(r'\[([^\]]+)\]\([^)]*\)',r'\1',s);s=re.sub(r'\[([^\]]+)\]\[[^\]]*\]',r'\1',s);return s.replace('**','').strip()
par=collections.defaultdict(set);soft=collections.defaultdict(dict);prereq=collections.defaultdict(set);ext=collections.defaultdict(list);decs=collections.defaultdict(dict);stage={}
for u,n in N.items():
    b=bid(u);stage[b]=n['stage'];prereq[b].add(json.dumps(sorted((t,k) for t,k,_ in n['deps'])))
    for x in re.split('；',n['ext']):
        x=x.strip()
        if x and not x.startswith('决定') and '#1724' not in x and x not in ext[b]:ext[b].append(x)
    for c in n['decs']:decs[b][c['n']]=c['t']
    if b==FINAL:continue
    for t,k,_ in n['deps']:
        if bid(t)==b:continue
        if k=='h':par[b].add(bid(t))
for u,n in N.items():
    b=bid(u)
    if b==FINAL:continue
    for t,k,_ in n['deps']:
        tb=bid(t)
        if k!='h' and tb!=b and tb not in par[b]:soft[b].setdefault(tb,k)
def anc(u):
    s=set();st=list(par[u])
    while st:
        x=st.pop()
        if x not in s:s.add(x);st+=par[x]
    return s
edges=[[p,u] for u in B for p in sorted(par[u],key=B.index) if not any(p in anc(q) for q in par[u] if q!=p)]
out=[]
for b in B:
    fn=b.lower() if b.startswith(('SRV','REL')) else b
    t=open(f'{BATCHES}/{fn}.md').read()
    items=[{'t':clean(a),'d':clean(x)} for _,a,x in sorted(re.findall(r'^\| <a id="[^"]+-item-(\d+)"></a>(.*?) \| (.*) \| .*?\s*\|$',t,re.M),key=lambda r:int(r[0]))]
    cond=list(ext[b])+[f"决定 {k}（待定）：{v}" for k,v in sorted(decs[b].items(),key=lambda kv:int(kv[0]))]
    out.append(dict(id=b,title=T[b]['title'],stage=stage[b],intro=T[b]['intro'],ask=T[b]['ask'],
      url=f'https://github.com/molis-ai/molis-work/blob/main/specs/post-anticorruption-roadmap/reference/batches/{fn}.md',
      items=items,pre=sorted(par[b],key=B.index),soft=[{'id':k,'k':v} for k,v in soft[b].items()],cond=cond,
      split=len([u for u in N if bid(u)==b])>1))
# 进展：认领板按交付项一行、顺序与批次文件相同，页面里解析；这里只给每个单元对应哪几项、硬依赖和部分依赖
by={x['id']:x for x in out}
for x in out:x['nodes']=[]
for u,n in N.items():
    b=bid(u)
    idx=[i-1 for i in MAP[u]] if u in MAP else [int(u.split('.')[1])-1] if '.' in u else list(range(len(by[b]['items'])))
    by[b]['nodes'].append(dict(id=u,items=idx,hard=[t for t,k,_ in n['deps'] if k=='h'],partial=[t for t,k,_ in n['deps'] if k=='p']))
# 轨道：推导的对照表，见 tracks.json；路线书增删交付项后要补
TR=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'tracks.json')))
for x in out:
    for n,it in enumerate(x['items'],1):
        r=TR.get(f"{x['id']}-{n}")
        if r and r['title']!=it['t']:print('轨道表对不上',x['id'],n,it['t'])
        it['track']=r['main'] if r else '';it['occ']=bool(r and r['occupy']);it['also']=r['also'] if r else [];it['kind']=r['kind'] if r else ''
foot=f'依据路线书 {sys.argv[6]}；部分依赖待核实。'
data=dict(final=FINAL,batches=out,edges=edges,state={},order={b:i for i,b in enumerate(B)},foot=foot,board=prog['body'],boardAt=prog['updated_at'],claimers=json.load(open(sys.argv[7])))
html=open(TPL).read().replace('/*DATA*/null',json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/'))
open(OUT,'w').write(html)
print('批次',len(out),'边',len(edges),'有子项拆分',sum(x['split'] for x in out),'有开工条件',sum(bool(x['cond']) for x in out),'字节',len(html.encode()))
