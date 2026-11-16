# Solarize Leads — Android app

The CRM's **Leads page** in an app, for staff phones.

- **Sign in** with the CRM username and password. The app stays signed in (device token, `api/app.php`) until
  Sign out, a password change, or 30 days without use.
- **Leads only**: view, add, edit, remark (with history), call back, claim, call / WhatsApp. The CRM sees
  `window.SolarizeApp` (`APPLITE` in `assets/app.js`) and hides every other page. The screen is the live CRM,
  so changes to the Leads page reach the app without a new APK.
- **Notifications**: about every 15 minutes (Android decides the exact moment), also while the app is closed and
  after a restart of the phone, `LeadJob` asks `GET api.php?m=app&a=poll` for new leads (the same ones the CRM
  announces: leads from Meta), call-back reminders and leads assigned to the user. While the app is open the
  CRM's own alerts show at once.

## Files

- `src/solar/jasper/solarize/MainActivity.java` — the screen (WebView) and the bridge `window.SolarizeApp`
- `LeadJob.java` — the 15-minute background check (JobScheduler; no Google / Firebase account needed)
- `Notes.java` — notifications and the stored values
- `build.sh` — builds the APK without Gradle

## Building

Tools live outside the repository in `C:\Users\gotjo\android-build` (`ANDROID_BUILD`): Microsoft JDK 17 (`jdk/`),
Android SDK (`sdk/`, packages `platforms;android-34` and `build-tools;34.0.0`).

```bash
bash android/build.sh
```

The APK is written to `C:\Users\gotjo\android-build\out\SolarizeLeads-<version>.apk`.
For an update, raise `android:versionCode` and `android:versionName` in `AndroidManifest.xml` first.

## The signing key — keep it safe

`C:\Users\gotjo\android-build\solarize-leads.keystore` and `keystore.pass` sign the app. They are **not** in the
repository. Keep a copy somewhere safe: an update signed with a different key cannot be installed over the app
already on the phones (it would have to be uninstalled first).

## Installing on a phone

Send the APK to the phone (WhatsApp, Drive, USB), open it, and allow "install unknown apps" for the app used to
open it. Allow notifications when the app asks. On Xiaomi / Oppo / Vivo / Realme phones also set the app's
battery setting to "No restrictions", or the phone may stop the 15-minute check.
