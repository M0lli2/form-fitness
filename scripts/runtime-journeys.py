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

def seek(label, name, swipe_x=.5):
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
        adb("shell", "input", "swipe", str(int(width*swipe_x)), str(int(height*.78)),
            str(int(width*swipe_x)), str(int(height*.38)), "400")
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
    # Bring the whole card above the floating bar before tapping a weekday.
    viewport = next(root.iter("node")).get("bounds", "")
    _, _, viewport_width, viewport_height = map(int, re.findall(r"\d+", viewport))
    adb("shell", "input", "swipe", str(viewport_width//2), str(int(viewport_height*.80)),
        str(viewport_width//2), str(int(viewport_height*.47)), "460")
    time.sleep(.6)
    root = wait_for("이번 주 · 운동 0회", "10-home-week-volume")
    # Select a visible weekday by its accessible name without relying on a fixed date.
    weekday = next((node.get("content-desc") for node in root.iter("node")
                    if re.match(r"^[월화수목금토일]요일 ", node.get("content-desc", ""))
                    and find(root, node.get("content-desc")) is not None), None)
    if weekday is None:
        raise AssertionError("No visible weekday to open daily volume")
    tap_exact(weekday, root)
    root = seek("이날 저장한 운동이 없습니다.", "10-home-day-volume")
    results.append("tapping a weekday switches weekly volume to that day's result")
    tap_exact("내 정보", root)
    root = wait_for("화면 스타일", "11-settings")
    tap_exact("라이트", root)
    root = selected("라이트", "12-light")
    tap_exact("다크", root)
    root = selected("다크", "13-dark")
    # Keep both settings away from the floating tabs when checking their horizontal alignment.
    adb("shell", "input", "swipe", str(viewport_width//2), str(int(viewport_height*.80)),
        str(viewport_width//2), str(int(viewport_height*.43)), "460")
    time.sleep(.6)
    root = seek("휴식 시간 늘리기", "13-settings-steppers")
    def horizontal_bounds(label):
        node = find(root, label)
        if node is None:
            raise AssertionError("Missing stepper control: " + label)
        left, _, right, _ = map(int, re.findall(r"\d+", node.get("bounds", "")))
        return (left, right)
    for suffix in (" 줄이기", " 늘리기"):
        if horizontal_bounds("주간 목표" + suffix) != horizontal_bounds("휴식 시간" + suffix):
            raise AssertionError("Stepper button columns are misaligned: " + suffix)
    results.append("weekly goal and rest duration stepper buttons align horizontally")
    # Return to the appearance controls to continue the original persistence journey.
    adb("shell", "input", "swipe", str(viewport_width//2), str(int(viewport_height*.30)),
        str(viewport_width//2), str(int(viewport_height*.85)), "350")
    root = wait_for("Liquid Glass 효과", "13-appearance-restored")
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
    tap_exact("빈 운동 시작", root)
    root = wait_for("준비 중 · 0:00", "20-blank-prepared")
    if find(root, "일시정지") is not None:
        raise AssertionError("Blank workout started before tapping its start button")
    tap_exact("운동 추가", root)
    root = wait_for("푸시업", "20-blank-picker")
    tap_exact("푸시업", root)
    root = seek("이 운동 추가", "20-blank-add-exercise")
    tap_exact("이 운동 추가", root)
    weight, repetitions = "푸시업 1세트 중량", "푸시업 1세트 횟수"
    root = seek(weight, "20-blank-weight")
    tap_exact(weight, root)
    adb("shell", "input", "keyevent", "123")
    adb("shell", "input", "keyevent", "67")
    adb("shell", "input", "text", "42")
    root = seek(repetitions, "20-blank-repetitions")
    tap_exact(repetitions, root)
    # The compact editor places both fields above the numeric keyboard.
    time.sleep(.5)
    adb("shell", "input", "keyevent", "4")
    root = seek("+ 세트 추가", "20-blank-set-add", swipe_x=.08)
    tap_exact("+ 세트 추가", root)
    root = seek("푸시업 4세트 중량", "20-blank-added-set", swipe_x=.08)
    if find(root, "준비 중 · 0:00") is None or find(root, "푸시업 1세트 완료") is not None:
        raise AssertionError("The prepared timer or completion state changed")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
    root = wait_for("준비한 운동 열기", "20-blank-reopened")
    tap_exact("루틴", root)
    root = wait_for("준비 중 · 0:00", "20-blank-preparation-restored")
    root = seek(weight, "20-blank-edits-restored")
    if find(root, weight).get("text") != "42":
        raise AssertionError("Draft weight was not restored")
    tap_exact("운동 시작", root)
    root = wait_for("일시정지", "20-blank-running")
    root = seek("푸시업 1세트 완료", "20-blank-edits-running")
    if find(root, weight).get("text") != "42":
        raise AssertionError("Starting the timer changed the draft value")
    tap_exact("일시정지", root)
    root = wait_for("일시정지됨", "20-blank-paused")
    tap_exact("계속하기", root)
    root = wait_for("일시정지", "20-blank-resumed")
    tap_exact("운동 종료", root)
    root = wait_for("기록 없이 종료", "20-blank-stop")
    tap_exact("기록 없이 종료", root)
    root = wait_for("새 루틴", "20-blank-closed")
    results.append("blank workout restores its preparation at zero, then starts, pauses, resumes and ends on command")
    tap_exact("운동도감", root)
    root = wait_for("운동 목록", "21-library")
    root = wait_for("타깃 근육", "21-muscle-filter")
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
    root = seek("일시정지", "27-pause")
    tap_exact("일시정지", root)
    root = wait_for("일시정지됨", "27-workout-paused")
    tap_exact("계속하기", root)
    root = seek("운동 종료", "28-stop")
    tap_exact("운동 종료", root)
    root = wait_for("저장하고 종료", "28-stop-confirmation")
    tap_exact("저장하고 종료", root)
    root = wait_for("오늘의 운동을 기록했습니다", "29-saved-alert")
    # React Native confirmation alerts are not necessarily cancelable with Android Back.
    for label in ("확인", "OK"):
        if find(root, label) is not None:
            tap_exact(label, root)
            break
    else:
        raise AssertionError("Saved-workout confirmation button missing")
    root = wait_for("최근 6주 운동 볼륨", "30-history")
    root = seek("이번 주 근육 볼륨", "30-muscle-heatmap")
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
