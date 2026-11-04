import re,json,sys,collections,os
G,R,OUT=sys.argv[1:4]
sys.path.insert(0,G)
from data import N,L,M1_HARD,M1_PART
SHA='898cea848b9a46ce391630a43673b2d761a8f72c'
# 本轮修正（对照正文核出的错漏）
fix={'64':['35.2*','39','~60','~61'],'66.1':['33','39','~60','~61'],
     '69b':['60*','~61'],'88.2':['63.6*','?81.1','?81.2','?83.1'],
     '63.3':['36.2*','37.2*','52.3*','?63.1','?SRV-5'],
     '63.1':['29','32','41','42','45.2*','51','~60','~61']}
for k in ('52.1','52.2','52.3'): pass
rows=[]
for n in N:
    d=list(fix.get(n[0],n[3]))
    if n[0] in('52.1','52.2','52.3'): d.append('?40.2')
    rows.append((n[0],n[1],n[2],d,n[4]))
ids={r[0] for r in rows}
def parse(s):
    k='h'
    if s[0] in '~^?':k={'~':'c','^':'m','?':'p'}[s[0]];s=s[1:]
    inf=s.endswith('*');s=s.rstrip('*');assert s in ids,s
    return [s,k,1 if inf else 0]
deps={r[0]:[parse(x) for x in r[3]] for r in rows}
deps['56']=[[x,'h',0] for x in M1_HARD]+[[x,'c' if x=='31' else 'p',0] for x in M1_PART]
deps['89']=[[x,'h',0] for x in ids if x!='89' and not x.startswith('SRV')]
# 交付项映射
MAP={'54a':[3,4],'54b':[1,2,7],'54c':[5,6],'54d':[8],'65.1':[1,2],'65.3':[3],'69a':[1,4,5,6,7,8,9,10],'69b':[2,3]}
B=os.path.join(R,'batches')
def clean(s):
    s=re.sub(r'<a id="[^"]*"></a>','',s)
    s=re.sub(r'\[([^\]]+)\]\([^)]*\)',r'\1',s)
    s=re.sub(r'\[([^\]]+)\]\[[^\]]*\]',r'\1',s)
    return s.replace('**','').strip()
batch={}
def load(b):
    if b in batch:return batch[b]
    fn=b.lower() if b.startswith('SRV') else b
    t=open(f'{B}/{fn}.md').read()
    head=t.split('\n')[0]
    title=clean(head.split('·',1)[1])
    nav=t.split('\n')[2]
    m=re.search(r'阶段 (\d)',nav); stage=m.group(1) if m else 'S'
    if '～' in nav.split('·')[1] : pass
    intro=re.search(r'^## 给人讲清楚\n(.*?)^## ',t,re.S|re.M).group(1).strip().replace('\n',' ')
    ask=''
    if '需要你做的' in intro:
        i=intro.index('需要你做的');ask=intro[i:];intro=intro[:i].strip()
        ask=re.sub(r'^需要你做的[：:]\s*','',ask)
    items=[(clean(a),clean(b_)) for a,b_ in re.findall(r'^\| <a id="[^"]+"></a>(.*?) \| (.*) \| .*? \|$',t,re.M)]
    batch[b]=dict(title=title,stage=stage,intro=clean(intro),ask=clean(ask),items=items,
        url=f'https://github.com/molis-ai/molis-work/blob/{SHA}/specs/post-anticorruption-roadmap/reference/batches/{fn}.md')
    return batch[b]
def bid(x):return re.match(r'(SRV-\d+|\d+)',x).group(1)
dec={}
for m in re.finditer(r'^\| <a id="decision-(\d+)"></a>\1 \| (.*?) \|',open(f'{R}/decisions.md').read(),re.M):
    dec[m.group(1)]=clean(m.group(2))
# 波次、闭包
sys.setrecursionlimit(5000)
memo={}
def wave(u):
    if u not in memo: memo[u]=1+max([wave(t) for t,k,_ in deps[u] if k=='h'],default=0)
    return memo[u]
kids=collections.defaultdict(set);par=collections.defaultdict(set)
for u in ids:
    for t,k,_ in deps[u]:
        if k=='h':kids[t].add(u);par[u].add(t)
def clo(u,adj):
    s=set();st=[u]
    while st:
        for y in adj[st.pop()]:
            if y not in s:s.add(y);st.append(y)
    return s
LANES=list(L)
nodes=[]
for r in rows:
    u=r[0];b=load(bid(u))
    if u in MAP: its=[b['items'][i-1] for i in MAP[u]]
    elif '.' in u and not u.startswith('SRV-8'): 
        i=int(u.split('.')[1]); its=[b['items'][i-1]]
    elif u.startswith('SRV-8.'): its=[b['items'][int(u.split('.')[1])-1]]
    else: its=b['items']
    goal=[{'t':a,'d':d} for a,d in its]
    if len(goal)==1: goal=[{'t':'','d':goal[0]['d']}]
    dset=sorted(set(re.findall(r'决定 (\d+)',r[4])))
    nodes.append(dict(id=u,b=bid(u),name=r[1],lane=r[2],stage=b['stage'],ext=r[4],decs=[{'n':n,'t':dec.get(n,'')} for n in dset],
        goal=goal,deps=deps[u],wave=wave(u),nd=len(clo(u,kids)-{'89'})))
# 传递约简（去 56／89 的汇入，静态底图用）
red=[]
for u in ids:
    if u in('56','89'):continue
    ps=par[u]
    for p in ps:
        if not any(p in clo(q,par) for q in ps if q!=p): red.append([p,u])
bs={k:dict(title=v['title'],intro=v['intro'],ask=v['ask'],url=v['url']) for k,v in batch.items()}
order={k:i for i,k in enumerate(LANES)}
json.dump(dict(nodes=nodes,batches=bs,edges=red,lanes=L),open(OUT,'w'),ensure_ascii=False,separators=(',',':'))
print('nodes',len(nodes),'hard',sum(k=='h' for n in nodes for _,k,_ in n['deps']),'other',sum(k!='h' for n in nodes for _,k,_ in n['deps']),'inferred',sum(i for n in nodes for *_,i in n['deps']),'reduced',len(red),'maxwave',max(n['wave'] for n in nodes),'size',os.path.getsize(OUT))
w=collections.Counter(n['wave'] for n in nodes);print('widest',max(w.values()))
print(json.dumps(next(n for n in nodes if n['id']=='88.2'),ensure_ascii=False)[:600]);print(bs['44']['ask'][:120]);print(dec.get('23','')[:60]);print({n['id']:n['stage'] for n in nodes if n['id'] in('01','05.1','26.1','57','76','89','SRV-1')})
print('空目标',[n['id'] for n in nodes if not n['goal'] or not n['goal'][0]['d']],'空介绍',[k for k,v in bs.items() if not v['intro']])
