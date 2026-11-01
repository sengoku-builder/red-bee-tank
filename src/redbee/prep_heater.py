import cv2, numpy as np, base64, json, sys
im = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
x0, y0, x1, y1 = 339, 0, 801, 1452
spr = im[y0:y1, x0:x1]
S = 0.27; BOTTOM, CX = 680, 1300
h = spr.shape[0]*S; extra = int(max(0, (BOTTOM - h)/S)) + 8
spr = np.vstack([np.repeat(spr[:1], extra, 0), spr]); H0, W0 = spr.shape[:2]
k = 1.6
out = cv2.resize(spr, (int(W0*S*k), int(H0*S*k)), interpolation=cv2.INTER_AREA)
ok, buf = cv2.imencode('.png', out)
rect = [CX - W0*S/2, BOTTOM - H0*S, W0*S, H0*S]
u = lambda x: (x-x0)/W0; v = lambda y: (y-y0+extra)/H0
json.dump({'img': 'data:image/png;base64,' + base64.b64encode(buf).decode(), 'rect': rect,
           'led': [u(586), u(618), v(566), v(598)]}, open('heater.json', 'w'))
print(rect, len(buf)//1024, 'KB')
