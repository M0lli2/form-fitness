"""Exercise saved preferences and an actual workout on a disposable emulator.
Uses only visible accessibility nodes; never injects app state or marks a failed assertion passed.
"""
import json
import re
import runpy
import time

api = runpy.run_path("scripts/runtime-smoke.py")
adb, capture, wait_for, tap_exact = [api[k] for k in ("adb", "capture", "wait_for", "tap_exact")]
OUT, PACKAGE = api["OUT"], api["PACKAGE"]
results = list(api["results"])

def find(root, label):
    return next((n for n in root.iter("node") if n.get("text") == label or n.get("content-desc") == label), None)

def seek(label, name):
    # Scroll only through the app; bound the search so a missing control fails.
    for attempt in range(12):
        root = capture(name)
        node = find(root, label)
        if node is not None:
            return root
        bounds = list(map(int, re.findall(r"\d+", next(root.iter("node")).get("bounds", ""))))
        if len(bounds) != 4:
            raise AssertionError("Missing viewport bounds")
        _, _, width, height = bounds
        adb("shell", "input", "swipe", str(width//2), str(int(height*.78)),
            str(width//2), str(int(height*.38)), "400")
        time.sleep(.5)
    raise AssertionError("Control not visible after bounded scroll: " + label)

def selected(label, name, attribute="selected"):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        root = capture(name)
        node = find(root, label)
        if node is not None and node.get(attribute) == "true":
            return root
        time.sleep(.5)
    raise AssertionError(label + " did not retain " + attribute)

try:
    root = wait_for("오늘", "10-home")
    tap_exact("내 정보", root)
    root = wait_for("화면 스타일", "11-settings")
    tap_exact("라이트", root)
    root = selected("라이트", "12-light")
    tap_exact("다크", root)
    root = selected("다크", "13-dark")
    tap_exact("Liquid Glass 효과", root)
    root = selected("Liquid Glass 효과", "14-dark-glass", "checked")
    # Confirm persistence with a real write and a killed process, not just another home launch.
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
    root = wait_for("오늘", "15-relaunch")
    tap_exact("내 정보", root)
    root = selected("다크", "16-persisted-dark")
    root = selected("Liquid Glass 효과", "17-persisted-glass", "checked")
    results.append("light/dark selection and Glass preference survive process restart")
    tap_exact("라이트", root)
    root = selected("라이트", "18-light-glass")
    tap_exact("Liquid Glass 효과", root)
    root = wait_for("화면 스타일", "19-light-solid")
    tap_exact("루틴", root)
    root = wait_for("새 루틴", "20-routines")
    tap_exact("운동법 검색", root)
    root = wait_for("자세와 주의사항", "21-library")
    # Choose the first catalog exercise by its observed UI name.
    catalog = json.loads(open("src/exercises.json", encoding="utf-8").read())
    exercise = catalog["exercises"][0]["name"]
    root = seek(exercise, "22-exercise")
    tap_exact(exercise, root)
    root = wait_for("운동 자세 가이드", "23-guide")
    root = seek("이 운동 기록하기", "24-guide-start")
    tap_exact("이 운동 기록하기", root)
    root = seek("세트 완료", "25-workout")
    tap_exact("세트 완료", root)
    root = wait_for("2번째 세트", "26-completed-set")
    root = seek("전체 운동 목록", "27-workout-list")
    tap_exact("전체 운동 목록", root)
    root = seek("운동 마치고 저장", "28-save")
    tap_exact("운동 마치고 저장", root)
    root = wait_for("오늘의 운동을 기록했습니다", "29-saved-alert")
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    root = wait_for("최근 6주 운동 볼륨", "30-history")
    root = seek(exercise, "31-history-entry")
    results.append("exercise guide -> completed set -> saved workout is visible in history")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
    root = wait_for("오늘", "32-relaunch-workout")
    tap_exact("기록", root)
    root = wait_for("최근 6주 운동 볼륨", "33-history-reload")
    root = seek(exercise, "34-persisted-workout")
    results.append("saved workout remains after process restart")
finally:
    (OUT / "journey-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "journey-logcat.txt").write_bytes(adb("logcat", "-d"))
print(json.dumps(results, ensure_ascii=False))
