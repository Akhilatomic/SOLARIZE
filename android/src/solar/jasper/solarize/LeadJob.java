package solar.jasper.solarize;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The background check: about every 15 minutes (Android decides the exact moment), also while the app is closed and after a
 * restart of the phone, the app asks the CRM what arrived since the last check and shows a notification for each new lead,
 * call-back reminder and lead assigned to this user. Runs only while a user is signed in (a device token is kept).
 */
public class LeadJob extends JobService {
    static final int JOB = 7101;
    static final long EVERY = 15 * 60 * 1000L; /* the shortest period Android allows */

    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB) return; /* already running: keep its rhythm */
        js.schedule(new JobInfo.Builder(JOB, new ComponentName(c, LeadJob.class))
            .setPeriodic(EVERY).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true).build());
    }

    static void cancel(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js != null) js.cancel(JOB);
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context c = getApplicationContext();
        if (Notes.token(c).isEmpty()) { cancel(c); return false; }
        new Thread(new Runnable() {
            @Override public void run() {
                try { check(c); } catch (Exception e) { /* no network just now: the next check tries again */ }
                jobFinished(params, false);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return false; }

    /** One check. Also used by the app itself right after sign-in to set the starting point. */
    static void check(Context c) throws Exception {
        SharedPreferences p = Notes.prefs(c);
        String tok = p.getString("token", "");
        if (tok.isEmpty()) return;
        long lead = p.getLong("lead", -1), notif = p.getLong("notif", -1);
        HttpURLConnection h = (HttpURLConnection) new URL(MainActivity.HOME + "api.php?m=app&a=poll&lead=" + lead + "&notif=" + notif).openConnection();
        h.setConnectTimeout(15000); h.setReadTimeout(20000);
        h.setRequestProperty("X-App-Token", tok);
        h.setRequestProperty("Accept", "application/json");
        int code = h.getResponseCode();
        if (code == 401) { /* signed out elsewhere, password changed, or the account was closed */
            p.edit().remove("token").apply(); cancel(c);
            Notes.show(c, 1, "Solarize Leads", "You are signed out. Open the app and sign in to keep getting lead notifications.");
            return;
        }
        if (code != 200) return;
        JSONObject j = new JSONObject(read(h.getInputStream()));
        JSONArray leads = j.optJSONArray("leads"), alerts = j.optJSONArray("alerts");
        int n = leads == null ? 0 : leads.length();
        if (n > 3) { /* many at once: one notification */
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < n && i < 6; i++) { if (i > 0) sb.append('\n'); sb.append(line(leads.getJSONObject(i))); }
            if (n > 6) sb.append("\n+ ").append(n - 6).append(" more");
            Notes.show(c, 2, n + " new leads", sb.toString());
        } else for (int i = n - 1; i >= 0; i--) {
            JSONObject l = leads.getJSONObject(i);
            Notes.show(c, 100000 + (int) (l.optLong("id") % 100000), "New lead", line(l));
        }
        for (int i = alerts == null ? -1 : alerts.length() - 1; i >= 0; i--) {
            JSONObject a = alerts.getJSONObject(i);
            Notes.show(c, 300000 + (int) (a.optLong("id") % 100000), "callback".equals(a.optString("kind")) ? "Call back reminder" : "Lead for you", a.optString("text"));
        }
        p.edit().putLong("lead", Math.max(lead, j.optLong("lead", lead))).putLong("notif", Math.max(notif, j.optLong("notif", notif))).apply();
    }

    private static String line(JSONObject l) {
        String s = l.optString("name", "Lead");
        if (!l.optString("phone").isEmpty()) s += " · " + l.optString("phone");
        if (!l.optString("city").isEmpty()) s += " · " + l.optString("city");
        return s;
    }

    private static String read(InputStream in) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] b = new byte[4096]; int n;
        while ((n = in.read(b)) > 0) o.write(b, 0, n);
        in.close();
        return o.toString("UTF-8");
    }
}
