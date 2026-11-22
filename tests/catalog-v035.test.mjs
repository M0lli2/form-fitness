// 0.3.5 기본 종목 확장: 100종 이상, 부위·장비·형식 호환, 3D 근육 매핑 키 보존을 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateBackup, validateSession} from '../src/core.mjs';
import {bodyParts} from '../src/muscle-filter.mjs';
import {catalogPartMuscles, muscleRoles} from '../src/muscle-map.mjs';
import {motions} from '../src/motion-guide.mjs';

const catalog = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url), 'utf8')).exercises;
const equipment = ['바벨', '덤벨', '머신', '케이블', '맨몸', '케틀벨', '소도구'];

test('기본 종목은 100종 이상이고 id·이름이 중복되지 않는다', () => {
  assert.ok(catalog.length >= 100, `종목 ${catalog.length}개`);
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length);
  assert.equal(new Set(catalog.map(item => item.name)).size, catalog.length);
});

test('모든 종목의 부위·장비·형식·단계가 기존 도감 계약과 맞는다', () => {
  const parts = new Set([...Object.keys(catalogPartMuscles), ...bodyParts]);
  for (const item of catalog) {
    assert.ok(parts.has(item.muscle), `${item.id}: ${item.muscle}`);
    assert.ok(equipment.includes(item.equipment), `${item.id}: ${item.equipment}`);
    assert.ok(['strength', 'cardio', 'duration'].includes(item.type), `${item.id}: ${item.type}`);
    assert.ok(Array.isArray(item.steps) && item.steps.length >= 3, item.id);
    assert.ok(item.steps.every(step => typeof step === 'string' && step.trim().length > 0), item.id);
    assert.ok(typeof item.caution === 'string' && item.caution.trim().length > 0, item.id);
    assert.ok(['초급', '중급', '고급'].includes(item.level), item.id);
  }
});

test('기존 3D 자세·근육 매핑 키는 그대로 남아 있다', () => {
  for (const id of Object.keys(motions)) assert.ok(catalog.some(item => item.id === id), `모션 ${id}`);
  for (const id of Object.keys(muscleRoles)) assert.ok(catalog.some(item => item.id === id), `근육 역할 ${id}`);
  // 기존 63종의 핵심 id가 사라지지 않았는지 확인합니다.
  for (const id of ['pushup', 'bench', 'squat', 'back-squat', 'deadlift', 'ohp', 'pullup', 'plank', 'treadmill', 'catcow'])
    assert.ok(catalog.some(item => item.id === id), id);
});

test('RPE는 이전 기록·백업과 호환되고 1~10 밖의 값은 거절한다', () => {
  const legacy = {id: 's1', name: '이전 기록', startedAt: '2026-11-01T10:00:00Z', endedAt: '2026-11-01T11:00:00Z',
    restEndsAt: null, exercises: [{id: 'bench', name: '바벨 벤치 프레스', type: 'strength', muscle: '가슴', note: '',
      sets: [{id: 'set1', weight: 60, reps: 10, seconds: 30, distance: 0, kind: 'normal', done: true}]}]};
  assert.equal(validateBackup({schema: 1, history: [legacy], body: [], routines: []}).history.length, 1);
  const withRpe = {...legacy, exercises: [{...legacy.exercises[0], sets: [{...legacy.exercises[0].sets[0], rpe: '8.5'}]}]};
  assert.equal(validateSession(withRpe).exercises[0].sets[0].rpe, '8.5');
  const tooHigh = {...legacy, exercises: [{...legacy.exercises[0], sets: [{...legacy.exercises[0].sets[0], rpe: '11'}]}]};
  assert.throws(() => validateSession(tooHigh));
});
