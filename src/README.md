# 作業用ファイル
- redbee/ : レッドビー水槽の元ファイル。`python3 build.py tank_background.png red_bee_tank.html` で公開用HTMLを作り、gh-pagesブランチの index.html に置く。
- shimaenaga/ : シマエナガの森の試作（動く写真＝cinemagraph方式を採用予定、切り抜き方式は不採用）。
- shimaenaga/ : シマエナガの森。`python3 shimaenaga/build_game.py` で shimaenaga/dist/ に index.html・img/・version.json を作り、その中身を gh-pages ブランチの shimaenaga/ に置く。壁紙アプリは android-shimaenaga ブランチ。
- kawajiki/ : 河川敷の少年野球（壁紙第三弾）。`python3 src/kawajiki/build.py` で src/kawajiki/dist/ に index.html・version.json・sokuho.html（一球速報：記録して野球場で再生）を作り、gh-pages ブランチの kawajiki/ に置く。壁紙アプリは android-kawajiki ブランチ。
