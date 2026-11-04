import json,os,re,sys,collections
DATA,BATCHES,TPL,OUT=sys.argv[1:5]
d=json.load(open(DATA));N={n['id']:n for n in d['nodes']};T=d['batches']
prog=json.load(open(sys.argv[5]))
bid=lambda x:re.match(r'(SRV-\d+|\d+)',x).group(1)
B=sorted({bid(u) for u in N},key=lambda x:(x.startswith('SRV'),int(re.sub(r'\D','',x))))
def clean(s):
    s=re.sub(r'<a id="[^"]*"></a>','',s);s=re.sub(r'\[([^\]]+)\]\([^)]*\)',r'\1',s);s=re.sub(r'\[([^\]]+)\]\[[^\]]*\]',r'\1',s);return s.replace('**','').strip()
par=collections.defaultdict(set);soft=collections.defaultdict(dict);prereq=collections.defaultdict(set);ext=collections.defaultdict(list);decs=collections.defaultdict(dict);stage={}
for u,n in N.items():
    b=bid(u);stage[b]=n['stage'];prereq[b].add(json.dumps(sorted((t,k) for t,k,_ in n['deps'])))
    for x in re.split('；',n['ext']):
        x=x.strip()
        if x and not x.startswith('决定') and '#1724' not in x and x not in ext[b]:ext[b].append(x)
    for c in n['decs']:decs[b][c['n']]=c['t']
    if b=='89':continue
    for t,k,_ in n['deps']:
        if bid(t)==b:continue
        if k=='h':par[b].add(bid(t))
for u,n in N.items():
    b=bid(u)
    if b=='89':continue
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
    fn=b.lower() if b.startswith('SRV') else b
    t=open(f'{BATCHES}/{fn}.md').read()
    items=[{'t':clean(a),'d':clean(x)} for a,x in re.findall(r'^\| <a id="[^"]+"></a>(.*?) \| (.*) \| .*? \|$',t,re.M)]
    cond=list(ext[b])+[f"决定 {k}（待定）：{v}" for k,v in sorted(decs[b].items(),key=lambda kv:int(kv[0]))]
    out.append(dict(id=b,title=T[b]['title'],stage=stage[b],intro=T[b]['intro'],ask=T[b]['ask'],
      url=f'https://github.com/molis-ai/molis-work/blob/main/specs/post-anticorruption-roadmap/reference/batches/{fn}.md',
      items=items,pre=sorted(par[b],key=B.index),soft=[{'id':k,'k':v} for k,v in soft[b].items()],cond=cond,
      split=len([u for u in N if bid(u)==b])>1))
# 进展：认领板按交付项一行、顺序与批次文件相同，页面里解析；这里只给每个单元对应哪几项和硬依赖
MAP={'54a':[3,4],'54b':[1,2,7],'54c':[5,6],'54d':[8],'65.1':[1,2],'65.3':[3],'69a':[1,4,5,6,7,8,9,10],'69b':[2,3]}
by={x['id']:x for x in out}
for x in out:x['nodes']=[]
for u,n in N.items():
    b=bid(u)
    idx=[i-1 for i in MAP[u]] if u in MAP else [int(u.split('.')[1])-1] if '.' in u else list(range(len(by[b]['items'])))
    by[b]['nodes'].append(dict(id=u,items=idx,hard=[t for t,k,_ in n['deps'] if k=='h']))
# 轨道：推导的对照表，见 tracks.json；路线书增删交付项后要补
TR=json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'tracks.json')))
for x in out:
    for n,it in enumerate(x['items'],1):
        r=TR.get(f"{x['id']}-{n}")
        if r and r['title']!=it['t']:print('轨道表对不上',x['id'],n,it['t'])
        it['track']=r['main'] if r else '';it['occ']=bool(r and r['occupy']);it['also']=r['also'] if r else []
foot=f'依据 main 上的路线书（提交 {sys.argv[6]}）。依赖按子项汇总到批次，只算必须先做完的；有些依赖由批次号判读到子项，还待核实。轨道对照是推导后由用户确认的，还没写进路线书。'
data=dict(batches=out,edges=edges,state={},order={b:i for i,b in enumerate(B)},foot=foot,board=prog['body'],boardAt=prog['updated_at'],claimers=json.load(open(sys.argv[7])))
html=open(TPL).read().replace('/*DATA*/null',json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('</','<\\/'))
open(OUT,'w').write(html)
print('批次',len(out),'边',len(edges),'有子项拆分',sum(x['split'] for x in out),'有开工条件',sum(bool(x['cond']) for x in out),'字节',len(html.encode()))
