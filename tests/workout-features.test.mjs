// 0.3.5 신규 기능: 순서 변경·슈퍼세트·대체 운동·성장 그래프·PR·원판 계산·도감 필터 회귀 테스트.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeSession, parseRpe, volume} from '../src/core.mjs';
import {applyPreviousSets, cycleSetKind, exerciseGrowth, exercisePosition, historyPrFlags, libraryPool, lineGeometry,
  massStep, moveExercise, moveItem, nextExercise, normalizeFavorites, personalBest, plateMath,
  previousHints, recentExerciseIds, replaceExercise, sessionSummary, substitutionCandidates,
  supersetGroups, supersetLabel, toggleFavorite, toggleSuperset, weeklyProgress} from '../src/workout-features.mjs';

const catalog = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url), 'utf8')).exercises;
const byId = id => catalog.find(entry => entry.id === id);
function session(id, startedAt, rows, endedAt) {
  return {
    id, name: 'test', startedAt,
    endedAt: endedAt ?? new Date(Date.parse(startedAt) + 3600000).toISOString(),
    restEndsAt: null,
    exercises: rows.map(([exerciseId, sets]) => ({
      id: exerciseId, name: byId(exerciseId)?.name ?? exerciseId, type: 'strength',
      muscle: byId(exerciseId)?.muscle ?? '가슴', note: '',
      sets: sets.map((set, index) => ({
        id: `${exerciseId}-${index}`, weight: set.weight, reps: set.reps, seconds: 30, distance: 0,
        rpe: set.rpe ?? '', kind: set.kind ?? 'normal', done: set.done !== false,
      })),
    })),
  };
}

test('순서 변경은 위·아래 한 칸씩만 옮기고 경계에서는 그대로 둔다', () => {
  const list = ['a', 'b', 'c'];
  assert.deepEqual(moveItem(list, 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(list, 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(list, 0, 9), list);
  const s = makeSession('test', [byId('bench'), byId('squat'), byId('deadlift')]);
  const moved = moveExercise(s, byId('squat').id, -1);
  assert.deepEqual(moved.exercises.map(item => item.id), ['squat', 'bench', 'deadlift']);
  assert.equal(exercisePosition(moved, 'squat'), 1);
  assert.deepEqual(moveExercise(moved, 'squat', -1).exercises.map(item => item.id), ['squat', 'bench', 'deadlift']);
});

test('슈퍼세트는 앞 종목과 묶고, 같은 묶음은 번갈아 다음 종목을 고른다', () => {
  const s = makeSession('test', [byId('bench'), byId('squat'), byId('deadlift')]);
  const grouped = toggleSuperset(s, 'squat');
  assert.equal(supersetLabel(grouped, 'bench'), 'A');
  assert.equal(supersetLabel(grouped, 'squat'), 'A');
  assert.equal(supersetGroups(grouped).get('A').length, 2);
  assert.equal(nextExercise(grouped, 'bench').id, 'squat');
  const benchDone = {...grouped, exercises: grouped.exercises.map(item => item.id === 'bench'
    ? {...item, sets: item.sets.map(set => ({...set, done: true}))} : item)};
  assert.equal(nextExercise(benchDone, 'squat').id, 'deadlift');
  const ungrouped = toggleSuperset(grouped, 'bench');
  assert.equal(supersetLabel(ungrouped, 'bench'), null);
  assert.equal(supersetLabel(ungrouped, 'squat'), null);
});

test('슈퍼세트 한쪽을 풀면 남은 한 종목의 표시도 지운다', () => {
  const s = makeSession('test', [byId('bench'), byId('squat')]);
  const grouped = toggleSuperset(s, 'squat');
  const released = toggleSuperset(grouped, 'squat');
  assert.equal(supersetLabel(released, 'bench'), null);
  assert.equal(supersetLabel(released, 'squat'), null);
});

test('대체 운동은 같은 부위를 먼저 추천하고 세션에 있는 종목은 빼며 근육을 이어받는다', () => {
  const s = makeSession('test', [byId('bench')]);
  const candidates = substitutionCandidates(catalog, byId('bench'), s, {limit: 8});
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(item => item.id !== 'bench' && item.type === 'strength'));
  assert.equal(candidates[0].muscle, '가슴');
  const replaced = replaceExercise(s, 'bench', candidates[0], []);
  assert.equal(replaced.exercises[0].id, candidates[0].id);
  assert.equal(replaced.exercises[0].name, candidates[0].name);
  assert.equal(replaced.exercises[0].sets.length, s.exercises[0].sets.length);
  assert.ok(replaced.exercises[0].sets.every(set => set.done === false));
});

test('대체 운동은 새 종목의 직전 기록을 세트 순서대로 채운다', () => {
  const history = [session('h1', '2026-11-01T10:00:00Z', [['db-bench', [{weight: 26, reps: 12}, {weight: 28, reps: 10}]]])];
  const s = makeSession('test', [byId('bench')]);
  const replaced = replaceExercise(s, 'bench', byId('db-bench'), history);
  assert.deepEqual(replaced.exercises[0].sets.map(set => [set.weight, set.reps]), [[26, 12], [28, 10], [28, 10]]);
});

test('직전 세트 기록은 세트 순서대로 돌려준다', () => {
  const history = [session('h1', '2026-11-01T10:00:00Z', [['bench', [{weight: 60, reps: 10}, {weight: 65, reps: 8}]]]),
    session('h2', '2026-10-01T10:00:00Z', [['bench', [{weight: 50, reps: 10}]]])];
  assert.deepEqual(previousHints(history, 'bench'), [{weight: 60, reps: 10}, {weight: 65, reps: 8}]);
  assert.equal(previousHints(history, 'squat'), null);
});

test('RPE는 선택 입력으로 1~10 소수를 받고 빈 값은 비워 둔다', () => {
  assert.equal(parseRpe(''), '');
  assert.equal(parseRpe(undefined), '');
  assert.equal(parseRpe('8'), '8');
  assert.equal(parseRpe('8,5'), '8.5');
  for (const invalid of ['0', '10.5', 'NaN']) assert.throws(() => parseRpe(invalid));
});

test('세트 종류는 일반·워밍업·드롭을 순환한다', () => {
  assert.equal(cycleSetKind('normal'), 'warmup');
  assert.equal(cycleSetKind('warmup'), 'drop');
  assert.equal(cycleSetKind('drop'), 'normal');
});

test('종목 성장 그래프는 세션별 추정 1RM·볼륨을 시간순으로 만든다', () => {
  const older = session('h1', '2026-11-01T10:00:00Z', [['bench', [{weight: 60, reps: 10}, {weight: 60, reps: 8, kind: 'warmup'}]]]);
  const newer = session('h2', '2026-11-08T10:00:00Z', [['bench', [{weight: 70, reps: 8}]]]);
  const rows = exerciseGrowth([newer, older], 'bench');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'h1');
  assert.equal(rows[0].volume, 600);
  assert.equal(rows[1].oneRm, 88.7);
  assert.equal(personalBest([newer, older], 'bench').value, 88.7);
  assert.deepEqual(exerciseGrowth([older], 'squat'), []);
});

test('PR은 이전 최고를 넘었을 때만 표시하고 첫 기록은 따로 표시한다', () => {
  const first = session('h1', '2026-11-01T10:00:00Z', [['bench', [{weight: 60, reps: 10}]]]);
  const same = session('h2', '2026-11-08T10:00:00Z', [['bench', [{weight: 60, reps: 10}]]]);
  const better = session('h3', '2026-11-15T10:00:00Z', [['bench', [{weight: 70, reps: 8}]]]);
  const flags = historyPrFlags([better, first, same]);
  assert.equal(flags.get('h1')[0].first, true);
  assert.equal(flags.has('h2'), false);
  assert.equal(flags.get('h3')[0].first, false);
  assert.equal(flags.get('h3')[0].previous, 80);
  assert.equal(flags.get('h3')[0].value, 88.7);
});

test('운동 완료 요약은 직전 볼륨 증감·PR·주간 목표를 함께 계산한다', () => {
  const before = session('h1', '2026-11-16T10:00:00Z', [['bench', [{weight: 60, reps: 10}]]]);
  const latest = session('h2', '2026-11-18T10:00:00Z', [['bench', [{weight: 70, reps: 8}]]]);
  const summary = sessionSummary([latest, before], latest, 3, new Date('2026-11-19T09:00:00'));
  assert.equal(summary.volume, 560);
  assert.equal(summary.previousVolume, 600);
  assert.equal(summary.volumeDelta, -40);
  assert.equal(summary.sets, 1);
  assert.equal(summary.prs.length, 1);
  assert.equal(summary.weekCount, 2);
  assert.equal(summary.weekPercent, 67);
  assert.deepEqual(weeklyProgress([latest, before], 4, new Date('2026-11-19T09:00:00')), {count: 2, goal: 4, percent: 50, volume: 1160});
});

test('원판 계산기는 20kg 바와 25·20·15·10·5·2.5·1.25kg로 양쪽을 채운다', () => {
  assert.deepEqual(plateMath(100).perSide, [25, 15]);
  assert.deepEqual(plateMath(140).perSide, [25, 25, 10]);
  assert.deepEqual(plateMath(102.5).perSide, [25, 15, 1.25]);
  assert.equal(plateMath(100).loaded, 100);
  assert.equal(plateMath(100).exact, true);
  assert.equal(plateMath(60, {barKg: 15}).perSide.join(','), '20,2.5');
  assert.equal(plateMath(21).remainder, 1);
  assert.equal(plateMath(21).exact, false);
  assert.equal(plateMath(100, {plates: [20, 10]}).perSide.join(','), '20,20');
  assert.throws(() => plateMath(0));
});

test('꺾은선 좌표는 값 범위 안에서 유한하고 x가 증가한다', () => {
  const geometry = lineGeometry([60, 62.5, null, 65], {width: 300, height: 100});
  assert.equal(geometry.points.length, 4);
  assert.equal(geometry.min, 60);
  assert.equal(geometry.max, 65);
  assert.equal(geometry.points[0].x, 0);
  assert.equal(geometry.points[3].x, 300);
  assert.equal(geometry.points[0].y, 100);
  assert.equal(geometry.points[3].y, 0);
  assert.equal(geometry.points[2].y, null);
  assert.ok(geometry.points.every(point => point.y === null || (point.y >= 0 && point.y <= 100)));
  const flat = lineGeometry([70, 70], {width: 100, height: 50});
  assert.equal(flat.points[0].y, 25);
  assert.deepEqual(lineGeometry([], {}), {points: [], min: 0, max: 0, width: 280, height: 100});
});

test('도감 빠른 보기는 즐겨찾기와 최근 순서를 지킨다', () => {
  const list = [byId('bench'), byId('squat'), byId('deadlift')];
  assert.deepEqual(libraryPool(list, 'favorite', {favorites: ['deadlift']}).map(item => item.id), ['deadlift']);
  assert.deepEqual(libraryPool(list, 'recent', {recent: ['squat', 'bench']}).map(item => item.id), ['squat', 'bench']);
  assert.equal(libraryPool(list, 'all').length, 3);
  const history = [session('h1', '2026-11-01T10:00:00Z', [['bench', [{weight: 60, reps: 10}]], ['squat', [{weight: 80, reps: 5}]]]),
    session('h2', '2026-11-05T10:00:00Z', [['squat', [{weight: 85, reps: 5}]]])];
  assert.deepEqual(recentExerciseIds(history, 2), ['squat', 'bench']);
  assert.deepEqual(toggleFavorite(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleFavorite(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(normalizeFavorites(['a', 'a', 3, null, 'b']), ['a', 'b']);
});

test('중량 빠른 조절 폭은 kg 2.5, lb 5이고 볼륨 계산은 그대로다', () => {
  assert.equal(massStep('kg'), 2.5);
  assert.equal(massStep('lb'), 5);
  const s = session('h1', '2026-11-01T10:00:00Z', [['bench', [{weight: 60, reps: 10}]]]);
  assert.equal(volume(s), 600);
});

test('지난 기록 채우기는 미완료 세트에 직전 무게·횟수를 옮기고 완료 세트는 지킨다', () => {
  const sets = [
    {id: 'a', weight: 0, reps: 10, done: true, kind: 'normal'},
    {id: 'b', weight: 0, reps: 10, done: false, kind: 'normal'},
    {id: 'c', weight: 0, reps: 10, done: false, kind: 'normal'},
  ];
  const previous = [{weight: 60, reps: 8}, {weight: 62.5, reps: 6}, {weight: 65, reps: 5}];
  const filled = applyPreviousSets(sets, previous);
  assert.equal(filled[0].weight, 0, '완료한 세트는 덮어쓰지 않는다');
  assert.deepEqual([filled[1].weight, filled[1].reps], [62.5, 6], '두 번째 세트는 직전 두 번째 기록을 따른다');
  assert.deepEqual([filled[2].weight, filled[2].reps], [65, 5]);
  assert.equal(filled[1].edited, true, '추천이 다시 덮어쓰지 않도록 edited를 남긴다');
  assert.equal(sets[1].weight, 0, '원본 배열은 바꾸지 않는다');
});

test('지난 기록 채우기는 세트가 더 많으면 마지막 기록을 반복하고, 기록이 없으면 그대로 둔다', () => {
  const sets = [{id: 'a', weight: 0, reps: 10, done: false}, {id: 'b', weight: 0, reps: 10, done: false}, {id: 'c', weight: 0, reps: 10, done: false}];
  const filled = applyPreviousSets(sets, [{weight: 40, reps: 12}]);
  assert.deepEqual(filled.map(set => set.weight), [40, 40, 40]);
  assert.deepEqual(applyPreviousSets(sets, null), sets);
  assert.deepEqual(applyPreviousSets(sets, []), sets);
  assert.deepEqual(applyPreviousSets([], [{weight: 40, reps: 12}]), []);
});
