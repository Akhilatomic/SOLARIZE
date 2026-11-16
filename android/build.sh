#!/bin/bash
# Builds the "Solarize Leads" Android app (APK) without Gradle: the app uses only what Android itself provides,
# so Google's command-line tools are enough: aapt2 -> javac -> d8 -> zipalign -> apksigner.
#
# Needs (see README.md): a JDK 17 and the Android SDK (platforms;android-34, build-tools;34.0.0) under $ANDROID_BUILD,
# and the signing key $ANDROID_BUILD/solarize-leads.keystore with its password in $ANDROID_BUILD/keystore.pass.
# KEEP THAT KEY: an update of the app must be signed with the same key, or phones refuse to install it over the old one.
#
# Usage: bash android/build.sh      -> prints the path of the finished APK
set -euo pipefail
T="${ANDROID_BUILD:-/c/Users/gotjo/android-build}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="$T/sdk"; BT="$SDK/build-tools/34.0.0"; PLAT="$SDK/platforms/android-34/android.jar"
JD="$(ls -d "$T"/jdk/*/ | head -1)"; export JAVA_HOME="${JD%/}"; export PATH="$JAVA_HOME/bin:$PATH"
KS="$T/solarize-leads.keystore"; KP="$T/keystore.pass"
[ -f "$PLAT" ] || { echo "Android platform 34 is not installed in $SDK"; exit 1; }
[ -f "$KS" ] && [ -f "$KP" ] || { echo "Signing key not found: $KS (+ keystore.pass)"; exit 1; }

VER="$(grep -o 'versionName="[^"]*"' "$HERE/AndroidManifest.xml" | cut -d'"' -f2)"
OUT="$T/out/build-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/dex"

"$BT/aapt2" compile --dir "$HERE/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLAT" --manifest "$HERE/AndroidManifest.xml" --java "$OUT/gen" "$OUT/res.zip"
javac -nowarn -source 8 -target 8 -classpath "$PLAT" -d "$OUT/classes" $(find "$HERE/src" "$OUT/gen" -name '*.java') 2>&1 | grep -v "bootstrap class path\|^1 warning\|source value 8\|target value 8\|To suppress\|^[0-9] warnings" || true
[ -n "$(find "$OUT/classes" -name '*.class' | head -1)" ] || { echo "javac produced nothing"; exit 1; }
"$BT/d8.bat" --lib "$PLAT" --min-api 24 --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
(cd "$OUT/dex" && "$BT/aapt" add ../base.apk classes.dex >/dev/null)
"$BT/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"
APK="$T/out/SolarizeLeads-$VER.apk"
"$BT/apksigner.bat" sign --ks "$(cygpath -w "$KS" 2>/dev/null || echo "$KS")" --ks-pass "file:$(cygpath -w "$KP" 2>/dev/null || echo "$KP")" --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner.bat" verify "$APK"
echo "APK: $APK"
