"""Launch the native app and verify visible navigation, not just a running process.
This smoke test does not verify Health permissions, watch pairing or visual quality.
"""
import json
import os
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as ET

OUT = pathlib.Path("runtime-evidence")
OUT.mkdir(exist_ok=True)
PACKAGE = "com.mori.form"

def adb(*args):
    timeout = 120 if args and args[0] == "install" else 30
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT, timeout=timeout)

def capture(name):
    # Keep pixels even when startup has no accessible window yet.
    (OUT / (name + ".png")).write_bytes(adb("exec-out", "screencap", "-p"))
    if os.environ.get("FORM_UI_PROBE") == "1":
        output = adb("shell", "am", "instrument", "-w", "com.mori.form.probe/.HierarchyProbe")
        (OUT / (name + "-dump.txt")).write_bytes(output)
        if b"FORM_PROBE_OK" not in output:
            raise ET.ParseError(output.decode("utf-8", errors="replace"))
        raw = adb("exec-out", "run-as", "com.mori.form.probe", "cat", "files/ui.xml")
    else:
        adb("shell", "rm", "-f", "/sdcard/form-ui.xml")
        output = adb("shell", "uiautomator", "dump", "--compressed", "/sdcard/form-ui.xml")
        (OUT / (name + "-dump.txt")).write_bytes(output)
        raw = adb("shell", "cat", "/sdcard/form-ui.xml")
    root = ET.fromstring(raw)
    (OUT / (name + ".xml")).write_bytes(raw)
    return root

def labels(root):
    return [n.get("text", "") + " " + n.get("content-desc", "") for n in root.iter("node")]

def wait_for(text, name):
    deadline = time.monotonic() + 120
    last_error = None
    while time.monotonic() < deadline:
        try:
            root = capture(name)
            # Match the app package, not labels in system or launcher windows.
            nodes = [n for n in root.iter("node") if n.get("package") == PACKAGE]
            if any(text in (n.get("text", "") + " " + n.get("content-desc", "")) for n in nodes):
                # Capture again after the asserted UI exists; the first pixel capture may precede navigation.
                (OUT / (name + ".png")).write_bytes(adb("exec-out", "screencap", "-p"))
                return root
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ET.ParseError) as error:
            # A transient startup dump failure may retry; the overall assertion still fails.
            last_error = str(error)
            with (OUT / "capture-errors.txt").open("a", encoding="utf-8") as log:
                log.write(name + ": " + last_error + "\n")
        time.sleep(2)
    raise AssertionError("Visible UI never showed: " + text + "; capture error: " + str(last_error))

def tap_exact(text, root):
    for n in root.iter("node"):
        if n.get("content-desc") == text or n.get("text") == text:
            bounds = list(map(int, re.findall(r"\d+", n.get("bounds", ""))))
            if len(bounds) == 4:
                x1, y1, x2, y2 = bounds
                adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
                return
    raise AssertionError("Accessible control missing: " + text)

results = []
try:
    adb("install", "-r", os.environ.get("FORM_APK", "android/app/build/outputs/apk/release/app-release.apk"))
    if os.environ.get("FORM_UI_PROBE") == "1":
        probe_apks = list(pathlib.Path("tools/ui-probe/build/outputs/apk/debug").glob("*.apk"))
        if len(probe_apks) != 1:
            raise AssertionError("Expected exactly one emulator observer APK")
        adb("install", "-r", str(probe_apks[0]))
    adb("logcat", "-c")
    adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
    root = wait_for("오늘", "01-home")
    results.append("native home rendered")
    for control, expected, name in [
        ("루틴", "새 루틴", "02-routines"),
        ("기록", "최근 6주 운동 볼륨", "03-history"),
        ("내 정보", "화면 스타일", "04-settings"),
    ]:
        tap_exact(control, root)
        root = wait_for(expected, name)
        results.append(control + " navigation rendered")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
    wait_for("오늘", "05-relaunch")
    results.append("force-stop and relaunch rendered home")
    logs = adb("logcat", "-d").decode("utf-8", errors="replace")
    if "FATAL EXCEPTION" in logs or "JavascriptException" in logs:
        raise AssertionError("Runtime exception found; inspect logcat")
finally:
    (OUT / "activity.txt").write_bytes(adb("shell", "dumpsys", "activity", "activities"))
    (OUT / "logcat.txt").write_bytes(adb("logcat", "-d"))
    (OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
