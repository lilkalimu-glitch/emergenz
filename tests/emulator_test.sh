#!/usr/bin/env bash
# Testet die APK in einem Android-Emulator (läuft auf GitHub).
# Aufruf: tests/emulator_test.sh <ordner-mit-apk> <ergebnis-ordner>
set -uo pipefail

APK_DIR="$1"
OUT="${2:-emulator-ergebnis}"
PKG=com.lilkalimu.emergenz
mkdir -p "$OUT"
APK=$(ls "$APK_DIR"/*.apk | head -n 1)

fail() {
  echo "FEHLER: $*"
  adb logcat -d > "$OUT/logcat-voll.txt" 2>&1 || true
  adb exec-out screencap -p > "$OUT/bild-fehler.png" 2>/dev/null || true
  exit 1
}

# Wartet, bis eine Zeile im Log auftaucht: wait_log <text> <sekunden>
wait_log() {
  local needle="$1" timeout="$2" waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if adb logcat -d 2>/dev/null | grep -qF -- "$needle"; then
      echo "  gefunden: $needle"
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
  fail "nicht im Log gefunden: $needle"
}

tap_text() {
  local text="$1"
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
  adb pull /sdcard/ui.xml "$OUT/ui.xml" > /dev/null 2>&1
  local b
  b=$(tr '>' '\n' < "$OUT/ui.xml" | grep -E "(text|content-desc)=\"$text\"" | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -n 1)
  if [ -z "$b" ]; then
    return 1
  fi
  local nums
  nums=$(echo "$b" | grep -o '[0-9]\+' | tr '\n' ' ')
  set -- $nums
  local x=$(( ($1 + $3) / 2 ))
  local y=$(( ($2 + $4) / 2 ))
  echo "  tippe auf \"$text\" bei $x,$y"
  adb shell input tap "$x" "$y"
  return 0
}

echo "== Gerät"
adb shell getprop ro.build.version.release
adb shell wm size

echo "== Installieren: $APK"
adb install -r "$APK" || fail "Installation fehlgeschlagen"
adb logcat -c

echo "== Starten"
adb shell am start -W -n "$PKG/.MainActivity" || fail "App ließ sich nicht starten"
wait_log "EMERGENZ_BEREIT" 120
wait_log "EMERGENZ: Vorschau" 120
sleep 3
adb exec-out screencap -p > "$OUT/1-start.png"

echo "== Welt erschaffen"
if ! tap_text "Welt erschaffen"; then
  size=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -n 1)
  w=${size%x*}
  h=${size#*x}
  echo "  Knopf nicht im UI-Baum gefunden, tippe unten in die Mitte"
  adb shell input tap $((w / 2)) $((h * 87 / 100))
fi
wait_log "EMERGENZ_WELT_LAEUFT" 60
sleep 12
adb exec-out screencap -p > "$OUT/2-welt.png"

echo "== Werkzeug Chronik öffnen"
tap_text "Chronik" || true
sleep 3
adb exec-out screencap -p > "$OUT/3-chronik.png"

echo "== Läuft die App noch?"
sleep 8
pid=$(adb shell pidof "$PKG" | tr -d '\r')
[ -n "$pid" ] || fail "App ist abgestürzt"
adb exec-out screencap -p > "$OUT/4-spaeter.png"

adb logcat -d > "$OUT/logcat.txt"
grep -E "Capacitor/Console|EMERGENZ" "$OUT/logcat.txt" > "$OUT/konsole.txt" || true
if grep -E "EMERGENZ_FEHLER|Uncaught|is not defined|is not a function" "$OUT/konsole.txt"; then
  fail "JavaScript-Fehler in der App"
fi
if grep -E "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  fail "Absturz im Log"
fi
echo "ALLE APP-TESTS BESTANDEN"
