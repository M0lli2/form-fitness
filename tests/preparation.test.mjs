import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSession, prepareSession, prepareWorkout, beginPreparedWorkout, workoutElapsedSeconds, toggleWorkoutPause, closeWorkout} from '../src/core.mjs';

const {exercises, routines} = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url)));
const byId = id => exercises.find(entry => entry.id === id);

// IMG_9257·IMG_9258: 루틴·추천 구성에서 들어가도 타이머는 사용자가 시작할 때만 돕니다.
test('루틴으로 들어가도 준비 상태에서 멈추고 운동 시작에 타이머가 돈다', () => {
    const routine = routines[0];
    const session = prepareSession(routine.name, routine.ids.map(byId).filter(Boolean));
    assert.equal(session.preparing, true);
    assert.equal(session.name, routine.name);
    assert.equal(session.exercises.length, routine.ids.length);
    // 준비 중에는 몇 분이 지나도 0:00이고, 일시정지·종료로 기록할 수 없습니다.
    assert.equal(workoutElapsedSeconds(session, Date.now() + 600000), 0);
    assert.equal(toggleWorkoutPause(session).preparing, true);
    assert.throws(() => closeWorkout(session));
    // 운동 시작을 누른 시점이 기록의 시작 시각입니다.
    const started = beginPreparedWorkout(session, 1000);
    assert.equal(started.preparing, undefined);
    assert.equal(Date.parse(started.startedAt), 1000);
    assert.equal(workoutElapsedSeconds(started, 61000), 60);
    // 이미 시작한 세션을 다시 시작해도 시작 시각을 되돌리지 않습니다.
    assert.equal(Date.parse(beginPreparedWorkout(started, 50000).startedAt), 1000);
});

test('준비 세션에도 이전 기록의 무게와 세트 수가 채워져 확인·수정할 수 있다', () => {
    const pushup = byId('pushup');
    const previous = makeSession('지난 운동', [pushup]);
    previous.exercises[0].sets.forEach((set, index) => Object.assign(set, {weight: 40 + index, reps: 9, done: true}));
    const prepared = prepareSession('상체에 집중하는 날', [pushup], [previous]);
    assert.equal(prepared.preparing, true);
    assert.equal(prepared.exercises[0].sets.length, 3);
    assert.deepEqual(prepared.exercises[0].sets.map(set => set.weight), [40, 41, 42]);
    // 준비 화면의 세트는 아직 완료가 아닙니다.
    assert.equal(prepared.exercises[0].sets.every(set => set.done === false), true);
});

test('자유 운동 준비와 루틴 준비는 같은 preparing 흐름을 씁니다', () => {
    const blank = prepareWorkout();
    assert.equal(blank.preparing, true);
    assert.equal(blank.name, '자유 운동');
    assert.deepEqual(blank.exercises, []);
    assert.equal(prepareSession('1', [byId('bench')]).preparing, true);
    // 하위 호환: 예전에 저장한 세션에는 preparing 플래그가 없습니다.
    assert.equal(makeSession('t', []).preparing, undefined);
});
