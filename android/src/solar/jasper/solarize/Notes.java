package solar.jasper.solarize;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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

    /** Shows one notification; a tap opens the app on the Leads page. */
    static void show(Context c, int id, String title, String text) {
        channel(c);
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_note).setContentTitle(title).setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text))
            .setColor(0xFFD73B3E).setAutoCancel(true).setContentIntent(pi).setWhen(System.currentTimeMillis()).setShowWhen(true);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        try {
            ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id, b.build());
        } catch (SecurityException e) { /* notifications are switched off for the app */ }
    }
}
