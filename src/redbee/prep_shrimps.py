import cv2, numpy as np, base64, json
A='/mnt/user-data/attachments/755052c9-82c5-54d1-8cdb-c74d4110ab43/'
SRC=[('F',A+'55e46b4e-image.png'),('F',A+'fdce6d76-image.jpg'),('M',A+'a2be5327-image.jpg'),('B',A+'04124bf0-image.jpg'),('B',A+'240faa7c-image.jpg')]
out=[]; prev=[]
for kind,path in SRC:
    im=cv2.imread(path,cv2.IMREAD_UNCHANGED).astype(np.float32)
    if im.shape[2]==4:
        rgb=im[...,:3]; a=im[...,3]/255.
    else:
        rgb=im; mx=rgb.max(2)
        a=np.clip((mx-14)/75,0,1)
        # 胴体の内側は不透明に（暗い赤が透けないように）
        c0=(a>.4).astype(np.uint8)*255
        c0=cv2.morphologyEx(c0,cv2.MORPH_OPEN,np.ones((11,11),np.uint8))
        n0,l0,s0,_=cv2.connectedComponentsWithStats(c0); b0=(l0==np.argmax(s0[1:,4])+1).astype(np.uint8)*255
        b0=cv2.morphologyEx(b0,cv2.MORPH_CLOSE,np.ones((25,25),np.uint8))
        ff=b0.copy();hh,ww=b0.shape;mk=np.zeros((hh+2,ww+2),np.uint8);cv2.floodFill(ff,mk,(0,0),255);b0=b0|cv2.bitwise_not(ff)
        solid=cv2.GaussianBlur(cv2.erode(b0,np.ones((9,9),np.uint8)).astype(np.float32)/255,(0,0),3)
        solid=solid*cv2.GaussianBlur((mx>32).astype(np.float32),(0,0),1.5)
        a=np.maximum(a,solid)
        rgb=np.clip(rgb/np.maximum(a,1e-3)[...,None],0,255)
    # 胴体マスク（細い触角は消える）→少し太らせて脚先を回復
    core=(a>.45).astype(np.uint8)*255
    op=cv2.morphologyEx(core,cv2.MORPH_OPEN,np.ones((11,11),np.uint8))
    n,lab,st,_=cv2.connectedComponentsWithStats(op); big=np.argmax(st[1:,4])+1
    body=(lab==big).astype(np.uint8)
    keep=cv2.dilate(body,np.ones((25,25),np.uint8))
    keep=cv2.GaussianBlur(keep.astype(np.float32),(0,0),2)
    a=a*np.clip(keep*1.5,0,1)
    ys,xs=np.where(body>0); bx0,bx1,by0=xs.min(),xs.max(),ys.min()
    ys2,xs2=np.where(a>.25); fy=ys2.max()
    # 頭の先（最も左の胴体）→触角の付け根
    col=body[:,bx0:bx0+12].sum(1); hy=int(np.average(np.arange(len(col)),weights=col+1e-6))
    x0,x1,y0,y1=bx0-4,bx1+4,by0-6,fy+4
    spr=np.dstack([rgb,a*255])[y0:y1,x0:x1]
    W=360; H=int(spr.shape[0]*W/spr.shape[1])
    s=cv2.resize(spr,(W,H),interpolation=cv2.INTER_AREA)
    ok,buf=cv2.imencode('.png',np.clip(s,0,255).astype(np.uint8))
    L=x1-x0
    out.append({'kind':kind,'img':'data:image/png;base64,'+base64.b64encode(buf).decode(),
      'root':[(bx0+0.06*(bx1-bx0)-x0)/L,(hy-y0)/(y1-y0)],'legs':0.47,'foot':1.0,'aspect':(y1-y0)/L})
    bg=np.zeros((H,W,3),np.float32); bg[:]=(80,110,95); al=s[...,3:4]/255.
    prev.append((s[...,:3]*al+bg*(1-al)).astype(np.uint8))
    print(kind,W,H,len(buf)//1024,'KB')
json.dump(out,open('shrimps.json','w'))
h=max(p.shape[0] for p in prev)
cv2.imwrite('../v/shrimps_preview.png',np.vstack([cv2.copyMakeBorder(p,0,h-p.shape[0]+6,0,0,cv2.BORDER_CONSTANT,value=(80,110,95)) for p in prev]))
