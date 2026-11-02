package io.github.sengokubuilder.redbeetank;

import android.app.Presentation;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.service.wallpaper.WallpaperService;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 水槽のWebページを、そのままライブ壁紙として表示するサービス。
 * 壁紙の描画面（Surface）に仮想ディスプレイをつなぎ、その上にWebViewを載せることで、
 * WebGL を含むページをハードウェア描画のまま映す。
 */
public class TankWallpaperService extends WallpaperService {

    static final String PREFS = "tank";
    static final String KEY_URL = "url";
    static final String DEFAULT_URL = "https://sengoku-builder.github.io/red-bee-tank/?wallpaper";

    static String loadUrl(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREFS, MODE_PRIVATE);
        return p.getString(KEY_URL, DEFAULT_URL);
    }

    @Override
    public Engine onCreateEngine() {
        return new TankEngine();
    }

    class TankEngine extends Engine {
        private VirtualDisplay display;
        private Presentation presentation;
        private WebView web;
        private String loadedUrl;
        private int width, height;
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
                display = dm.createVirtualDisplay("RedBeeTank", width, height, dpi, holder.getSurface(), 0);
                presentation = new Presentation(TankWallpaperService.this, display.getDisplay());
                web = new WebView(presentation.getContext());
                WebSettings s = web.getSettings();
                s.setJavaScriptEnabled(true);
                s.setDomStorageEnabled(true);
                s.setMediaPlaybackRequiresUserGesture(true);
                web.setBackgroundColor(Color.BLACK);
                web.setWebViewClient(new WebViewClient());
                presentation.setContentView(web);
                presentation.show();
                loadedUrl = loadUrl(TankWallpaperService.this);
                web.loadUrl(loadedUrl);
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
                c.drawColor(Color.rgb(10, 16, 19));
                Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
                p.setColor(Color.WHITE);
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
                String url = loadUrl(TankWallpaperService.this);
                if (!url.equals(loadedUrl)) {
                    loadedUrl = url;
                    web.loadUrl(url);
                }
            } else {
                // 見えていない間は止めて電池を節約
                web.onPause();
                web.pauseTimers();
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
