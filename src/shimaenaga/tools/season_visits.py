# 季節の森に、同じ季節の5羽の写真から鳥だけ重ねて来訪写真を作る
#   python3 season_visits.py <季節名>   （images フォルダで実行）
import sys,numpy as np
from PIL import Image
from scipy import ndimage as nd
se=sys.argv[1]
L=lambda f:np.asarray(Image.open(f).convert('RGB').resize((768,1376))).astype(float)
w0=L('seasons/winter_arch_empty.jpg');wb=L('dango_5chicks.jpg');src=L(f'seasons/{se}_flock5.jpg')
d=np.abs(wb-w0).max(2);H,W=d.shape;yy,xx=np.mgrid[0:H,0:W]
B=[[200,637,783,60],[294,640,783,52],[391,632,780,56],[478,634,782,52],[584,640,785,62]]
EDGE=[0,247,342,434,531,768];TAIL=[None,None,None,None,(625,665,740,790)]
soft=nd.gaussian_filter(src,(1.2,1.2,0))
def one(i):
    cx,top,foot,hw=B[i];cy=(top+foot)/2;ry=(foot-top)/2+4
    body=(((xx-cx)/(hw*1.08))**2+((yy-cy)/ry)**2<=1)&(xx>=EDGE[i])&(xx<EDGE[i+1])
    feet=(np.abs(xx-cx)<hw*.75)&(yy>foot-12)&(yy<foot+22)
    m=(d>20)&(body|feet)
    if TAIL[i]:x0,x1,y0,y1=TAIL[i];m|=(d>25)&(xx>=x0)&(xx<x1)&(yy>=y0)&(yy<y1)
    m=nd.binary_closing(m,iterations=2);m=nd.binary_opening(m,iterations=2)
    inner=(((xx-cx)/(hw*.86))**2+((yy-cy)/((foot-top)/2*.86))**2<=1)&(xx>=EDGE[i])&(xx<EDGE[i+1])
    m=nd.binary_fill_holes(m|inner)
    lab,n=nd.label(m);sizes=nd.sum(m,lab,range(1,n+1));return np.isin(lab,[k+1 for k,s in enumerate(sizes) if s>200])
def make(sel,base,out):
    m=np.zeros_like(d,bool)
    for i in sel:m|=one(i)
    m=nd.binary_erosion(m,iterations=1);a=np.clip(nd.gaussian_filter(m.astype(float),1.4),0,1)[...,None]
    k=np.clip((a-.5)*2,0,1);s=src*k+soft*(1-k);b=L(base)
    Image.fromarray(np.uint8(np.clip(s*a+b*(1-a),0,255))).save(out,quality=92)
S=f'seasons/{se}_'
make([2],S+'lv0.jpg',S+'v0a_one.jpg');make([3],S+'lv0.jpg',S+'v0b_one.jpg')
make([2,3],S+'lv1_feeder.jpg',S+'v1a_two.jpg');make([1,2,3],S+'lv1_feeder.jpg',S+'v1b_three.jpg')
make([0,1,2,3,4],S+'lv2_water.jpg',S+'flock_lv2.jpg');make([0,1,2,3,4],S+'lv3_nest.jpg',S+'flock_lv3.jpg')
print('ok',se)
