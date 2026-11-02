package io.github.sengokubuilder.shimaenaga;

import android.app.Presentation;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.os.SystemClock;
import android.service.wallpaper.WallpaperService;
import android.view.SurfaceHolder;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * シマエナガの森のページを、そのままライブ壁紙として表示するサービス。
 * 遊ぶ画面（MainActivity）と同じアプリの中なので、ブラウザ保存のデータを共有できる。
 * 壁紙の描画面に仮想ディスプレイをつなぎ、その上にWebViewを載せて、WebGLのページをそのまま映す。
 */
public class ForestWallpaperService extends WallpaperService {

    static final String GAME_URL = "https://sengoku-builder.github.io/red-bee-tank/shimaenaga/";
    static final String WALL_URL = GAME_URL + "?wallpaper";
    /** 新しい版のページを取り込むため、この時間がたったら見えたときに読み直す */
    static final long RELOAD_MS = 6L * 60 * 60 * 1000;

    @Override
    public Engine onCreateEngine() {
        return new ForestEngine();
    }

    class ForestEngine extends Engine {
        private VirtualDisplay display;
        private Presentation presentation;
        private WebView web;
        private int width, height;
        private long loadedAt;

        @Override
        public void onSurfaceChanged(SurfaceHolder holder, int format, int w, int h) {
            super.onSurfaceChanged(holder, format, w, h);
            width = w;
            height = h;
            if (display == null) {
                start(holder);
            } else {
                int dpi = getResources().getDisplayMetrics().densityDpi;
                display.resize(w, h, dpi);
                display.setSurface(holder.getSurface());
            }
        }

        private void start(SurfaceHolder holder) {
            try {
                DisplayManager dm = (DisplayManager) getSystemService(Context.DISPLAY_SERVICE);
                int dpi = getResources().getDisplayMetrics().densityDpi;
                display = dm.createVirtualDisplay("ShimaenagaForest", width, height, dpi, holder.getSurface(), 0);
                presentation = new Presentation(ForestWallpaperService.this, display.getDisplay());
                web = new WebView(presentation.getContext());
                WebSettings s = web.getSettings();
                s.setJavaScriptEnabled(true);
                s.setDomStorageEnabled(true);
                web.setBackgroundColor(Color.rgb(223, 229, 234));
                web.setWebViewClient(new WebViewClient());
                presentation.setContentView(web);
                presentation.show();
                web.loadUrl(WALL_URL);
                loadedAt = SystemClock.elapsedRealtime();
            } catch (Throwable e) {
                stop();
                drawMessage(holder, "壁紙を表示できませんでした: " + e.getClass().getSimpleName());
            }
        }

        private void drawMessage(SurfaceHolder holder, String msg) {
            Canvas c = null;
            try {
                c = holder.lockCanvas();
                if (c == null) return;
                c.drawColor(Color.rgb(223, 229, 234));
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                p.setColor(Color.DKGRAY);
                p.setTextSize(36f);
                c.drawText(msg, 40, c.getHeight() / 2f, p);
            } catch (Throwable ignored) {
            } finally {
                if (c != null) holder.unlockCanvasAndPost(c);
            }
        }

        @Override
        public void onVisibilityChanged(boolean visible) {
            super.onVisibilityChanged(visible);
            if (web == null) return;
            if (visible) {
                web.onResume();
                web.resumeTimers();
                if (SystemClock.elapsedRealtime() - loadedAt > RELOAD_MS) {
                    web.reload();
                    loadedAt = SystemClock.elapsedRealtime();
                } else {
                    // 遊ぶ画面で変わった内容（買った道具など）をすぐ映す
                    web.evaluateJavascript("document.dispatchEvent(new Event('visibilitychange'))", null);
                }
            } else {
                // 見えていない間は止めて電池を節約。
                // pauseTimers() はアプリ全体のWebViewを止めてしまう（遊ぶ画面も止まる）ので使わない
                web.onPause();
            }
        }

        @Override
        public void onSurfaceDestroyed(SurfaceHolder holder) {
            stop();
            super.onSurfaceDestroyed(holder);
        }

        @Override
        public void onDestroy() {
            stop();
            super.onDestroy();
        }

        private void stop() {
            try { if (presentation != null) presentation.dismiss(); } catch (Throwable ignored) {}
            try { if (web != null) web.destroy(); } catch (Throwable ignored) {}
            try { if (display != null) display.release(); } catch (Throwable ignored) {}
            presentation = null;
            web = null;
            display = null;
        }
    }
}
