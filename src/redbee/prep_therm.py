import cv2, numpy as np, base64, json, sys
im = cv2.imread(sys.argv[1], cv2.IMREAD_UNCHANGED)
x0, y0, x1, y1 = 362, 24, 665, 1513
spr = im[y0:y1, x0:x1]; w0, h0 = x1-x0, y1-y0
S = 0.22; k = 2.0
out = cv2.resize(spr, (int(w0*S*k), int(h0*S*k)), interpolation=cv2.INTER_AREA)
ok, buf = cv2.imencode('.png', out)
CX, TOP = 1432, 150
rect = [CX - w0*S/2, TOP, w0*S, h0*S]
u = lambda x: (x-x0)/w0; v = lambda y: (y-y0)/h0
json.dump({'img': 'data:image/png;base64,' + base64.b64encode(buf).decode(), 'rect': rect,
           'col': [u(475), u(507), v(500), v(1385)], 'y0': v(1163), 'perDeg': 16.725/h0}, open('therm.json', 'w'))
print(rect, len(buf)//1024, 'KB')
