package io.github.sengokubuilder.kawajiki;

import android.app.Presentation;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.os.SystemClock;
import android.service.wallpaper.WallpaperService;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 河川敷の少年野球のページを、そのままライブ壁紙として表示するサービス。
 * 設定画面（MainActivity）と同じアプリの中なので、吹き出しの量などの設定を共有できる。
 * 壁紙の描画面に仮想ディスプレイをつなぎ、その上にWebViewを載せてページを映す。
 */
public class BallparkWallpaperService extends WallpaperService {

    static final String PAGE_URL = "https://sengoku-builder.github.io/red-bee-tank/kawajiki/";
    static final String WALL_URL = PAGE_URL + "?wallpaper";
    /** 新しい版のページを取り込むため、この時間がたったら見えたときに読み直す */
    static final long RELOAD_MS = 6L * 60 * 60 * 1000;

    @Override
    public Engine onCreateEngine() {
        return new BallparkEngine();
    }

    class BallparkEngine extends Engine {
        private VirtualDisplay display;
        private Presentation presentation;
        private WebView web;
        private int width, height;
        private long loadedAt;
        // ホーム画面のページ送り（ランチャーが壁紙の位置を知らせてくれる場合）
        private boolean offsetsWork = false;
        // 指の横スワイプ（ページ送りを知らせないランチャー用）
        private float downX, downY;
        private boolean swiping = false;

        @Override
        public void onCreate(SurfaceHolder holder) {
            super.onCreate(holder);
            setTouchEventsEnabled(true);
        }

        private void js(String code) {
            if (web != null) web.evaluateJavascript("window.wallpaperPan&&window.wallpaperPan(" + code + ")", null);
        }

        @Override
        public void onOffsetsChanged(float xOffset, float yOffset, float xStep, float yStep, int xPx, int yPx) {
            super.onOffsetsChanged(xOffset, yOffset, xStep, yStep, xPx, yPx);
            // ページが2枚以上あり、実際に位置が動いたときだけ使う
            if (xStep > 0f && xStep < 1f && (offsetsWork || Math.abs(xOffset - 0.5f) > 0.01f)) {
                offsetsWork = true;
                js("'offset'," + xOffset);
            }
        }

        @Override
        public void onTouchEvent(MotionEvent e) {
            super.onTouchEvent(e);
            if (offsetsWork) return;
            float d = getResources().getDisplayMetrics().density;
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    downX = e.getX(); downY = e.getY(); swiping = false;
                    break;
                case MotionEvent.ACTION_MOVE:
                    float dx = e.getX() - downX, dy = e.getY() - downY;
                    if (!swiping && Math.abs(dx) > 12 * d && Math.abs(dx) > Math.abs(dy) * 1.5f) {
                        swiping = true;
                        js("'down',0");
                    }
                    if (swiping) js("'move'," + (dx / d));
                    break;
                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    if (swiping) js("'up',0");
                    swiping = false;
                    break;
            }
        }

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
                display = dm.createVirtualDisplay("KawajikiBaseball", width, height, dpi, holder.getSurface(), 0);
                presentation = new Presentation(BallparkWallpaperService.this, display.getDisplay());
                web = new WebView(presentation.getContext());
                WebSettings s = web.getSettings();
                s.setJavaScriptEnabled(true);
                s.setDomStorageEnabled(true);
                web.setBackgroundColor(Color.rgb(156, 199, 230));
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
                c.drawColor(Color.rgb(156, 199, 230));
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
                    // 設定画面で変えた内容をすぐ映し、新しい版が出ていないか確かめる
                    web.evaluateJavascript("document.dispatchEvent(new Event('visibilitychange'))", null);
                }
            } else {
                // 見えていない間は止めて電池を節約（pauseTimersはアプリ全体を止めるので使わない）
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
