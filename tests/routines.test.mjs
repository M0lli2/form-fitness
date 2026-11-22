import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recommendedRoutines, saveRoutine, removeRoutine, setRoutineRecommended, normalizeRoutine, validateBackup} from '../src/core.mjs';

const {exercises, routines} = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url)));
const bench = exercises.find(entry => entry.id === 'bench');
const pushup = exercises.find(entry => entry.id === 'pushup');

test('기본 제공 루틴은 추천에 포함되고, 사용자가 제외한 루틴만 빠진다', () => {
    const list = [...routines, {id: 'mine', name: '1', subtitle: '나만의 트레이닝', ids: [bench.id], recommended: false}];
    const included = recommendedRoutines(list);
    assert.equal(included.length, routines.length);
    assert.equal(included.some(routine => routine.id === 'mine'), false);
    // recommended가 없는 예전 루틴은 추천에 포함합니다.
    const legacy = [{id: 'old', name: '예전 루틴', subtitle: '나만의 트레이닝', ids: [pushup.id]}];
    assert.deepEqual(recommendedRoutines(legacy).map(routine => routine.id), ['old']);
    // 모두 제외하면 홈 추천 카드는 비고, 호출부는 자유 운동으로 안내합니다.
    assert.deepEqual(recommendedRoutines(legacy.map(routine => ({...routine, recommended: false}))), []);
    assert.deepEqual(recommendedRoutines(undefined), []);
    assert.equal(routines[0].recommended, true);
});

test('추천 구성도 이름·운동·추천 포함 여부를 그대로 고쳐 저장한다', () => {
    const original = routines[0];
    const edited = saveRoutine(routines, {...original, name: '월요일 상체', ids: [bench.id, pushup.id], recommended: false});
    const saved = edited.find(routine => routine.id === original.id);
    assert.equal(edited[0].id, original.id, '수정한 루틴은 목록 맨 앞으로 옵니다');
    assert.equal(saved.name, '월요일 상체');
    assert.deepEqual(saved.ids, [bench.id, pushup.id]);
    assert.equal(saved.recommended, false);
    assert.equal(edited.length, routines.length, '수정은 루틴 개수를 늘리지 않습니다');
    assert.equal(saved.subtitle, original.subtitle);
    // 새 루틴은 추천 포함이 기본이고, 이름을 직접 쓸 수 있습니다.
    const created = saveRoutine(edited, {name: '수요일 하체', ids: [bench.id]});
    assert.equal(created.length, routines.length + 1);
    assert.equal(created[0].name, '수요일 하체');
    assert.equal(created[0].recommended, true);
    assert.ok(created[0].id.startsWith('') && created[0].id.length > 5);
});

test('루틴 삭제는 그 루틴만 지우고 운동 기록은 건드리지 않는다', () => {
    const list = [...routines, {id: 'mine', name: '1', subtitle: '나만의 트레이닝', ids: [bench.id]}];
    const remaining = removeRoutine(list, routines[0].id);
    assert.equal(remaining.length, list.length - 1);
    assert.equal(remaining.some(routine => routine.id === routines[0].id), false);
    assert.equal(remaining.some(routine => routine.id === 'mine'), true);
    // 없는 ID를 지워도 목록은 그대로입니다.
    assert.deepEqual(removeRoutine(list, '없음'), list);
});

test('카드의 추천 포함 스위치는 순서와 내용을 바꾸지 않는다', () => {
    const list = [...routines];
    const off = setRoutineRecommended(list, routines[0].id, false);
    assert.equal(off[0].recommended, false);
    assert.deepEqual(off.map(routine => routine.id), list.map(routine => routine.id));
    assert.deepEqual(off[0].ids, list[0].ids);
    const on = setRoutineRecommended(off, routines[0].id, true);
    assert.equal(on[0].recommended, true);
    assert.equal(recommendedRoutines(on).length, routines.length);
});

test('이름이 비었거나 운동이 없는 루틴, 너무 긴 이름은 저장하지 않는다', () => {
    assert.throws(() => normalizeRoutine({name: '  ', ids: [bench.id]}), /이름/);
    assert.throws(() => normalizeRoutine({name: '빈 루틴', ids: []}), /운동/);
    assert.throws(() => normalizeRoutine({name: 'ㄱ'.repeat(41), ids: [bench.id]}), /40자/);
    // 같은 운동을 두 번 넣어도 한 번만 저장합니다.
    assert.deepEqual(normalizeRoutine({name: '중복', ids: [bench.id, bench.id]}).ids, [bench.id]);
    // 백업에 담긴 추천 여부는 boolean이어야 합니다.
    const base = {schema: 1, history: [], body: []};
    assert.equal(validateBackup({...base, routines: [{...routines[0], recommended: false}]}).routines.length, 1);
    assert.throws(() => validateBackup({...base, routines: [{...routines[0], recommended: '아니오'}]}), /루틴 형식/);
});
