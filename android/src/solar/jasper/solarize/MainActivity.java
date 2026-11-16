package solar.jasper.solarize;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.graphics.Typeface;
import android.os.Handler;
import android.os.Looper;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.ProgressBar;
import android.widget.Toast;

/**
 * Solarize Leads. The screen is the CRM itself (its Leads page only: the CRM sees window.SolarizeApp and hides everything else),
 * so the app always shows the newest CRM without an update. The app adds what a web page cannot do on a phone:
 * it stays signed in with a device token, and LeadJob checks for new leads every 15 minutes even while the app is closed.
 */
public class MainActivity extends Activity {
    static final String HOME = "https://solarize.jasper.solar/";
    static final String HOST = "solarize.jasper.solar";
    static final String VERSION = "1.3";
    static final String EXTRA_LEAD = "lead";
    private static final int PICK = 41;

    private WebView web;
    private ProgressBar bar;
    private View splash;      /* the opening screen: logo, name and a loading animation until the CRM is on screen */
    private long splashAt;
    private static final long SPLASH_MIN = 1600, SPLASH_MAX = 15000;
    private ValueCallback<Uri[]> picking;
    private long pendingLead; /* a lead's notification was tapped: its window opens when the page is ready */
    private long backAt;      /* Back pressed once on the Leads page: a second press within 2 s leaves the app */

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        FrameLayout root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        /* a thin blue line at the top while a page loads, so the screen is never just blank */
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        bar.setProgressTintList(ColorStateList.valueOf(0xFF007AFF));
        root.addView(bar, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, Math.round(3 * getResources().getDisplayMetrics().density), Gravity.TOP));
        splash = saved == null ? buildSplash() : null; /* only on a fresh start, not when the screen is rotated */
        if (splash != null) {
            root.addView(splash, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            splashAt = System.currentTimeMillis();
            new Handler(Looper.getMainLooper()).postDelayed(this::hideSplash, SPLASH_MAX); /* never stuck on it */
        }
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); /* the new-lead beep */
        s.setSupportMultipleWindows(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true); /* files picked for an upload */
        s.setUserAgentString(s.getUserAgentString() + " SolarizeLeads/" + VERSION);
        CookieManager.getInstance().setAcceptCookie(true);

        /* a new version of the app starts with a clean page store, so it never shows an older copy of the CRM */
        if (!VERSION.equals(Notes.prefs(this).getString("ver", ""))) { web.clearCache(true); Notes.prefs(this).edit().putString("ver", VERSION).apply(); }
        web.addJavascriptInterface(new Bridge(), "SolarizeApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("https".equals(u.getScheme()) && HOST.equals(u.getHost())) return false; /* the CRM stays in the app */
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } /* phone, WhatsApp, maps, email, other sites */
                catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "No app on this phone can open that link", Toast.LENGTH_SHORT).show(); }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (pendingLead > 0 && url != null && url.startsWith(HOME)) { openLead(pendingLead); pendingLead = 0; }
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null, OFFLINE, "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) {
                bar.setProgress(p);
                bar.setVisibility(p >= 100 || splash != null ? View.GONE : View.VISIBLE);
                if (p >= 100 && splash != null) /* the page is in: the opening screen stays at least SPLASH_MIN, then fades */
                    new Handler(Looper.getMainLooper()).postDelayed(MainActivity.this::hideSplash, Math.max(2500, SPLASH_MIN - (System.currentTimeMillis() - splashAt)));
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (picking != null) picking.onReceiveValue(null);
                picking = cb;
                try { startActivityForResult(p.createIntent(), PICK); }
                catch (ActivityNotFoundException e) { picking = null; cb.onReceiveValue(null); return false; }
                return true;
            }
        });
        web.setDownloadListener((url, ua, disp, mime, len) ->
            Toast.makeText(this, "Downloads are not part of the app. Open the CRM in a browser for that.", Toast.LENGTH_LONG).show());

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        Notes.channel(this);
        if (!Notes.token(this).isEmpty()) LeadJob.schedule(this);

        pendingLead = getIntent() == null ? 0 : getIntent().getLongExtra(EXTRA_LEAD, 0);
        if (saved != null) web.restoreState(saved); else web.loadUrl(HOME + "#/leads");
    }

    /** Opened again from a notification: the Leads page as it is now, and the lead's window when the notification was about one lead. */
    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        long lead = i == null ? 0 : i.getLongExtra(EXTRA_LEAD, 0);
        web.evaluateJavascript("if(location.hash!=='#/leads')location.hash='#/leads';else if(typeof route==='function'&&!document.querySelector('.modal'))route();", null);
        if (lead > 0) openLead(lead);
    }

    /** The opening screen: the Jasper logo breathing gently, the name, and three dots that pulse one after another. */
    private View buildSplash() {
        float d = getResources().getDisplayMetrics().density;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL); box.setGravity(Gravity.CENTER); box.setBackgroundColor(0xFFFFFFFF); box.setClickable(true);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.splash_logo);
        box.addView(logo, new LinearLayout.LayoutParams(Math.round(132 * d), Math.round(132 * d)));
        TextView name = new TextView(this);
        name.setText(R.string.app_name); name.setTextSize(30); name.setTextColor(0xFF1D1D1F); name.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD)); name.setLetterSpacing(0.04f); name.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT); np.topMargin = Math.round(18 * d);
        box.addView(name, np);
        TextView sub = new TextView(this);
        sub.setText(R.string.splash_sub); sub.setTextSize(14); sub.setTextColor(0xFF8E8E93); sub.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT); sp.topMargin = Math.round(4 * d);
        box.addView(sub, sp);
        LinearLayout dots = new LinearLayout(this); dots.setOrientation(LinearLayout.HORIZONTAL); dots.setGravity(Gravity.CENTER);
        for (int i = 0; i < 3; i++) {
            View dot = new View(this);
            android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable(); g.setShape(android.graphics.drawable.GradientDrawable.OVAL); g.setColor(0xFFD73B3E);
            dot.setBackground(g);
            LinearLayout.LayoutParams dp = new LinearLayout.LayoutParams(Math.round(10 * d), Math.round(10 * d)); dp.leftMargin = dp.rightMargin = Math.round(5 * d);
            dots.addView(dot, dp);
            ObjectAnimator a = ObjectAnimator.ofPropertyValuesHolder(dot, PropertyValuesHolder.ofFloat(View.SCALE_X, 0.55f, 1.25f), PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.55f, 1.25f), PropertyValuesHolder.ofFloat(View.ALPHA, 0.3f, 1f));
            a.setDuration(520); a.setStartDelay(i * 170L); a.setRepeatCount(ValueAnimator.INFINITE); a.setRepeatMode(ValueAnimator.REVERSE); a.setInterpolator(new AccelerateDecelerateInterpolator()); a.start();
        }
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT); lp.topMargin = Math.round(34 * d);
        box.addView(dots, lp);
        ObjectAnimator breathe = ObjectAnimator.ofPropertyValuesHolder(logo, PropertyValuesHolder.ofFloat(View.SCALE_X, 0.94f, 1.05f), PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.94f, 1.05f));
        breathe.setDuration(900); breathe.setRepeatCount(ValueAnimator.INFINITE); breathe.setRepeatMode(ValueAnimator.REVERSE); breathe.setInterpolator(new AccelerateDecelerateInterpolator()); breathe.start();
        box.setAlpha(1f);
        return box;
    }

    private void hideSplash() {
        final View s = splash; if (s == null) return;
        splash = null;
        s.animate().alpha(0f).setDuration(320).withEndAction(() -> { if (s.getParent() instanceof FrameLayout) ((FrameLayout) s.getParent()).removeView(s); }).start();
    }

    private void openLead(long id) {
        web.evaluateJavascript("if(typeof appOpenLead==='function')appOpenLead(" + id + ");", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != PICK || picking == null) return;
        picking.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
        picking = null;
    }

    /** Back closes what is open on top (a lead's window, a menu); on the plain Leads page a second press leaves the app. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(typeof appBack==='function')?appBack():'no'", v -> {
            if (v != null && v.contains("yes")) return;
            long now = System.currentTimeMillis();
            if (now - backAt < 2000) { moveTaskToBack(true); return; }
            backAt = now;
            Toast.makeText(this, "Press Back again to leave the app", Toast.LENGTH_SHORT).show();
        });
    }

    @Override
    protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }

    /** What the CRM page may ask the app to do (window.SolarizeApp). */
    private final class Bridge {
        @JavascriptInterface public String getToken() { return Notes.token(MainActivity.this); }

        /** Signed in: keep the device token and start the 15-minute check from "now" (old leads do not ring). */
        @JavascriptInterface public void setToken(String t) {
            if (t == null || !t.matches("[0-9a-f]{64}")) return;
            Notes.prefs(MainActivity.this).edit().putString("token", t).remove("lead").remove("notif").apply();
            LeadJob.schedule(MainActivity.this);
            new Thread(() -> { try { LeadJob.check(MainActivity.this); } catch (Exception e) { /* the first scheduled check sets it */ } }).start();
        }

        /** Signed out: forget the token, stop checking. */
        @JavascriptInterface public void clear() {
            Notes.prefs(MainActivity.this).edit().remove("token").remove("lead").remove("notif").apply();
            LeadJob.cancel(MainActivity.this);
        }

        @JavascriptInterface public String device() { return (Build.MANUFACTURER + " " + Build.MODEL).trim(); }

        /** An alert raised by the open CRM page (new lead, reminder, call back, discussion). */
        @JavascriptInterface public void notify(String title, String body) {
            Notes.show(MainActivity.this, 500000 + (int) (System.currentTimeMillis() % 100000), title == null || title.isEmpty() ? "Jasper" : title, body == null ? "" : body, 0, "");
        }

        /** The open page has already shown these: the background check must not announce them again. */
        @JavascriptInterface public void seenLead(String id) { try { Notes.seen(MainActivity.this, "lead", Long.parseLong(id)); } catch (NumberFormatException e) { } }
        @JavascriptInterface public void seenAlert(String id) { try { Notes.seen(MainActivity.this, "notif", Long.parseLong(id)); } catch (NumberFormatException e) { } }

        /** The CRM has drawn its first screen (sign-in or Leads): the opening screen may go. */
        @JavascriptInterface public void ready() { runOnUiThread(() -> new Handler(Looper.getMainLooper()).postDelayed(MainActivity.this::hideSplash, Math.max(0, SPLASH_MIN - (System.currentTimeMillis() - splashAt)))); }

        @JavascriptInterface public String version() { return VERSION; }
    }

    private static final String OFFLINE = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
        + "<body style='font-family:sans-serif;text-align:center;padding:64px 24px;color:#1d1d1f;background:#f5f5f7'>"
        + "<h2 style='margin:0 0 8px'>No connection</h2><p style='color:#6e6e73;margin:0 0 24px'>The CRM could not be reached. Check the internet and try again.</p>"
        + "<a href='" + HOME + "#/leads' style='display:inline-block;background:#007aff;color:#fff;padding:12px 26px;border-radius:12px;text-decoration:none;font-weight:600'>Try again</a></body>";
}
