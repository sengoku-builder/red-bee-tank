"""河川敷の少年野球: 公開用ファイルを dist/ に作る。
python3 src/kawajiki/build.py → dist/index.html・version.json・sokuho.html を gh-pages ブランチの kawajiki/ に置く。"""
import os, json, datetime
here = os.path.dirname(os.path.abspath(__file__))
build = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime('%Y%m%d%H%M%S')
src = open(os.path.join(here, 'index.html'), encoding='utf-8').read()
html = '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' \
       + src.replace('__BUILD__', build) \
       + '\n</html>\n'
out = os.path.join(here, 'dist'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(html)
json.dump({'build': build}, open(os.path.join(out, 'version.json'), 'w'))
# 一球速報（記録して野球場で再生する）ページ
open(os.path.join(out, 'sokuho.html'), 'w', encoding='utf-8').write(open(os.path.join(here, 'sokuho.html'), encoding='utf-8').read())
print('build', build)
