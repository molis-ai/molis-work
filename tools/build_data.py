import re,json,sys,collections,os
G,R,OUT=sys.argv[1:4]
sys.path.insert(0,G)
from data import N,L,M1_HARD,M1_PART,FINAL,M1,MAP,MOVED
SHA='b66112d0d7ea26cd7152631b1eb7c91e3846e2f2'
rows=[(n[0],n[1],n[2],list(n[3]),n[4]) for n in N]
ids={r[0] for r in rows}
def parse(s):
    k='h'
    if s[0] in '~^?':k={'~':'c','^':'m','?':'p'}[s[0]];s=s[1:]
    inf=s.endswith('*');s=s.rstrip('*');assert s in ids,s
    return [s,k,1 if inf else 0]
deps={r[0]:[parse(x) for x in r[3]] for r in rows}
deps[M1]=[[x,'h',0] for x in M1_HARD]+[[x,'c' if x=='31' else 'p',0] for x in M1_PART]
deps[FINAL]=[[x,'h',0] for x in ids if x!=FINAL and not x.startswith('SRV') and x not in MOVED]
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
    items=[(clean(a),clean(b_)) for _,a,b_ in sorted(re.findall(r'^\| <a id="[^"]+-item-(\d+)"></a>(.*?) \| (.*) \| .*?\s*\|$',t,re.M),key=lambda r:int(r[0]))]
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
        goal=goal,deps=deps[u],wave=wave(u),nd=len(clo(u,kids)-{FINAL})))
# 传递约简（去 56／89 的汇入，静态底图用）
red=[]
for u in ids:
    if u in(M1,FINAL):continue
    ps=par[u]
    for p in ps:
        if not any(p in clo(q,par) for q in ps if q!=p): red.append([p,u])
bs={k:dict(title=v['title'],intro=v['intro'],ask=v['ask'],url=v['url']) for k,v in batch.items()}
order={k:i for i,k in enumerate(LANES)}
json.dump(dict(nodes=nodes,batches=bs,edges=red,lanes=L),open(OUT,'w'),ensure_ascii=False,separators=(',',':'))
print('nodes',len(nodes),'hard',sum(k=='h' for n in nodes for _,k,_ in n['deps']),'other',sum(k!='h' for n in nodes for _,k,_ in n['deps']),'inferred',sum(i for n in nodes for *_,i in n['deps']),'reduced',len(red),'maxwave',max(n['wave'] for n in nodes),'size',os.path.getsize(OUT))
w=collections.Counter(n['wave'] for n in nodes);print('widest',max(w.values()))
print({n['id']:n['stage'] for n in nodes if n['id'] in('01','05.1','26.1','44.1','57','77','90','SRV-1')})
print('空目标',[n['id'] for n in nodes if not n['goal'] or not n['goal'][0]['d']],'空介绍',[k for k,v in bs.items() if not v['intro']])
