package solar.jasper.solarize;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;

/** Phone notifications and the few values the app keeps (device token, last lead / alert seen). */
final class Notes {
    static final String PREFS = "solarize";
    static final String CHANNEL = "leads";

    private Notes() { }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static String token(Context c) { return prefs(c).getString("token", ""); }

    /** A lead / alert the user has already been told about is never announced again. */
    static void seen(Context c, String key, long id) {
        SharedPreferences p = prefs(c);
        if (id > p.getLong(key, -1)) p.edit().putLong(key, id).apply();
    }

    static void channel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_leads), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.channel_leads_about));
        ch.enableVibration(true);
        ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    /** A phone number the CRM sent in full (digits only, 10 or more): the CRM hides part of it with dots on leads this user may not open. */
    static String dial(String phone) {
        if (phone == null) return "";
        String d = phone.replaceAll("[\\s\\-()+]", "");
        return d.matches("\\d{10,13}") ? d : "";
    }

    /**
     * Shows one notification. A tap opens the app on the Leads page - on that lead's window when `lead` is given.
     * With a full phone number the notification also carries Call and WhatsApp buttons, so a new lead can be rung at once.
     */
    static void show(Context c, int id, String title, String text, long lead, String phone) { show(c, id, title, text, lead, phone, ""); }

    /** disc = a team discussion to open on a tap: "l<lead id>" or "c<customer id>" (else ""). */
    static void show(Context c, int id, String title, String text, long lead, String phone, String disc) {
        channel(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (lead > 0) open.putExtra(MainActivity.EXTRA_LEAD, lead);
        if (disc != null && !disc.isEmpty()) open.putExtra(MainActivity.EXTRA_DISC, disc);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_note).setContentTitle(title).setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setColor(0xFFD73B3E).setAutoCancel(true).setContentIntent(PendingIntent.getActivity(c, id, open, flags))
            .setWhen(System.currentTimeMillis()).setShowWhen(true);
        String d = dial(phone);
        if (!d.isEmpty()) {
            Icon ic = Icon.createWithResource(c, R.drawable.ic_note);
            String wa = d.length() == 10 ? "91" + d : d;
            b.addAction(new Notification.Action.Builder(ic, "Call", PendingIntent.getActivity(c, id + 1000000, new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + d)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags)).build());
            b.addAction(new Notification.Action.Builder(ic, "WhatsApp", PendingIntent.getActivity(c, id + 2000000, new Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + wa)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags)).build());
        }
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        try {
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id, b.build());
        } catch (SecurityException e) { /* notifications are switched off for the app */ }
    }
}
