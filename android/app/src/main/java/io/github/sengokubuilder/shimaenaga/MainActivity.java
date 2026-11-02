package io.github.sengokubuilder.shimaenaga;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * シマエナガの森で遊ぶ画面。
 * 壁紙と同じアプリの中で開くので、ここで遊んだ内容（G・道具・家族）がそのまま壁紙に映る。
 */
public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setBackgroundColor(Color.rgb(223, 229, 234));
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient()); // 「最初からやり直す」の確認ダイアログ用
        web.addJavascriptInterface(new Bridge(), "ShimaApp");
        setContentView(web);
        web.loadUrl(ForestWallpaperService.GAME_URL);
    }

    /** ページの「この森を壁紙にする」ボタンから呼ばれる */
    class Bridge {
        @JavascriptInterface
        public void setWallpaper() {
            runOnUiThread(() -> {
                Intent i = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
                i.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                        new ComponentName(MainActivity.this, ForestWallpaperService.class));
                try {
                    startActivity(i);
                } catch (Exception e) {
                    startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER));
                }
            });
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) { web.onResume(); web.resumeTimers(); }
    }

    @Override
    protected void onPause() {
        // 遊んだ内容をすぐ保存させてから止める（ページ側は1秒ごとに保存している）
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
