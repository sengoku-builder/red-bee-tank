import cv2, numpy as np, base64, json, sys
im = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
x0, x1, y0, y1 = 339, 801, 225, 1452
spr = cv2.rotate(im[y0:y1, x0:x1], cv2.ROTATE_90_CLOCKWISE)   # コード側が右を向く
H, W = spr.shape[:2]                                         # H=462, W=1227
L = 300.0                                                    # 水槽画像上の長さ（約14cm）
sc = L / W; w, h = L, H * sc
right, cy = 1445.0, 640.0
rx0 = right - w; ry0 = cy - h / 2
k = 1.6
out = cv2.resize(spr, (int(W * sc * k), int(H * sc * k)), interpolation=cv2.INTER_AREA)
ok, buf = cv2.imencode('.png', out)
def uv(x, y):  # 元画像の座標 → 回転後スプライトのuv
    cx, cyy = x - x0, y - y0
    return ((y1 - y0 - 1 - cyy) / W, cx / H)
lu, lv = uv(602, 582)
cu, cv_ = uv(690, 225)
exit_pt = [right - 2, ry0 + cv_ * h]
corner = 1517.0
cord = [exit_pt, [1495, exit_pt[1] + 7], [corner, exit_pt[1] - 14], [corner, -5]]
json.dump({'img': 'data:image/png;base64,' + base64.b64encode(buf).decode(), 'rect': [rx0, ry0, w, h],
           'led': [lu - .014, lu + .014, lv - .04, lv + .04], 'cord': cord}, open('heater.json', 'w'))
print([round(v, 1) for v in [rx0, ry0, w, h]], 'led', round(lu, 3), round(lv, 3), 'cord', [[round(a), round(b)] for a, b in cord])
