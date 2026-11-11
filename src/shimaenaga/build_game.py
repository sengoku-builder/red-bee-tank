# シマエナガの森：公開用のページを作る
#   python3 build_game.py            → dist/ に index.html・img/・version.json を作る
#   python3 build_game.py <出力先フォルダ>
# 公開するときは、出力先フォルダの中身を gh-pages ブランチの shimaenaga/ にそのまま置く。
# 写真はページに埋め込まず img/ に別ファイルで置く（名前に中身の印を付けるので、差し替えるとスマホでも新しい写真になる）。
# 写真を差し替えたり鳥の位置を直したりするときは、下の ASSETS を編集する。
# birds: [中心x, 頭の上y, 足元y, 幅の半分, 動き方]
#   動き方 0=首かしげ・ふくらみ・寄りかかり 1=首かしげ・ふくらみ 2=首かしげのみ 3=ヒナのかたまり 4=呼吸とふくらみだけ
# snow: 降ってくるものの量（0〜1）  fx: 降ってくるもの snow=雪 glow=春の光の粒 sun=夏の木もれ日 leaf=秋の落ち葉
import hashlib, json, sys, os, io, time, shutil
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, 'images')
FLOCK6 = [[112,555,718,66,0],[250,598,718,58,0],[375,597,718,50,0],[476,585,716,48,0],[566,598,716,45,0],[678,586,712,52,0]]
ASSETS = {
    # ---- 冬（まっすぐな枝の森）----
    # 鳥のいない森（買った道具ごと）
    'lv0': ('scenes/s0_winter_empty.jpg', 1.0, []),
    'lv1': ('scenes/lv1_winter_feeder.jpg', 1.0, []),
    'lv2': ('scenes/lv2_winter_feeder_water.jpg', 1.0, []),
    'lv3': ('scenes/lv3_winter_nest_material.jpg', 1.0, []),
    'lv4': ('scenes/lv4_winter_icicles.jpg', 1.0, []),
    # 子育ての途中に出る、季節ちがいの鳥のいない森
    's0b': ('scenes/s0b_late_winter_empty.jpg', .5, []),
    's0c': ('scenes/s0c_early_spring_empty.jpg', .3, []),
    # 子育ての場面
    's1': ('scenes/s1_winter_flock.jpg', 1.0, FLOCK6),
    's2': ('scenes/s2_nest_building.jpg', .7, [[452,525,660,62,1],[560,537,672,52,2]]),
    's3': ('scenes/s3_nestlings.jpg', .5, [[330,600,770,85,3],[555,555,742,65,1]]),
    's4': ('scenes/s4_dango.jpg', .3, [[155,660,805,55,0],[243,668,803,42,0],[308,662,795,36,0],[375,652,788,38,0],[452,645,775,44,0],[605,570,715,60,1]]),
    's5': ('scenes/s5_fledgling.jpg', .15, [[320,605,858,70,4],[500,510,762,85,4]]),
    # やってくる場面（道具に合わせて羽数が変わる。道具入りの森に群れの写真から鳥だけ重ねたもの）
    'v0a': ('scenes/v0a_one.jpg', 1.0, [[375,597,718,50,1]]),
    'v0b': ('scenes/v0b_one.jpg', 1.0, [[566,598,716,45,1]]),
    'v1a': ('scenes/v1a_two.jpg', 1.0, [[476,585,716,48,0],[566,598,716,45,0]]),
    'v1b': ('scenes/v1b_three.jpg', 1.0, [[250,598,718,58,0],[375,597,718,50,0],[476,585,716,48,0]]),
    's1_lv2': ('scenes/s1_flock_lv2.jpg', 1.0, FLOCK6),
    's1_lv3': ('scenes/s1_flock_lv3.jpg', 1.0, FLOCK6),
    's1_lv4': ('scenes/s1_flock_lv4.jpg', 1.0, FLOCK6),
    # 観察小屋から見たアップ（冬だけ）
    'c1': ('scenes/c1_closeup_single.jpg', .6, [[385,470,870,180,1]]),
    'c2': ('scenes/c2_closeup_pair.jpg', .6, [[290,518,840,103,1],[482,508,820,103,1]]),
    'c3': ('scenes/c3_closeup_preening.jpg', .3, [[390,418,880,175,4]]),
    # 大当たりの日のごほうび（最初に作ったエナガ団子）
    'dango_old': ('dango_5chicks.jpg', 1.0, [[200,637,783,60,0],[294,640,783,52,0],[391,632,780,56,0],[478,634,782,52,0],[584,640,785,62,0]]),
}
# ---- 春・夏・秋（弓なりの枝の森。最初の団子写真と同じ枝）----
B5 = [[200,637,783,60],[294,640,783,52],[391,632,780,56],[478,634,782,52],[584,640,785,62]]
pick = lambda idx, mode: [B5[i] + [mode] for i in idx]
for se, fx in (('spring', 'glow'), ('summer', 'sun'), ('autumn', 'leaf')):
    p = f'seasons/{se}_'
    for k, f in (('lv0', 'lv0'), ('lv1', 'lv1_feeder'), ('lv2', 'lv2_water'), ('lv3', 'lv3_nest')):
        ASSETS[f'{se}_{k}'] = (p + f + '.jpg', 1.0, [], fx)
    ASSETS[f'{se}_v0a'] = (p + 'v0a_one.jpg', 1.0, pick([2], 1), fx)
    ASSETS[f'{se}_v0b'] = (p + 'v0b_one.jpg', 1.0, pick([3], 1), fx)
    ASSETS[f'{se}_v1a'] = (p + 'v1a_two.jpg', 1.0, pick([2, 3], 0), fx)
    ASSETS[f'{se}_v1b'] = (p + 'v1b_three.jpg', 1.0, pick([1, 2, 3], 0), fx)
    ASSETS[f'{se}_flock_lv2'] = (p + 'flock_lv2.jpg', 1.0, pick(range(5), 0), fx)
    ASSETS[f'{se}_flock_lv3'] = (p + 'flock_lv3.jpg', 1.0, pick(range(5), 0), fx)
    ASSETS[f'{se}_flock5'] = (p + 'flock5.jpg', 1.0, pick(range(5), 0), fx)

# ---- 森の仲間（ひまわりの種のエサ台・群れにまじる）。季節×道具の段階ごと ----
FB = {'arch': {'kogera': [390,535,785,60,4], 'yamagara': [390,585,775,55,4], 'shijukara': [395,585,770,60,4], 'gojukara': [405,595,770,70,4]},
      'winter': {'kogera': [336,576,735,90,4], 'yamagara': [378,571,713,55,4], 'shijukara': [370,569,742,70,4], 'gojukara': [386,594,748,75,4]}}
for se, fx in (('spring', 'glow'), ('summer', 'sun'), ('autumn', 'leaf'), ('winter', 'snow')):
    for n in ('kogera', 'yamagara', 'shijukara', 'gojukara'):
        for lv in ((1, 2, 3, 4) if se == 'winter' else (1, 2, 3)):
            ASSETS[f'f_{se}_{n}_lv{lv}'] = (f'friends/{se}_{n}_lv{lv}.jpg', 1.0, [FB['winter' if se == 'winter' else 'arch'][n]], fx)

out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'dist')
img_dir = os.path.join(out_dir, 'img')
shutil.rmtree(img_dir, ignore_errors=True); os.makedirs(img_dir, exist_ok=True)
out = {}
total = 0
for k, v in ASSETS.items():
    f, snow, birds = v[0], v[1], v[2]
    fx = v[3] if len(v) > 3 else 'snow'
    # 少し圧縮しなおして保存（元の写真はそのまま）
    buf = io.BytesIO(); Image.open(os.path.join(D, f)).convert('RGB').resize((768, 1376)).save(buf, 'JPEG', quality=84, optimize=True, progressive=True)
    data = buf.getvalue(); total += len(data)
    name = f'{k}-{hashlib.md5(data).hexdigest()[:8]}.jpg'
    open(os.path.join(img_dir, name), 'wb').write(data)
    out[k] = {'img': 'img/' + name, 'snow': snow, 'birds': birds, 'fx': fx}
t = open(os.path.join(HERE, 'game_template.html'), encoding='utf-8').read()
BUILD = time.strftime('%Y%m%d%H%M%S')
s = t.replace('__ASSETS__', json.dumps(out, ensure_ascii=False)).replace('__BUILD__', BUILD)
open(os.path.join(out_dir, 'index.html'), 'w', encoding='utf-8').write(s)
# 版の番号（ページはこれを見て、新しい版が出ていたら読み込み直す）
open(os.path.join(out_dir, 'version.json'), 'w').write(json.dumps({'build': BUILD}))
print(out_dir, 'page', len(s) // 1024, 'KB / photos', len(out), 'files', total // 1024, 'KB / build', BUILD)
