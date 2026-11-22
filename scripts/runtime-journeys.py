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

def tap_visible(label, name, tries=8):
    """Scroll a labelled control into the visible band before tapping it.

    Accessibility nodes stay in the dump when they are scrolled below the fold, so tapping their
    bounds would miss and a following Back press would leave the app instead of closing the keyboard.
    """
    for _ in range(tries):
        root = capture(name)
        node = find(root, label)
        bounds = list(map(int, re.findall(r"\d+", next(root.iter("node")).get("bounds", ""))))
        if len(bounds) != 4:
            raise AssertionError("Missing viewport bounds")
        _, _, width, height = bounds
        if node is not None:
            x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds", "")))
            if y1 >= int(height*.08) and y2 <= int(height*.70):
                tap_exact(label, root)
                return root
            x = str(int(width*.08))
            if y2 > int(height*.70):
                adb("shell", "input", "swipe", x, str(int(height*.66)), x, str(int(height*.42)), "300")
            else:
                adb("shell", "input", "swipe", x, str(int(height*.42)), x, str(int(height*.66)), "300")
            time.sleep(.5)
            continue
        x = str(int(width*.08))
        adb("shell", "input", "swipe", x, str(int(height*.78)), x, str(int(height*.38)), "400")
        time.sleep(.5)
    raise AssertionError("Control could not be scrolled into view: " + label)

def reveal(label, name, attempts=8):
    # Find a control that belongs at the top of a screen the list was already scrolled past.
    for _ in range(attempts):
        try:
            root = capture(name)
        except (ET.ParseError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            time.sleep(.5)
            continue
        if find(root, label) is not None:
            return root
        bounds = list(map(int, re.findall(r"\d+", next(root.iter("node")).get("bounds", ""))))
        if len(bounds) != 4:
            raise AssertionError("Missing viewport bounds")
        _, _, width, height = bounds
        x = str(int(width*.08))
        adb("shell", "input", "swipe", x, str(int(height*.38)), x, str(int(height*.78)), "400")
        time.sleep(.5)
    raise AssertionError("Control not visible after scrolling up: " + label)

def reveal_model(root):
    # Move the whole figure above the floating tabs before taking its screenshot.
    _, _, width, height = map(int, re.findall(r"\d+", next(root.iter("node")).get("bounds", "")))
    x = str(int(width*.08))
    adb("shell", "input", "swipe", x, str(int(height*.78)), x, str(int(height*.37)), "460")
    time.sleep(.6)

def find_switch(root, label):
    for node in root.iter("node"):
        if node.get("content-desc") == label and "Switch" in node.get("class", ""):
            bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
            if len(bounds) == 4 and bounds[2] > bounds[0]:
                return node
    return None

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
    root = tap_visible(weight, "20-blank-weight")
    adb("shell", "input", "keyevent", "123")
    adb("shell", "input", "keyevent", "67")
    adb("shell", "input", "text", "42")
    root = tap_visible(repetitions, "20-blank-repetitions")
    # The compact editor places both fields above the numeric keyboard.
    time.sleep(.5)
    adb("shell", "input", "keyevent", "4")
    root = tap_visible("+ 세트 추가", "20-blank-set-add")
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
    # A routine card opens the same preparation at 0:00, fills following sets, and hides its controls on demand.
    root = seek("기본에 충실한 전신 준비", "23-routine-card", swipe_x=.08)
    tap_exact("기본에 충실한 전신 준비", root)
    root = wait_for("준비 중 · 0:00", "23-routine-prepared")
    if find(root, "일시정지") is not None:
        raise AssertionError("Routine card started the timer before 운동 시작")
    if find(root, "기본에 충실한 전신") is None:
        raise AssertionError("Prepared routine name is missing")
    first_weight, third_weight = "고블릿 스쿼트 1세트 중량", "고블릿 스쿼트 3세트 중량"
    root = tap_visible(first_weight, "23-routine-weight")
    adb("shell", "input", "keyevent", "123")
    adb("shell", "input", "keyevent", "67")
    adb("shell", "input", "text", "22")
    # Closing the keyboard commits the number; the later sets must follow it.
    adb("shell", "input", "keyevent", "4")
    root = seek(third_weight, "23-routine-propagated", swipe_x=.08)
    if find(root, third_weight).get("text") != "22":
        raise AssertionError("Editing set 1 did not fill set 3 of the routine")
    results.append("a routine opens prepared at zero and a set edit fills the following sets")
    root = seek("운동 시작", "23-routine-start", swipe_x=.08)
    tap_exact("운동 시작", root)
    root = wait_for("일시정지", "23-routine-running")
    root = reveal("한 운동에 집중하기", "23-routine-focus")
    tap_exact("한 운동에 집중하기", root)
    root = wait_for("컨트롤 숨기기", "24-focused-controls")
    tap_exact("컨트롤 숨기기", root)
    root = wait_for("컨트롤 열기", "24-focused-compact")
    if find(root, "+ 세트 추가") is not None:
        raise AssertionError("Collapsed controls still show the full control box")
    tap_exact("컨트롤 열기", root)
    root = wait_for("컨트롤 숨기기", "24-focused-expanded")
    results.append("focused workout controls collapse to a compact bar and reopen")
    root = seek("전체 운동 목록", "24-focused-list", swipe_x=.08)
    tap_exact("전체 운동 목록", root)
    root = seek("운동 종료", "24-routine-stop")
    tap_exact("운동 종료", root)
    root = wait_for("기록 없이 종료", "24-routine-stop-confirmation")
    tap_exact("기록 없이 종료", root)
    root = wait_for("새 루틴", "24-routine-closed")
    tap_exact("운동도감", root)
    root = wait_for("운동 목록", "21-library")
    root = wait_for("타깃 근육", "21-muscle-filter")
    root = seek("근육 모형으로 찾기", "21-anatomy-open", swipe_x=.08)
    tap_exact("근육 모형으로 찾기", root)
    time.sleep(.5)
    reveal_model(root)
    root = seek("도감 근육 모형 · 앞면", "21-anatomy-front", swipe_x=.08)
    tap_exact("배면", root)
    time.sleep(.5)
    root = seek("도감 근육 모형 · 배면", "21-anatomy-back", swipe_x=.08)
    tap_exact("근육 모형 접기", root)
    root = wait_for("운동 목록", "21-anatomy-closed")
    # A catalog exercise without keyframes still shows the same anatomy in both views.
    root = seek("니 푸시업", "22-static-exercise")
    tap_exact("니 푸시업", root)
    root = seek("니 푸시업 근육 모형 · 앞면", "22-static-anatomy-front", swipe_x=.08)
    tap_exact("배면", root)
    root = seek("니 푸시업 근육 모형 · 배면", "22-static-anatomy-back", swipe_x=.08)
    tap_exact("닫기", root)
    root = wait_for("운동 목록", "22-static-exercise-closed")
    results.append("exercises without keyframes show the front and back anatomy")
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
    # The catalog entry also opens the preparation screen; the clock waits for 운동 시작.
    root = wait_for("준비 중 · 0:00", "24-guided-prepared")
    if find(root, "일시정지") is not None:
        raise AssertionError("Catalog entry started the timer before 운동 시작")
    root = seek("운동 시작", "24-guided-start", swipe_x=.08)
    tap_exact("운동 시작", root)
    root = wait_for("일시정지", "25-guided-running")
    root = reveal("한 운동에 집중하기", "25-guided-focus")
    tap_exact("한 운동에 집중하기", root)
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
    root = seek("이번 주 근육 볼륨", "30-muscle-title")
    reveal_model(root)
    root = seek("배면", "30-muscle-heatmap", swipe_x=.08)
    tap_exact("배면", root)
    time.sleep(.5)
    root = selected("배면", "30-muscle-heatmap-back")
    results.append("catalog and weekly muscle volume display the front and back anatomy")
    root = seek(exercise, "31-history-entry")
    results.append("exercise guide -> completed set -> saved workout is visible in history")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "monkey", "-p", PACKAGE, "-c", "android.intent.category.LAUNCHER", "1")
    root = wait_for("오늘", "32-relaunch-workout")
    tap_exact("기록", root)
    root = wait_for("최근 6주 운동 볼륨", "33-history-reload")
    root = seek(exercise, "34-persisted-workout")
    results.append("saved workout remains after process restart")
    # The same editor renames a bundled routine and turns its recommended switch off without saving.
    tap_exact("루틴", root)
    root = wait_for("새 루틴", "35-routines")
    root = tap_visible("기본에 충실한 전신 편집", "35-routine-edit")
    root = wait_for("이 루틴 삭제", "36-routine-editor")
    if find(root, "루틴 수정") is None:
        raise AssertionError("Bundled routine editor is missing its save action")
    switch = find_switch(root, "추천 루틴에 포함")
    if switch is None:
        raise AssertionError("Recommended switch is missing from the routine editor")
    before = switch.get("checked")
    x1, y1, x2, y2 = map(int, re.findall(r"\d+", switch.get("bounds", "")))
    adb("shell", "input", "tap", str((x1+x2)//2), str((y1+y2)//2))
    time.sleep(.8)
    root = capture("36-routine-editor-toggled")
    after = find_switch(root, "추천 루틴에 포함")
    if after is None or after.get("checked") == before:
        raise AssertionError("Recommended switch did not change in the routine editor")
    results.append("a bundled routine can be renamed, excluded from recommendations and deleted in the same editor")
    tap_exact("닫기", root)
    root = wait_for("새 루틴", "37-routine-editor-closed")
finally:
    (OUT / "journey-results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT / "journey-logcat.txt").write_bytes(adb("logcat", "-d"))
print(json.dumps(results, ensure_ascii=False))
