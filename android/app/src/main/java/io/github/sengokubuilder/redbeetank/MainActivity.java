package io.github.sengokubuilder.redbeetank;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** 壁紙に表示するアドレスを設定し、壁紙に設定する画面。 */
public class MainActivity extends Activity {

    private EditText urlInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad * 2, pad, pad);
        root.setBackgroundColor(Color.rgb(10, 16, 19));

        TextView title = new TextView(this);
        title.setText("レッドビー水槽 壁紙");
        title.setTextSize(22);
        title.setTextColor(Color.WHITE);
        root.addView(title);

        TextView help = new TextView(this);
        help.setText("\n① 水槽のページの「記録」→「壁紙用アドレスをコピー」を押す\n"
                + "② 下の欄に貼り付けて「保存」\n"
                + "③「壁紙に設定」を押す\n");
        help.setTextColor(Color.rgb(200, 215, 210));
        help.setTextSize(15);
        root.addView(help);

        urlInput = new EditText(this);
        urlInput.setText(TankWallpaperService.loadUrl(this));
        urlInput.setTextColor(Color.WHITE);
        urlInput.setTextSize(13);
        root.addView(urlInput);

        Button paste = new Button(this);
        paste.setText("コピーしたアドレスを貼り付け");
        paste.setOnClickListener(v -> {
            ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            ClipData clip = cm.getPrimaryClip();
            if (clip != null && clip.getItemCount() > 0) {
                CharSequence t = clip.getItemAt(0).coerceToText(this);
                if (t != null) urlInput.setText(t.toString().trim());
            }
        });
        root.addView(paste);

        Button save = new Button(this);
        save.setText("保存");
        save.setOnClickListener(v -> {
            String url = urlInput.getText().toString().trim();
            if (!url.startsWith("https://")) {
                Toast.makeText(this, "https:// で始まるアドレスを入れてください", Toast.LENGTH_LONG).show();
                return;
            }
            getSharedPreferences(TankWallpaperService.PREFS, MODE_PRIVATE)
                    .edit().putString(TankWallpaperService.KEY_URL, url).apply();
            Toast.makeText(this, "保存しました", Toast.LENGTH_SHORT).show();
        });
        root.addView(save);

        Button set = new Button(this);
        set.setText("壁紙に設定");
        set.setOnClickListener(v -> {
            Intent i = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
            i.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                    new ComponentName(this, TankWallpaperService.class));
            try {
                startActivity(i);
            } catch (Exception e) {
                startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER));
            }
        });
        root.addView(set);

        root.setGravity(Gravity.TOP);
        setContentView(root);
    }
}
