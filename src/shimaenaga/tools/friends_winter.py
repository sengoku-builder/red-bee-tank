# 冬の仲間：鳥のいない冬の森との差から鳥だけ取り出し、冬の道具入りの森に重ねる（images フォルダで実行）
import numpy as np
from PIL import Image
from scipy import ndimage as nd
L=lambda f:np.asarray(Image.open(f).convert('RGB').resize((768,1376))).astype(float)
s0=L('scenes/s0_winter_empty.jpg')
for n in ['kogera','yamagara','shijukara','gojukara']:
    src=L(f'friends/winter_{n}_raw.jpg');d=np.abs(src-s0).max(2)
    m=(d>26);m[:520]=False;m[790:]=False   # 鳥がいる下の枝のあたりだけ
    m=nd.binary_opening(m,iterations=2);lab,k=nd.label(m);sizes=nd.sum(m,lab,range(1,k+1));m=lab==(np.argmax(sizes)+1)
    m=nd.binary_closing(m,iterations=4);m=nd.binary_fill_holes(m)
    # 足元の、雪がはがれたオレンジ色の枝は使わない
    r,g,b2=src[...,0],src[...,1],src[...,2];bark=(r-b2>45)&(np.arange(768)[None,:]>0);bark[:705]=False
    m&=~nd.binary_dilation(bark,iterations=2)
    lab,k=nd.label(m);sizes=nd.sum(m,lab,range(1,k+1));m=lab==(np.argmax(sizes)+1)
    m=nd.binary_erosion(m,iterations=1)
    # 枝の上に出ている部分と足だけ（雪のはがれた枝は使わない）
    ys,xs=np.where(m);foot=ys.max()
    a=np.clip(nd.gaussian_filter(m.astype(float),1.3),0,1)[...,None]
    for base,tag in (('scenes/lv1_winter_feeder.jpg','lv1'),('scenes/lv3_winter_nest_material.jpg','lv3'),('scenes/lv4_winter_icicles.jpg','lv4')):
        b=L(base);Image.fromarray(np.uint8(np.clip(src*a+b*(1-a),0,255))).save(f'friends/winter_{n}_{tag}.jpg',quality=92)
    print(n,'bbox',xs.min(),xs.max(),ys.min(),foot,'px',int(m.sum()))
