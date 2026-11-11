"""河川敷の少年野球: 公開用ファイルを dist/ に作る。
python3 src/kawajiki/build.py → dist/index.html・version.json・sokuho.html・taikai.html を gh-pages ブランチの kawajiki/ に置く。"""
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
# 大会（トーナメント表）ページ
open(os.path.join(out, 'taikai.html'), 'w', encoding='utf-8').write(open(os.path.join(here, 'taikai.html'), encoding='utf-8').read())
print('build', build)
# 新しい試合エンジンの確認ページ（engine.js と engine-tests.js を中に入れた1ファイル）
def engine_page():
    p = open(os.path.join(here, 'engine-test.html'), encoding='utf-8').read()
    p = p.replace('/*ENGINE*/', open(os.path.join(here, 'engine.js'), encoding='utf-8').read())
    p = p.replace('/*TESTS*/', open(os.path.join(here, 'engine-tests.js'), encoding='utf-8').read())
    return p
ep = engine_page()
open(os.path.join(out, 'engine-test.html'), 'w', encoding='utf-8').write(
    '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + ep + '\n</html>\n')
open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(here))), 'kawajiki-engine', 'engine-test.html'), 'w', encoding='utf-8').write(ep)
