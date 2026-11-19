import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {exerciseTargets, filterExercises, groupChips, groupsForMuscles, matchesMuscleSelection,
  muscleChips, musclesOfGroup, resolveMuscleTerm, searchExercise} from '../src/muscle-filter.mjs';
import {muscleGroups, muscles} from '../src/muscle-map.mjs';

const catalog = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url), 'utf8')).exercises;
const byId = id => catalog.find(e => e.id === id);
const names = list => list.map(e => e.id);

test('큰 부위 그룹은 16개 근육을 모두 덮고 근육 id가 실제로 존재한다', () => {
  assert.equal(muscleGroups.length, 7);
  const ids = new Set(muscles.map(m => m.id));
  const covered = new Set();
  for (const group of muscleGroups) {
    assert.ok(group.muscles.length >= 1, group.id);
    for (const id of group.muscles) { assert.ok(ids.has(id), `${group.id}: ${id}`); covered.add(id); }
    assert.deepEqual(musclesOfGroup(group.id), group.muscles);
    assert.equal(typeof group.aliases[0], 'string');
  }
  assert.equal(covered.size, ids.size);
  assert.equal(new Set(muscleGroups.map(g => g.name)).size, 7);
  assert.equal(muscleChips().length, 16);
  assert.equal(groupChips().length, 7);
  assert.deepEqual(groupChips().map(g => g.name), ['가슴','등','어깨','팔','코어','엉덩이','하체']);
});

test('한 근육이 두 부위에 속할 수 있다', () => {
  assert.deepEqual(groupsForMuscles(['traps']).sort(), ['back', 'shoulders']);
  assert.deepEqual(groupsForMuscles(['glute']).sort(), ['glutes', 'legs']);
  assert.deepEqual(groupsForMuscles(['pec']), ['chest']);
  assert.deepEqual(groupsForMuscles([]), []);
});

test('운동 타깃은 3D 매핑을 우선하고 없으면 부위명으로 추정한다', () => {
  const squat = exerciseTargets(byId('squat'));
  assert.deepEqual(squat.primary, ['quads', 'glute']);
  assert.ok(squat.secondary.includes('hamstrings'));
  assert.ok(squat.muscles.includes('quads'));
  // 덤벨 벤치에는 3D 매핑이 없어 카탈로그 부위명으로 추정합니다.
  const bench = exerciseTargets(byId('db-bench'));
  assert.deepEqual(bench.primary, ['pec']);
  assert.deepEqual(bench.secondary, []);
  assert.deepEqual(bench.parts, ['가슴']);
  assert.deepEqual(exerciseTargets(byId('treadmill')).muscles, []);
  assert.deepEqual(exerciseTargets(null), {primary: [], secondary: [], muscles: [], parts: []});
});

test('큰 부위와 세부 근육 이름을 검색어로 알아본다', () => {
  const shoulder = resolveMuscleTerm('어깨');
  assert.ok(shoulder.groups.includes('shoulders'));
  for (const id of ['delt-front', 'delt-lat', 'delt-rear']) assert.ok(shoulder.muscles.includes(id), id);
  assert.ok(shoulder.parts.includes('어깨'));

  assert.deepEqual(resolveMuscleTerm('삼각근').muscles.sort(), ['delt-front', 'delt-lat', 'delt-rear']);
  assert.deepEqual(resolveMuscleTerm('대둔근').muscles, ['glute']);
  assert.deepEqual(resolveMuscleTerm('엉덩이').groups, ['glutes']);
  assert.deepEqual(resolveMuscleTerm('복부').groups, ['core']);
  assert.deepEqual(resolveMuscleTerm('하체').groups, ['legs']);
  assert.deepEqual(resolveMuscleTerm('가슴').muscles, ['pec']);
  assert.deepEqual(resolveMuscleTerm('팔').groups, ['arms']);
  assert.deepEqual(resolveMuscleTerm('종아리').muscles.sort(), ['calves', 'soleus']);
  assert.ok(!resolveMuscleTerm('종아리').groups.includes('legs'));
  assert.equal(resolveMuscleTerm('프레스'), null);
  assert.equal(resolveMuscleTerm(''), null);
  assert.equal(resolveMuscleTerm(undefined), null);
});

test('운동도감 검색창은 큰 부위 이름과 세부 근육 이름으로도 찾는다', () => {
  assert.ok(searchExercise(byId('ohp'), '어깨'));
  assert.ok(searchExercise(byId('lateral'), '어깨'));
  assert.ok(searchExercise(byId('rear'), '어깨'));
  assert.ok(!searchExercise(byId('squat'), '어깨'));
  assert.ok(searchExercise(byId('squat'), '엉덩이'));
  assert.ok(searchExercise(byId('hipthrust'), '엉덩이'));
  assert.ok(searchExercise(byId('bridge'), '대둔근'));
  assert.ok(!searchExercise(byId('curl'), '엉덩이'));
  assert.ok(searchExercise(byId('lateral'), '삼각근'));
  assert.ok(searchExercise(byId('ohp'), '어깨 프레스'));
  assert.ok(searchExercise(byId('machine-shoulder'), '어깨 프레스'));
  assert.ok(!searchExercise(byId('lateral'), '어깨 프레스'));
  assert.ok(searchExercise(byId('bench'), '바벨'));
  assert.ok(searchExercise(byId('bench'), '가슴'));
  // 기존 검색어는 그대로 동작합니다.
  assert.ok(searchExercise(byId('bench'), '벤치'));
  assert.ok(!searchExercise(byId('bench'), '스쿼트'));
  for (const exercise of catalog) {
    assert.ok(searchExercise(exercise, ''), exercise.id);
    assert.ok(searchExercise(exercise, exercise.muscle), `${exercise.id} ${exercise.muscle}`);
  }
});

test('보조근 포함 여부가 세부 근육 검색을 바꾼다', () => {
  assert.ok(searchExercise(byId('squat'), '햄스트링', {includeSecondary: true}));
  assert.ok(!searchExercise(byId('squat'), '햄스트링', {includeSecondary: false}));
  assert.ok(searchExercise(byId('squat'), '대퇴사두근'));
});

test('큰 부위 그룹과 세부 근육 칩으로 목록을 거른다', () => {
  const shoulders = names(filterExercises(catalog, {groups: ['shoulders']}));
  assert.ok(shoulders.includes('ohp') && shoulders.includes('rear') && shoulders.includes('facepull'));
  assert.ok(!shoulders.includes('squat'));
  // 어깨 그룹에는 승모근도 함께 들어가므로 등 운동도 보조근 포함 시 걸릴 수 있습니다.
  const shoulderMuscles = muscleGroups.find(g => g.id === 'shoulders').muscles;
  for (const id of shoulders) assert.ok(exerciseTargets(byId(id)).muscles.some(m => shoulderMuscles.includes(m)), id);

  const glutes = names(filterExercises(catalog, {groups: ['glutes']}));
  assert.ok(glutes.includes('hipthrust') && glutes.includes('squat') && glutes.includes('bridge'));
  assert.ok(!glutes.includes('curl'));

  const sideDelt = names(filterExercises(catalog, {muscles: ['delt-lat']}));
  assert.ok(sideDelt.includes('lateral') && sideDelt.includes('ohp'));

  const calfs = names(filterExercises(catalog, {muscles: ['soleus']}));
  assert.ok(calfs.includes('calf'));

  const partsOnly = names(filterExercises(catalog, {parts: ['둔근']}));
  assert.deepEqual(partsOnly.sort(), catalog.filter(e => e.muscle === '둔근').map(e => e.id).sort());

  const whole = names(filterExercises(catalog, {parts: ['전신']}));
  assert.ok(whole.includes('burpee') && whole.includes('swing'));
});

test('보조근 포함 토글이 필터 결과를 바꾼다', () => {
  const withSecondary = names(filterExercises(catalog, {muscles: ['hamstrings']}));
  const primaryOnly = names(filterExercises(catalog, {muscles: ['hamstrings'], includeSecondary: false}));
  assert.ok(withSecondary.includes('squat'));
  assert.ok(!primaryOnly.includes('squat'));
  assert.ok(primaryOnly.includes('legcurl'));
  assert.ok(matchesMuscleSelection(byId('squat'), {muscles: ['hamstrings']}));
  assert.ok(!matchesMuscleSelection(byId('squat'), {muscles: ['hamstrings'], includeSecondary: false}));
  assert.ok(matchesMuscleSelection(byId('squat'), {}));
});

test('모든 운동은 자기 부위나 타깃 근육으로 다시 찾을 수 있다', () => {
  for (const exercise of catalog) {
    const targets = exerciseTargets(exercise);
    const pool = [...targets.primary, ...targets.secondary];
    if (pool.length) assert.ok(names(filterExercises(catalog, {muscles: [pool[0]]})).includes(exercise.id), exercise.id);
    else assert.ok(names(filterExercises(catalog, {parts: targets.parts})).includes(exercise.id), exercise.id);
    const groups = groupsForMuscles(pool);
    if (groups.length) assert.ok(names(filterExercises(catalog, {groups: [groups[0]]})).includes(exercise.id), exercise.id);
  }
});

test('검색어와 근육 필터는 함께 적용된다', () => {
  const result = names(filterExercises(catalog, {query: '프레스', groups: ['shoulders']}));
  assert.ok(result.includes('ohp') && result.includes('machine-shoulder'));
  assert.ok(result.includes('bench')); // 전면 삼각근은 벤치 프레스의 보조근입니다.
  assert.ok(!names(filterExercises(catalog, {query:'프레스', groups:['shoulders'], includeSecondary:false})).includes('bench'));
  assert.deepEqual(names(filterExercises(catalog, {query: '벤치', muscles: ['pec']})), ['bench', 'db-bench']);
  assert.deepEqual(names(filterExercises(catalog, {query: ''})), catalog.map(e => e.id));
});
