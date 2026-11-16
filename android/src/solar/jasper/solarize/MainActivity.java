package solar.jasper.solarize;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/**
 * Solarize Leads. The screen is the CRM itself (its Leads page only: the CRM sees window.SolarizeApp and hides everything else),
 * so the app always shows the newest CRM without an update. The app adds what a web page cannot do on a phone:
 * it stays signed in with a device token, and LeadJob checks for new leads every 15 minutes even while the app is closed.
 */
public class MainActivity extends Activity {
    static final String HOME = "https://solarize.jasper.solar/";
    static final String HOST = "solarize.jasper.solar";
    private static final int PICK = 41;

    private WebView web;
    private ValueCallback<Uri[]> picking;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); /* the new-lead beep */
        s.setSupportMultipleWindows(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true); /* files picked for an upload */
        s.setUserAgentString(s.getUserAgentString() + " SolarizeLeads/1.0");
        CookieManager.getInstance().setAcceptCookie(true);

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
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) v.loadDataWithBaseURL(null, OFFLINE, "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
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

        if (saved != null) web.restoreState(saved); else web.loadUrl(HOME + "#/leads");
    }

    /** Opened again from a notification: show the Leads page as it is now. */
    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        web.evaluateJavascript("if(location.hash!=='#/leads')location.hash='#/leads';else if(typeof route==='function'&&!document.querySelector('.modal'))route();", null);
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

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
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
            Notes.show(MainActivity.this, 500000 + (int) (System.currentTimeMillis() % 100000), title == null || title.isEmpty() ? "Solarize" : title, body == null ? "" : body);
        }

        /** The open page has already shown these: the background check must not announce them again. */
        @JavascriptInterface public void seenLead(String id) { try { Notes.seen(MainActivity.this, "lead", Long.parseLong(id)); } catch (NumberFormatException e) { } }
        @JavascriptInterface public void seenAlert(String id) { try { Notes.seen(MainActivity.this, "notif", Long.parseLong(id)); } catch (NumberFormatException e) { } }

        @JavascriptInterface public String version() { return "1.0"; }
    }

    private static final String OFFLINE = "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
        + "<body style='font-family:sans-serif;text-align:center;padding:64px 24px;color:#1d1d1f;background:#f5f5f7'>"
        + "<h2 style='margin:0 0 8px'>No connection</h2><p style='color:#6e6e73;margin:0 0 24px'>The CRM could not be reached. Check the internet and try again.</p>"
        + "<a href='" + HOME + "#/leads' style='display:inline-block;background:#007aff;color:#fff;padding:12px 26px;border-radius:12px;text-decoration:none;font-weight:600'>Try again</a></body>";
}
