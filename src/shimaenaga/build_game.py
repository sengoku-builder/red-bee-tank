# シマエナガの森：写真を埋め込んで1つのHTMLにする
#   python3 build_game.py shimaenaga_forest.html
# 写真を差し替えたり鳥の位置を直したりするときは、下の ASSETS を編集する。
# birds: [中心x, 頭の上y, 足元y, 幅の半分, 動き方]
#   動き方 0=首かしげ・ふくらみ・寄りかかり 1=首かしげ・ふくらみ 2=首かしげのみ 3=ヒナのかたまり 4=呼吸とふくらみだけ
import base64, json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(HERE, 'images')
ASSETS = {
    # 鳥のいない森（買った道具ごと）
    'lv0': ('scenes/s0_winter_empty.jpg', 1.0, []),
    'lv1': ('scenes/lv1_winter_feeder.jpg', 1.0, []),
    'lv2': ('scenes/lv2_winter_feeder_water.jpg', 1.0, []),
    'lv3': ('scenes/lv3_winter_nest_material.jpg', 1.0, []),
    'lv4': ('scenes/lv4_winter_icicles.jpg', 1.0, []),
    # 季節ちがいの鳥のいない森
    's0b': ('scenes/s0b_late_winter_empty.jpg', .5, []),
    's0c': ('scenes/s0c_early_spring_empty.jpg', .3, []),
    # 鳥のいる場面
    's1': ('scenes/s1_winter_flock.jpg', 1.0, [[112,555,718,66,0],[250,598,718,58,0],[375,597,718,50,0],[476,585,716,48,0],[566,598,716,45,0],[678,586,712,52,0]]),
    's2': ('scenes/s2_nest_building.jpg', .7, [[452,525,660,62,1],[560,537,672,52,2]]),
    's3': ('scenes/s3_nestlings.jpg', .5, [[330,600,770,85,3],[555,555,742,65,1]]),
    's4': ('scenes/s4_dango.jpg', .3, [[155,660,805,55,0],[243,668,803,42,0],[308,662,795,36,0],[375,652,788,38,0],[452,645,775,44,0],[605,570,715,60,1]]),
    's5': ('scenes/s5_fledgling.jpg', .15, [[320,605,858,70,4],[500,510,762,85,4]]),
    # 大当たりの日のごほうび（最初に作ったエナガ団子）
    # 観察小屋から見たアップ
    'c1': ('scenes/c1_closeup_single.jpg', .6, [[385,470,870,180,1]]),
    'c2': ('scenes/c2_closeup_pair.jpg', .6, [[290,518,840,103,1],[482,508,820,103,1]]),
    'c3': ('scenes/c3_closeup_preening.jpg', .3, [[390,418,880,175,4]]),
    'dango_old': ('dango_5chicks.jpg', 1.0, [[200,637,783,60,0],[294,640,783,52,0],[391,632,780,56,0],[478,634,782,52,0],[584,640,785,62,0]]),
}
out = {}
for k, (f, snow, birds) in ASSETS.items():
    b = base64.b64encode(open(os.path.join(D, f), 'rb').read()).decode()
    out[k] = {'img': 'data:image/jpeg;base64,' + b, 'snow': snow, 'birds': birds}
t = open(os.path.join(HERE, 'game_template.html'), encoding='utf-8').read()
s = t.replace('__ASSETS__', json.dumps(out, ensure_ascii=False))
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'shimaenaga_forest.html')
open(dst, 'w', encoding='utf-8').write(s)
print(dst, len(s) // 1024, 'KB')
