# 仲間の鳥（季節ごとの写真）から鳥だけ切り抜いて、その季節の森（エサ台・巣材）に重ねる
#   python3 friends_cut.py <季節名>   （images フォルダで実行）
import sys,os,numpy as np,cv2
from PIL import Image
from scipy import ndimage as nd
se=sys.argv[1]
L=lambda f:np.asarray(Image.open(f).convert('RGB').resize((768,1376))).astype(float)
G=lambda a:nd.sobel(a.mean(2),0)**2+nd.sobel(a.mean(2),1)**2
R={'kogera':(312,528,465,910),'yamagara':(312,578,462,812),'shijukara':(298,572,518,818),'gojukara':(282,588,538,792)}
# 季節ごとの調整：顔や体が背景と似て抜けやすい鳥は形を丸ごと埋める(HULL)。細いくちばしは BEAK の四角を足す
CFG={'autumn':{'hull':{'yamagara','shijukara','gojukara'},'rect':{},'beak':{}},
     'spring':{'hull':{'yamagara','shijukara','gojukara'},'rect':{'gojukara':(262,580,540,800)},'beak':{'gojukara':(284,592,336,622)}}}
cfg=CFG.get(se,CFG['spring']);R.update(cfg['rect']);HULL=cfg['hull']
ref=G(L('seasons/winter_arch_empty.jpg'))[740:900]
for n,(x0,y0,x1,y1) in R.items():
    raw=f'friends/{se}_{n}_raw.jpg'
    if not os.path.exists(raw):print(se,n,'まだ写真なし');continue
    src=L(raw)
    g2=G(src)[740:900];c=np.corrcoef(ref.ravel(),g2.ravel())[0,1]
    img=cv2.resize(cv2.imread(raw),(768,1376));mask=np.zeros(img.shape[:2],np.uint8)
    cv2.grabCut(img,mask,(x0,y0,x1-x0,y1-y0),np.zeros((1,65)),np.zeros((1,65)),8,cv2.GC_INIT_WITH_RECT)
    m=(mask==1)|(mask==3);lab,k=nd.label(m);sizes=nd.sum(m,lab,range(1,k+1));m=lab==(np.argmax(sizes)+1);m=nd.binary_fill_holes(m)
    if n in cfg['beak']:
        bx0,by0,bx1,by1=cfg['beak'][n];bk=np.zeros_like(m);bk[by0:by1,bx0:bx1]=True
        bk&=(src.mean(2)<np.median(src[by0:by1,bx0:bx1].mean(2))+8)|nd.binary_dilation(m,iterations=3)
        m=m|nd.binary_closing(bk,iterations=2)
    up=m.copy();up[772:]=False
    if n in HULL and up.any():
        hull=cv2.convexHull(np.argwhere(up)[:,::-1].astype(np.int32));H=np.zeros(m.shape,np.uint8);cv2.fillPoly(H,[hull],1);m=m|(H>0)
    m=nd.binary_erosion(m,iterations=1);a=np.clip(nd.gaussian_filter(m.astype(float),1.3),0,1)[...,None]
    for base,tag in ((f'seasons/{se}_lv1_feeder.jpg','lv1'),(f'seasons/{se}_lv2_water.jpg','lv2'),(f'seasons/{se}_lv3_nest.jpg','lv3')):
        b=L(base);Image.fromarray(np.uint8(np.clip(src*a+b*(1-a),0,255))).save(f'friends/{se}_{n}_{tag}.jpg',quality=92)
    print(se,n,'branch match',round(c,3),'bird px',int(m.sum()))
