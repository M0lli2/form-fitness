import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogPartMuscles, completedSets, exerciseMuscleWeights, HEAT_ALPHA, heatLevel, setVolume, weeklyMuscleLoad} from '../src/volume.mjs';
import {muscles, muscleRoles} from '../src/muscle-map.mjs';

const NOW = new Date(2026, 10, 19, 13, 0, 0);      // 2026-11-19 목요일 오후
const daysAgo = days => new Date(2026, 10, 19 - days, 9, 0, 0).toISOString();
const set = (weight, reps, extra = {}) => ([{id: 's' + Math.random(), weight, reps, seconds: 30, distance: 0, rpe: '', kind: 'normal', done: true, ...extra}]);
const exercise = (id, muscle, sets) => ({id, name: id, type: 'strength', muscle, sets});
const session = (startedAt, exercises) => ({id: 'h' + Math.random(), name: '운동', startedAt, endedAt: startedAt, restEndsAt: null, exercises});
const row = (load, id) => load.muscles.find(r => r.id === id);

test('기록이 없으면 0세트 16근육으로 시작한다', () => {
  const load = weeklyMuscleLoad([], NOW);
  assert.equal(load.hasData, false);
  assert.equal(load.sessions, 0);
  assert.equal(load.totalSets, 0);
  assert.equal(load.totalVolume, 0);
  assert.equal(load.muscles.length, muscles.length);
  assert.deepEqual(load.top, []);
  assert.equal(load.untrained.length, muscles.length);
  assert.equal(new Date(load.start).getDate(), 13);        // 오늘 포함 7일
  assert.equal(weeklyMuscleLoad(undefined, NOW).hasData, false);
});

test('완료 세트를 주동근 1, 보조근 0.5로 나눠 세트와 볼륨을 센다', () => {
  const load = weeklyMuscleLoad([session(daysAgo(1), [exercise('squat', '하체', set(100, 10).concat())])], NOW);
  // squat 세트 1개: 주동근 quads·glute 1세트, 보조근 4곳 0.5세트
  assert.equal(row(load, 'quads').sets, 1);
  assert.equal(row(load, 'glute').sets, 1);
  assert.equal(row(load, 'hamstrings').sets, .5);
  assert.equal(row(load, 'abs').sets, .5);
  assert.equal(load.totalSets, 4);
  assert.equal(row(load, 'quads').volume, 1000);
  assert.equal(row(load, 'hamstrings').volume, 500);
  assert.equal(load.totalVolume, 4000);
  assert.equal(row(load, 'quads').primarySets, 1);
  assert.equal(row(load, 'hamstrings').secondarySets, 1);
  assert.equal(row(load, 'quads').level, 1);
  assert.equal(row(load, 'hamstrings').level, .5);
  assert.deepEqual(load.top.slice(0, 2), ['quads', 'glute']);
  assert.equal(load.top.length, 3);
});

test('워밍업·미완료 세트와 7일 밖 기록은 빼고 센다', () => {
  const load = weeklyMuscleLoad([
    session(daysAgo(1), [exercise('curl', '팔', [
      ...set(10, 10, {kind: 'warmup'}),
      ...set(10, 10, {done: false}),
      ...set(10, 10),
    ])]),
    session(daysAgo(8), [exercise('curl', '팔', set(10, 10))]),
    session(new Date(2026, 10, 20, 9).toISOString(), [exercise('curl', '팔', set(10, 10))]),
  ], NOW);
  assert.equal(load.sessions, 1);
  assert.equal(row(load, 'biceps').sets, 1);
  assert.equal(load.totalVolume, 100 + 50 + 50);          // biceps 100, forearm·delt-front 각 50
});

test('3D 매핑이 없는 운동은 운동도감 부위명으로 집계한다', () => {
  for (const ids of Object.values(catalogPartMuscles)) {
    for (const id of ids) assert.ok(muscles.some(m => m.id === id), id);
  }
  const load = weeklyMuscleLoad([session(daysAgo(2), [
    exercise('custom-press', '가슴', set(40, 10)),
    exercise('treadmill', '유산소', set(0, 0)),
  ])], NOW);
  assert.equal(row(load, 'pec').sets, 1);
  assert.equal(load.totalSets, 1);
  assert.equal(exerciseMuscleWeights({id: 'custom-press', muscle: '가슴'}).length, 1);
  assert.deepEqual(exerciseMuscleWeights({id: 'treadmill', muscle: '유산소'}), []);
  assert.deepEqual(exerciseMuscleWeights(undefined), []);
});

test('맨몸 세트는 세트만 세고 볼륨은 0으로 둔다', () => {
  const load = weeklyMuscleLoad([session(daysAgo(3), [exercise('pushup', '가슴', set(0, 15))])], NOW);
  assert.equal(row(load, 'pec').sets, 1);
  assert.equal(row(load, 'pec').volume, 0);
  assert.equal(load.hasData, true);
  assert.equal(setVolume({weight: 0, reps: 10}), 0);
  assert.equal(setVolume({weight: 20, reps: 0}), 0);
});

test('세트를 많이 쓴 근육이 top에 오고 share 합은 1이다', () => {
  const load = weeklyMuscleLoad([
    session(daysAgo(1), [exercise('squat', '하체', [...set(100, 5), ...set(100, 5)])]),
    session(daysAgo(2), [exercise('curl', '팔', set(10, 10))]),
  ], NOW);
  assert.equal(load.top.length, 3);
  assert.ok(load.muscles.every(r => r.share >= 0 && r.share <= 1));
  assert.ok(Math.abs(load.muscles.reduce((sum, r) => sum + r.share, 0) - 1) < 1e-9);
  assert.equal(row(load, 'quads').level, 1);
  assert.equal(row(load, 'quads').sets, 2);
  assert.ok(load.untrained.includes('soleus'));
  assert.ok(!load.untrained.includes('biceps'));
});

test('완료 세트 추출은 운동과 세트를 함께 돌려준다', () => {
  const s = session(daysAgo(1), [exercise('squat', '하체', [...set(60, 10), ...set(60, 10, {done: false})])]);
  const rows = completedSets(s);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].exercise.id, 'squat');
  assert.equal(rows[0].set.reps, 10);
  assert.deepEqual(completedSets(null), []);
});

test('색 단계는 사용량이 늘수록 한 단계씩 진해진다', () => {
  assert.equal(heatLevel(0), 0);
  assert.equal(heatLevel(-1), 0);
  assert.equal(heatLevel(Number.NaN), 0);
  assert.equal(heatLevel(.1), 1);
  assert.equal(heatLevel(.3), 2);
  assert.equal(heatLevel(.6), 3);
  assert.equal(heatLevel(1), 4);
  assert.equal(HEAT_ALPHA.length, 5);
  for (let i = 1; i < HEAT_ALPHA.length; i++) assert.ok(HEAT_ALPHA[i] > HEAT_ALPHA[i - 1]);
});

test('모든 3D 운동은 주동근·보조근 가중치를 돌려준다', () => {
  for (const id of Object.keys(muscleRoles)) {
    const weights = exerciseMuscleWeights({id, muscle: '하체'});
    assert.equal(weights.length, muscleRoles[id].primary.length + muscleRoles[id].secondary.length);
    assert.ok(weights.filter(w => w.weight === 1).length === muscleRoles[id].primary.length);
  }
});
