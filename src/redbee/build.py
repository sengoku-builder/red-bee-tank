import cv2, base64, sys
im = cv2.imread(sys.argv[1]); h, w = im.shape[:2]
ok, buf = cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 90])
s = open('template.html', encoding='utf-8').read()
s = s.replace('__IMG__', 'data:image/jpeg;base64,' + base64.b64encode(buf).decode()).replace('__IW__', str(w)).replace('__IH__', str(h)).replace('__FILTER__', open('filter.json').read()).replace('__THERM__', open('therm.json').read()).replace('__HEATER__', open('heater.json').read()).replace('__SHRIMPS__', open('shrimps.json').read()).replace('__LAYOUT__', open('layout.json').read())
open(sys.argv[2], 'w', encoding='utf-8').write(s); print(w, h, len(s)//1024, 'KB')
