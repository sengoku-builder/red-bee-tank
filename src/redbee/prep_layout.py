import cv2, numpy as np, base64, json
P='plants/'
def load(f): return cv2.imread(P+f,cv2.IMREAD_UNCHANGED)
def trim(s):
    s=s.copy(); m=(s[...,3]>40).astype(np.uint8)
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((9,9),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(m); big=np.argmax(st[1:,4])+1
    keep=cv2.dilate((lab==big).astype(np.uint8),np.ones((15,15),np.uint8))
    s[...,3]=(s[...,3]*keep).astype(np.uint8)
    ys,xs=np.where(s[...,3]>20); return s[ys.min():ys.max()+1, xs.min():xs.max()+1]
def solidify(s):
    s=trim(s); a=s[...,3]; m=(a>30).astype(np.uint8)*255
    m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))
    ff=m.copy();h,w=m.shape;mk=np.zeros((h+2,w+2),np.uint8);ff=cv2.copyMakeBorder(m,2,2,2,2,cv2.BORDER_CONSTANT,value=0);mk=np.zeros((h+6,w+6),np.uint8);cv2.floodFill(ff,mk,(0,0),255);m=m|cv2.bitwise_not(ff)[2:-2,2:-2]
    m=cv2.erode(m,np.ones((3,3),np.uint8)); s=s.copy()
    al=cv2.GaussianBlur(m.astype(np.float32),(0,0),1.2)
    rgb=s[...,:3].astype(np.float32); a0=a.astype(np.float32)/255
    # 透けていた暗部は元の色（黒背景に乗った色）をそのまま使う
    rgb=np.where((a0<.95)[...,None], rgb*np.maximum(a0,.25)[...,None], rgb)
    s[...,:3]=np.clip(rgb,0,255); s[...,3]=al.astype(np.uint8); return s
def solid_bottom(s,frac):
    s=trim(s); h=s.shape[0]; y0=int(h*(1-frac))
    full=solidify(s.copy()); s=s.copy()
    s[y0:,:,3]=np.maximum(s[y0:,:,3],full[y0:,:,3]); s[y0:,:,:3]=full[y0:,:,:3]
    return s
items={}
def add(key,s,maxd=420):
    s=trim(s); sc=min(1,maxd/max(s.shape[:2])); s=cv2.resize(s,None,fx=sc,fy=sc,interpolation=cv2.INTER_AREA)
    ok,buf=cv2.imencode('.webp',s,[cv2.IMWRITE_WEBP_QUALITY,88])
    items[key]={'img':'data:image/webp;base64,'+base64.b64encode(buf).decode(),'w':s.shape[1],'h':s.shape[0]}
add('mosstree',load('p0_01.png')); add('pearlball',load('p0_02.png')); add('pearlwave',load('p0_03.png'))
add('mossdiag',load('p0_04.png')); add('mossv',load('p0_05.png')); add('mosshole',load('p0_06.png')); add('mossdish',load('p0_07.png'))
m=load('p1_08.png'); col=m[...,3].astype(np.float32).sum(0); w=m.shape[1]; cut=int(w*.35+np.argmin(col[int(w*.35):int(w*.65)]))
add('fernlavas',solid_bottom(m[:,:cut],.3)); add('fernwood',solid_bottom(m[:,cut:],.35))
add('fernred',solid_bottom(load('p1_09.png'),.35)); add('fernslate',solid_bottom(load('p1_10.png'),.3)); add('fernlava',solid_bottom(load('p3_12.png'),.25))
add('pearlmat',load('p4_13.png')); add('mosswood',load('p5_14.png'))
for i,k in enumerate(['rot_straight','rot_leggy','rot_droop','rot_bushy']): add(k,load(f'r0_0{i}.png'),460)
add('wood_branch',load('w0_00.png')); add('wood_log',load('w0_01.png')); add('wood_twist',solidify(load('w0_02.png')))
for f,k in [('s0_00.png','st_lava'),('s0_01.png','st_seiryu'),('s0_02.png','st_fossil'),('s0_03.png','st_black')]: add(k,solidify(load(f)))
json.dump(items,open('app/layout.json','w'))
print(len(items), sum(len(v['img']) for v in items.values())//1024,'KB')
