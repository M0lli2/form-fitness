// 실제 데이터 손실·중복 기록·단위 계산을 방지하는 도메인 테스트입니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeSession, validateSession, volume, validateBody, estimated1RM, applyWatchCommand, validateBackup, weekStart } from '../src/core.mjs';
const { exercises, routines } = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url)));
test('운동 ID와 루틴 참조는 유효하고 모든 운동에 자세 설명이 있다', () => { assert.equal(new Set(exercises.map(e => e.id)).size, exercises.length); for (const e of exercises) {
    assert.ok(e.steps.length >= 3);
    assert.ok(e.caution.length > 0);
} for (const r of routines)
    for (const id of r.ids)
        assert.ok(exercises.some(e => e.id === id)); });
test('완료되지 않은 운동은 저장할 수 없다', () => { assert.throws(() => validateSession(makeSession('test', [exercises[0]]))); });
test('워밍업은 볼륨에서 제외하고 미완료 세트는 계산하지 않는다', () => { const s = makeSession('test', [exercises[0]]); s.exercises[0].sets.forEach((x, i) => Object.assign(x, { weight: 50, reps: 10, done: i < 2, kind: i === 0 ? 'warmup' : 'normal' })); assert.equal(volume(s), 500); });
test('중량·횟수·시간의 잘못된 값은 저장 전에 거절한다', () => { const s = makeSession('test', [exercises[0]]); Object.assign(s.exercises[0].sets[0], { done: true, weight: -1 }); assert.throws(() => validateSession(s)); s.exercises[0].sets[0].weight = 50; s.exercises[0].sets[0].reps = 0; assert.throws(() => validateSession(s)); });
test('인바디 체지방은 백분율 단위로 유지하고 골격근량은 별도로 보관한다', () => { const b = validateBody({ date: '2026-01-01', weight: '72.4', bodyFat: '18.6', muscle: '34.2' }); assert.equal(b.bodyFat, 18.6); assert.equal(b.muscle, 34.2); assert.equal(b.weight, 72.4); });
test('미래 날짜·비정상 수치·공백 체중은 거절한다', () => { for (const input of [{ weight: '' }, { weight: 'NaN' }, { weight: 72, muscle: 90 }, { weight: 72, bodyFat: 101 }, { weight: 72, date: '2999-01-01' }])
    assert.throws(() => validateBody({ date: '2026-01-01', ...input })); });
test('이전 기록을 복원하되 완료 체크는 초기화한다', () => { const first = makeSession('a', [exercises[0]]); first.exercises[0].sets[0].weight = 42; first.exercises[0].sets[0].done = true; const next = makeSession('b', [exercises[0]], [first]); assert.equal(next.exercises[0].sets[0].weight, 42); assert.equal(next.exercises[0].sets[0].done, false); assert.notEqual(first.id, next.id); });
test('워치의 동일 이벤트와 오래된 세션 명령은 중복 반영하지 않는다', () => { const session = makeSession('a', [exercises[0]]); const cmd = { id: 'event-1', sessionId: session.id, exerciseId: exercises[0].id, setId: session.exercises[0].sets[0].id, action: 'completeSet' }; const result = applyWatchCommand(session, cmd, []); assert.equal(result.accepted, true); assert.equal(session.exercises[0].sets[0].done, false); assert.equal(applyWatchCommand(result.session, cmd, ['event-1']).accepted, false); assert.equal(applyWatchCommand(session, { ...cmd, sessionId: 'stale' }, []).accepted, false); assert.equal(applyWatchCommand(result.session, { ...cmd, id: 'event-2' }, []).accepted, false); });
test('1RM은 12회 이하 유효 중량만 계산한다', () => { assert.equal(estimated1RM(100, 3), 110.00000000000001); assert.equal(estimated1RM(100, 20), null); assert.equal(estimated1RM(0, 5), null); });
test('백업 스키마와 잘못된 기록을 거절한다', () => { assert.throws(() => validateBackup({ schema: 2 })); assert.throws(() => validateBackup({ schema: 1, history: [{}], body: [], routines: [] })); assert.equal(validateBackup({ schema: 1, history: [], body: [], routines }).schema, 1); });
test('주간 시작은 지역 시간 월요일 0시이다', () => { const date = weekStart(new Date(2026, 10, 22, 18)); assert.equal(date.getDay(), 1); assert.equal(date.getHours(), 0); assert.equal(date.getDate(), 16); });
