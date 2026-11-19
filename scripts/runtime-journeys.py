"""Exercise saved preferences and an actual workout on a disposable emulator.
Uses only visible accessibility nodes; never injects app state or marks a failed assertion passed.
"""
import json
import re
import runpy
import time
import subprocess
import xml.etree.ElementTree as ET

api = runpy.run_path("scripts/runtime-smoke.py")
adb, capture, wait_for, tap_exact = [api[k] for k in ("adb", "capture", "wait_for", "tap_exact")]
OUT, PACKAGE = api["OUT"], api["PACKAGE"]
results = list(api["results"])

def find(root, label):
    for node in root.iter("node"):
        if node.get("visible-to-user", "true") != "true":
            continue
        if node.get("text") != label and node.get("content-desc") != label:
            continue
        bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
        # Clipped controls may be reported visible with inverted rectangles.
        if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
            return node
    return None

def seek(label, name):
    # Scroll only through the app; bound the search so a missing control fails.
    for attempt in range(12):
        try:
            root = capture(name)
        except (ET.ParseError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            time.sleep(.5)
            continue
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
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            root = capture(name)
        except (ET.ParseError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            time.sleep(.5)
            continue
        node = find(root, label)
        if node is not None and node.get(attribute) == "true":
            print("PASS: " + name, flush=True)
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
    tap_exact("운동도감", root)
    root = wait_for("운동 목록", "21-library")
    # Choose the first catalog exercise by its observed UI name.
    catalog = json.loads(open("src/exercises.json", encoding="utf-8").read())
    exercise = catalog["exercises"][0]["name"]
    root = seek(exercise, "22-exercise")
    tap_exact(exercise, root)
    root = wait_for("운동 자세 가이드", "23-guide")
    root = wait_for("3D 자세 가이드", "23-guide-3d")
    root = seek("동작 재생", "23-guide-play")
    tap_exact("동작 재생", root)
    root = wait_for("동작 반복 재생 중", "23-guide-playing")
    root = seek("일시 정지", "23-guide-pause")
    tap_exact("일시 정지", root)
    root = seek("회전", "23-guide-rotate")
    tap_exact("회전", root)
    root = wait_for("운동 관절과 장비의 3차원 자세, 오른쪽", "23-guide-rotated")
    root = seek("확대", "23-guide-zoom")
    tap_exact("확대", root)
    root = wait_for("축소", "23-guide-zoomed")
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
    # React Native confirmation alerts are not necessarily cancelable with Android Back.
    for label in ("확인", "OK"):
        if find(root, label) is not None:
            tap_exact(label, root)
            break
    else:
        raise AssertionError("Saved-workout confirmation button missing")
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
