import cv2, numpy as np, base64, json, sys
im = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED).astype(np.float32)
a = im[..., 3]
ys, xs = np.where(a > 20)
x0, x1, y0, y1 = xs.min(), xs.max()+1, ys.min(), ys.max()+1
spr = im[y0:y1, x0:x1].copy()
# 透明なチューブ部分（スポンジより上）は半透明に
cap = 840 - y0
spr[:cap, :, 3] *= 0.6
S = 0.30            # 水槽画像上の縮尺
BASE_Y, CX = 712, 262  # 置く位置（水槽画像のピクセル）
h_total = spr.shape[0] * S
top_needed = BASE_Y            # 水面より上（画像上端）までチューブを伸ばす
extra = int(max(0, (top_needed - h_total) / S)) + 10
spr = np.vstack([np.repeat(spr[:1], extra, 0), spr])
k = 1.5             # 少し高めの解像度で保持
out = cv2.resize(spr, (int(spr.shape[1]*S*k), int(spr.shape[0]*S*k)), interpolation=cv2.INTER_AREA)
ok, buf = cv2.imencode('.png', np.clip(out, 0, 255).astype(np.uint8))
w, h = spr.shape[1]*S, spr.shape[0]*S
rect = [CX - w/2, BASE_Y - h, w, h]
lift_top = BASE_Y - (y1 - 590) * S   # 吸い上げパイプ上端＝泡の出口
json.dump({'img': 'data:image/png;base64,' + base64.b64encode(buf).decode(), 'rect': rect, 'bubble': [CX, lift_top], 'base': [CX, BASE_Y]}, open('filter.json', 'w'))
print(rect, lift_top, len(buf)//1024, 'KB')
