import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSession, editSets, appendSet, previousSets, recommendation, recommendedRest, clampRest} from '../src/core.mjs';

const {exercises} = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url)));
const pushup = exercises.find(e => e.id === 'pushup');
const bench = exercises.find(e => e.id === 'bench');

const saved = (id, weights, {startedAt = '2026-11-01T09:00:00Z', endedAt = '2026-11-01T10:00:00Z'} = {}) => ({
    id, name: '기록', startedAt, endedAt,
    exercises: [{id, name: '운동', type: 'strength', muscle: '가슴',
        sets: weights.map((weight, index) => ({id: `${id}-${index}`, weight, reps: 10, done: true, kind: 'normal'}))}],
});

test('1세트를 고치면 아직 손대지 않은 뒤 세트가 같은 값으로 따라온다', () => {
    const session = makeSession('t', [pushup]);
    const sets = session.exercises[0].sets;
    assert.equal(sets.length, 3);
    editSets(sets, 0, {weight: 42});
    editSets(sets, 0, {reps: 8});
    assert.deepEqual(sets.map(set => [set.weight, set.reps]), [[42, 8], [42, 8], [42, 8]]);
});

test('직접 고친 세트와 이미 끝낸 세트는 자동 반영으로 덮어쓰지 않는다', () => {
    const sets = makeSession('t', [pushup]).exercises[0].sets;
    editSets(sets, 1, {weight: 30});
    sets[2].done = true;
    editSets(sets, 0, {weight: 50, reps: 6});
    assert.equal(sets[0].weight, 50);
    assert.equal(sets[1].weight, 30);
    assert.equal(sets[2].weight, 0);
    // 2세트를 다시 고치면 그 세트만 바뀌고 3세트는 그대로 둡니다.
    editSets(sets, 1, {weight: 32});
    assert.equal(sets[0].weight, 50);
    assert.equal(sets[1].weight, 32);
});

test('추가한 세트는 직전 세트의 중량·횟수를 그대로 이어받는다', () => {
    const sets = makeSession('t', [pushup]).exercises[0].sets;
    editSets(sets, 0, {weight: 60, reps: 12});
    sets[0].done = true;
    const next = appendSet(sets);
    assert.equal(next.length, 4);
    assert.equal(next[3].weight, 60);
    assert.equal(next[3].reps, 12);
    assert.equal(next[3].done, false);
    assert.notEqual(next[3].id, sets[0].id);
});

test('이전 기록은 가장 최근 완료 세션에서, 워밍업은 빼고 읽는다', () => {
    const older = saved('pushup', [40, 40, 40], {startedAt: '2026-11-01T09:00:00Z', endedAt: '2026-11-01T10:00:00Z'});
    const newer = saved('pushup', [55, 50, 50], {startedAt: '2026-11-10T09:00:00Z', endedAt: '2026-11-10T10:00:00Z'});
    newer.exercises[0].sets[0].kind = 'warmup';
    const history = [newer, older];
    assert.deepEqual(previousSets(history, 'pushup').sets, [{weight: 50, reps: 10}, {weight: 50, reps: 10}]);
    assert.deepEqual(recommendation(history, 'pushup'), {weight: 50, reps: 10, sets: 2, at: '2026-11-10T09:00:00Z'});
    assert.equal(recommendation(history, 'bench'), null);
});

test('추천 무게·횟수·세트 수가 새 운동의 초기 세트에 반영된다', () => {
    const history = [saved('pushup', [62.5, 60, 60])];
    const session = makeSession('t', [pushup, bench], history);
    const [sets, other] = session.exercises;
    assert.equal(sets.sets.length, 3);
    assert.deepEqual(sets.sets.map(set => [set.weight, set.reps]), [[62.5, 10], [60, 10], [60, 10]]);
    assert.equal(other.sets.length, 3);
    assert.equal(other.sets[0].weight, 0);
});

test('추천 휴식은 장비와 종류로 정하고 바벨·고중량은 120초를 쓴다', () => {
    assert.equal(recommendedRest(bench), 120);
    assert.equal(recommendedRest(pushup), 60);
    assert.equal(recommendedRest(exercises.find(e => e.equipment === '머신')), 90);
    assert.equal(recommendedRest(exercises.find(e => e.type === 'cardio')), 60);
    assert.equal(recommendedRest(exercises.find(e => e.muscle === '스트레칭')), 30);
    assert.equal(recommendedRest(pushup, {weight: 85}), 120);
});

test('휴식 시간은 직접 입력해도 15~600초 정수로 다듬는다', () => {
    assert.equal(clampRest('100'), 100);
    assert.equal(clampRest(47.6), 48);
    assert.equal(clampRest(5), 15);
    assert.equal(clampRest(5000), 600);
    assert.equal(clampRest('abc'), 90);
    assert.equal(clampRest(''), 90);
});
