import cv2, numpy as np, base64, json, sys
im = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
a = im[..., 3].copy()
k = np.ones((9, 9), np.uint8)
op = cv2.morphologyEx((a > 40).astype(np.uint8)*255, cv2.MORPH_OPEN, k)
n, lab, st, _ = cv2.connectedComponentsWithStats(op); big = np.argmax(st[1:, 4]) + 1
body = cv2.dilate((lab == big).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
a[xx < 255] = 0                                   # 前に伸びた触角
a[(xx < 335) & (yy < 480) & (~body)] = 0          # 頭の付け根の触角
im[..., 3] = a
x0, y0, x1, y1 = 240, 340, 1525, 915
spr = im[y0:y1, x0:x1]
W = 360; H = int(spr.shape[0] * W / spr.shape[1])
out = cv2.resize(spr, (W, H), interpolation=cv2.INTER_AREA)
ok, buf = cv2.imencode('.png', out)
L = x1 - x0
json.dump({'img': 'data:image/png;base64,' + base64.b64encode(buf).decode(),
           'w': W, 'h': H, 'aspect': (y1-y0)/L,
           'root': [(292-x0)/L, (412-y0)/(y1-y0)],    # 触角の付け根
           'legs': (585-y0)/(y1-y0),                  # これより下が脚
           'foot': (880-y0)/(y1-y0)}, open('shrimp_f.json', 'w'))
cv2.imwrite('../v/shrimp_cut.png', out)
print(W, H, len(buf)//1024, 'KB')
