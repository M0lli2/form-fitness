"""Launch the native app and verify visible navigation, not just a running process.
This smoke test does not verify Health permissions, watch pairing or visual quality.
"""
import json
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as ET

OUT = pathlib.Path("runtime-evidence")
OUT.mkdir(exist_ok=True)
PACKAGE = "com.mori.form"

def adb(*args):
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT)

def capture(name):
    adb("shell", "uiautomator", "dump", "/sdcard/form-ui.xml")
    raw = adb("shell", "cat", "/sdcard/form-ui.xml")
    (OUT / (name + ".xml")).write_bytes(raw)
    (OUT / (name + ".png")).write_bytes(adb("exec-out", "screencap", "-p"))
    return ET.fromstring(raw)

def labels(root):
    return [n.get("text", "") + " " + n.get("content-desc", "") for n in root.iter("node")]

def wait_for(text, name):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        root = capture(name)
        if any(text in label for label in labels(root)):
            return root
        time.sleep(2)
    raise AssertionError("Visible UI never showed: " + text)

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
    adb("install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk")
    adb("logcat", "-c")
    adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
    root = wait_for("오늘", "01-home")
    results.append("native home rendered")
    for control, expected, name in [
        ("루틴", "새 루틴", "02-routines"),
        ("기록", "기록", "03-history"),
        ("내 정보", "화면 스타일", "04-settings"),
    ]:
        tap_exact(control, root)
        root = wait_for(expected, name)
        results.append(control + " navigation rendered")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
    wait_for("오늘", "05-relaunch")
    results.append("encrypted database reload rendered home")
    logs = adb("logcat", "-d").decode("utf-8", errors="replace")
    if "FATAL EXCEPTION" in logs or "JavascriptException" in logs:
        raise AssertionError("Runtime exception found; inspect logcat")
finally:
    (OUT / "logcat.txt").write_bytes(adb("logcat", "-d"))
    (OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False))
