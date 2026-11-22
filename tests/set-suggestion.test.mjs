import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSession, editSets, appendSet, previousSets, recommendation, recommendedRest, clampRest, goalRecommendation, roundLoad, trainingGoal, bodyStart, bodyTrend, parseInbodyText} from '../src/core.mjs';

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
    // 2세트를 고치면 뒤의 미완료·미수정 세트가 같은 값을 따라옵니다.
    editSets(sets, 1, {weight: 30});
    assert.deepEqual(sets.map(set => set.weight), [0, 30, 30]);
    sets[2].done = true;
    editSets(sets, 0, {weight: 50, reps: 6});
    assert.equal(sets[0].weight, 50);
    // 직접 고친 2세트는 1세트 값으로 덮이지 않고, 끝낸 3세트도 그대로 둡니다.
    assert.equal(sets[1].weight, 30);
    assert.equal(sets[2].weight, 30);
    editSets(sets, 1, {weight: 32});
    assert.equal(sets[0].weight, 50);
    assert.equal(sets[1].weight, 32);
    assert.equal(sets[2].weight, 30);
});

test('준비 화면에서 2세트에 입력한 값이 3·4세트로 이어진다(IMG_9256)', () => {
    const sets = [1, 2, 3, 4].map(number => ({id: 's' + number, weight: 0, reps: 10, seconds: 30,
        distance: 0, rpe: '', kind: 'normal', done: false}));
    // 준비 중 · 0:00 상태에서 1·2세트에 22kg을 입력한 경우
    editSets(sets, 0, {weight: 22});
    editSets(sets, 1, {weight: 22});
    assert.deepEqual(sets.map(set => set.weight), [22, 22, 22, 22]);
    // 2세트 횟수를 바꾸면 3·4세트도 따라옵니다.
    editSets(sets, 1, {reps: 8});
    assert.deepEqual(sets.map(set => set.reps), [10, 8, 8, 8]);
    // 뒤 세트를 직접 고친 뒤에는 그 세트를 건드리지 않습니다.
    editSets(sets, 3, {weight: 30});
    editSets(sets, 1, {weight: 25});
    assert.deepEqual(sets.map(set => set.weight), [22, 25, 25, 30]);
    // 시간·거리·RPE도 같은 규칙으로 전파합니다.
    const cardio = [{id: 'c1', seconds: 600, distance: 1, rpe: ''}, {id: 'c2', seconds: 0, distance: 0, rpe: ''}];
    editSets(cardio, 0, {seconds: 900, distance: 1.5, rpe: '7'});
    assert.deepEqual(cardio[1], {id: 'c2', seconds: 900, distance: 1.5, rpe: '7'});
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

test('추천 휴식은 목적과 장비에 따라 달라진다', () => {
    assert.equal(recommendedRest(bench), 120);
    assert.equal(recommendedRest(pushup), 90);
    assert.equal(recommendedRest(pushup, null, 'endurance'), 60);
    assert.equal(recommendedRest(pushup, null, 'strength'), 120);
    assert.equal(recommendedRest(bench, null, 'strength'), 180);
    assert.equal(recommendedRest(exercises.find(e => e.equipment === '머신')), 90);
    assert.equal(recommendedRest(exercises.find(e => e.type === 'cardio'), null, 'strength'), 60);
    assert.equal(recommendedRest(exercises.find(e => e.muscle === '스트레칭')), 30);
    assert.equal(recommendedRest(pushup, {weight: 85}), 120);
});

test('목적별 %1RM과 적재 단위로 무게를 계산한다', () => {
    assert.equal(roundLoad(44.6, '바벨'), 45);
    assert.equal(roundLoad(44.6, '덤벨'), 44);
    assert.equal(roundLoad(44.6, '맨몸'), 45);
    assert.equal(roundLoad(0, '바벨'), 0);
    assert.equal(trainingGoal('strength').percent, 0.85);
    assert.equal(trainingGoal('없는목적').id, 'hypertrophy');
    // 60kg × 10회 → 추정 1RM 80kg, 근비대 75% = 60kg
    const readme = [saved('pushup', [60, 60, 60])];
    const hypertrophy = goalRecommendation(readme, pushup, 'hypertrophy');
    assert.equal(hypertrophy.hasHistory, true);
    assert.equal(hypertrophy.oneRm, 80);
    assert.equal(hypertrophy.weight, 60);
    assert.equal(hypertrophy.reps, 10);
    assert.equal(hypertrophy.sets, 3);
    assert.match(hypertrophy.reason, /근비대\(75% 1RM\)/);
    // 스트렝스 85% = 68kg → 바벨 단위가 아니므로 68kg
    // 10회는 스트렝스 목표 범위(3~5회)를 넘겼으므로 점진적 과부하로 1kg 올립니다.
    const strength = goalRecommendation(readme, pushup, 'strength');
    assert.equal(strength.weight, 69);
    assert.equal(strength.reps, 4);
    assert.equal(strength.rest, 120);
    // 근지구력 60% = 48kg, 15회
    const endurance = goalRecommendation(readme, pushup, 'endurance');
    assert.equal(endurance.weight, 48);
    assert.equal(endurance.reps, 15);
});

test('목표 반복 상한을 넘기면 점진적 과부하로 한 단계 올린다', () => {
    const hard = [saved('pushup', [60, 60, 60])];
    hard[0].exercises[0].sets.forEach(set => { set.reps = 12; });
    // 60kg × 12회 → 1RM 84kg, 근비대 75% = 63kg, 12회는 10+2 이상이므로 +1kg
    assert.equal(goalRecommendation(hard, pushup, 'hypertrophy').weight, 64);
    // 기록이 없으면 목적별 반복·세트·휴식만 안내하고 무게는 0으로 둔다
    const first = goalRecommendation([], pushup, 'strength');
    assert.equal(first.hasHistory, false);
    assert.equal(first.weight, 0);
    assert.equal(first.sets, 4);
    assert.equal(first.rest, 120);
    assert.match(first.reason, /첫 기록/);
});

test('휴식 시간은 직접 입력해도 15~600초 정수로 다듬는다', () => {
    assert.equal(clampRest('100'), 100);
    assert.equal(clampRest(47.6), 48);
    assert.equal(clampRest(5), 15);
    assert.equal(clampRest(5000), 600);
    assert.equal(clampRest('abc'), 90);
    assert.equal(clampRest(''), 90);
});

test('기록이 없는 첫 운동은 최신 체성분으로 초기 무게를 제안한다', () => {
    const body = [{id: 'b1', date: '2026-11-01T09:00:00Z', weight: 80, bodyFat: 20, muscle: 35, height: 178, source: 'manual', note: '', photo: null}];
    const start = bodyStart(bench, body);
    // 제지방량 64kg × 벤치 계수 0.8 = 51.2kg
    assert.equal(start.lean, 64);
    assert.equal(start.oneRm, 51.2);
    const rec = goalRecommendation([], bench, 'hypertrophy', body);
    assert.equal(rec.source, 'body');
    assert.equal(rec.weight, 37.5);
    assert.match(rec.reason, /체성분|체중 80kg/);
    // 골격근량만 있으면 제지방량을 추정합니다(35kg × 1.6 = 56kg).
    const muscleOnly = bodyStart(bench, [{...body[0], bodyFat: undefined}]);
    assert.equal(muscleOnly.lean, 56);
    // 체성분 기록이 없으면 안내와 함께 안전한 기본값을 씁니다.
    const empty = goalRecommendation([], bench, 'hypertrophy', []);
    assert.equal(empty.source, 'none');
    assert.equal(empty.weight, 0);
    assert.match(empty.reason, /인바디/);
    // 이전 기록이 생기면 기록 기반 추정이 우선합니다.
    const history = [saved('bench', [60, 60, 60])];
    assert.equal(goalRecommendation(history, bench, 'hypertrophy', body).source, 'history');
});

test('신체 변화 추이는 입력한 측정 시점 그대로 정렬한다', () => {
    const body = [
        {id: 'c', date: '2026-11-21T08:00:00Z', weight: 70, muscle: 34, bodyFat: 16.5},
        {id: 'a', date: '2026-11-01T08:00:00Z', weight: 73, muscle: 33, bodyFat: 18.2},
        {id: 'b', date: '2026-11-10T08:00:00Z', weight: 71.5, muscle: 33.5, bodyFat: 17.4},
    ];
    const trend = bodyTrend(body, 12);
    assert.deepEqual(trend.points.map(point => point.id), ['a', 'b', 'c']);
    assert.deepEqual(trend.points.map(point => point.label), ['11/1', '11/10', '11/21']);
    assert.equal(trend.count, 3);
    assert.equal(trend.weight.first, 73);
    assert.equal(trend.weight.last, 70);
    assert.equal(trend.weight.delta, -3);
    assert.equal(trend.weight.deltaFromPrevious, -1.5);
    assert.equal(trend.bodyFat.last, 16.5);
    assert.equal(trend.muscle.deltaFromPrevious, 0.5);
    // 최근 N회만 그립니다.
    assert.deepEqual(bodyTrend(body, 2).points.map(point => point.id), ['b', 'c']);
    assert.equal(bodyTrend([]).count, 0);
    assert.equal(bodyTrend([]).weight, null);
});

test('인바디 텍스트에서 수치를 읽고 표준값은 건너뛴다', () => {
    const sheet = '인바디 결과지\n신장 178.0cm\n체중 72.4kg\n골격근량 33.2kg\n체지방량 12.8kg\n체지방률 17.7%';
    const parsed = parseInbodyText(sheet);
    assert.equal(parsed.height, 178);
    assert.equal(parsed.weight, 72.4);
    assert.equal(parsed.muscle, 33.2);
    assert.equal(parsed.bodyFat, 17.7);
    assert.equal(parsed.count, 4);
    // 표준체중·표준체지방 같은 기준값은 실제 측정값으로 쓰지 않습니다.
    const withStandard = '표준체중 66.0kg\n체중 72.4kg\n표준체지방량 10.1kg\n체지방량 12.8kg';
    assert.equal(parseInbodyText(withStandard).weight, 72.4);
    assert.equal(parseInbodyText(withStandard).fatMass, 12.8);
    assert.equal(parseInbodyText(withStandard).bodyFat, 17.7);
    // 체지방량만 있으면 체중으로 비율을 계산합니다.
    assert.equal(parseInbodyText('신장 178\n체중 72,4\n체지방량 12,8').bodyFat, 17.7);
    // 영문 결과지도 읽습니다.
    const english = parseInbodyText('Height 178.0\nWeight 72.4\nSkeletal Muscle Mass 33.2\nBody Fat 17.7');
    assert.equal(english.height, 178);
    assert.equal(english.weight, 72.4);
    assert.equal(english.muscle, 33.2);
    assert.equal(english.bodyFat, 17.7);
    // 아무 수치도 없으면 채울 항목이 없습니다.
    assert.equal(parseInbodyText('인바디').count, 0);
    assert.equal(parseInbodyText('').count, 0);
});
