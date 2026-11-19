import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {motions, propSegments, samplePose} from '../src/motion-guide.mjs';
import {muscleRoles, muscles, projectMuscles} from '../src/muscle-map.mjs';

const catalog = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url), 'utf8')).exercises;
const v1 = ['squat','goblet','pushup','bridge','calf','curl','lateral','ohp'];
const added = ['bench','back-squat','deadlift','lat','pullup','bar-row','lunge','hipthrust','legpress','pushdown','facepull','plank','dips','db-shoulder'];

test('추가한 14종 운동이 운동도감 항목과 3D 가이드로 연결된다', () => {
  assert.equal(added.length, 14);
  for (const id of added) {
    assert.ok(motions[id], `${id} 모션 없음`);
    assert.ok(catalog.some(e => e.id === id), `${id} 운동도감 없음`);
    assert.equal(motions[id].labels.length, 2);
    assert.deepEqual(samplePose(motions[id], 0), samplePose(motions[id], 1));
    assert.notDeepEqual(samplePose(motions[id], 0), samplePose(motions[id], .5));
  }
  assert.equal(Object.keys(motions).length, v1.length + added.length);
});

test('추가 운동은 모두 주동근·보조근과 근육 투영을 가진다', () => {
  const ids = new Set(muscles.map(m => m.id));
  for (const id of added) {
    const role = muscleRoles[id];
    assert.ok(role && role.primary.length >= 1 && role.secondary.length >= 1, id);
    for (const muscle of [...role.primary, ...role.secondary]) assert.ok(ids.has(muscle), `${id}: ${muscle}`);
    for (const muscle of role.primary) assert.ok(!role.secondary.includes(muscle), `${id}: ${muscle} 중복`);
    const shapes = projectMuscles({joints: samplePose(motions[id], .5), yaw: .7, scale: 80,
      centerX: 180, centerY: 130, exerciseId: id, includeInactive: false});
    const drawn = new Set(shapes.map(s => s.id));
    for (const muscle of role.primary) assert.ok(drawn.has(muscle), `${id}: ${muscle} 미표시`);
  }
});

test('추가 자세는 관절 좌표가 몸 범위 안에서 유한하다', () => {
  for (const id of added) {
    for (const phase of [0, .25, .5, .75]) {
      const joints = samplePose(motions[id], phase);
      assert.equal(joints.length, 17, id);
      for (const [x, y, z] of joints) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), id);
        assert.ok(y >= -.05 && y <= 2.15, `${id} 높이 ${y}`);
        assert.ok(Math.abs(x) <= .8 && Math.abs(z) <= 1.2, `${id} 폭·깊이 ${x},${z}`);
      }
    }
  }
});

test('장비는 손을 따라가고 고정 장비는 제자리에 있다', () => {
  // 바벨: 양손을 잇는 수평선이고 손 간격보다 넓다.
  for (const id of ['bench','back-squat','deadlift','lat','pullup','bar-row','hipthrust']) {
    for (const phase of [0, .5]) {
      const joints = samplePose(motions[id], phase);
      const segments = propSegments(motions[id], joints);
      assert.ok(segments.length >= 1, `${id} 장비 없음`);
      const bar = segments.find(s => s.a[0] < 0 && s.b[0] > 0);
      assert.ok(bar, `${id} 바 없음`);
      assert.ok(Math.abs(bar.a[1] - bar.b[1]) < 1e-9 && Math.abs(bar.a[2] - bar.b[2]) < 1e-9, `${id} 수평 아님`);
      assert.ok(Math.abs(bar.a[0]) > Math.abs(joints[5][0]), `${id} 폭이 좁음`);
      assert.ok(segments.every(s => [...s.a, ...s.b].every(Number.isFinite)), id);
    }
  }
  // 딥스는 몸 옆 두 개의 평행봉을 각각 그린다.
  const dipBars = propSegments(motions.dips, samplePose(motions.dips, 0));
  assert.equal(dipBars.length, 2);
  assert.ok(dipBars.every(s => Math.abs(s.a[0] - s.b[0]) < .34));
  // 덤벨은 좌우 손마다 하나씩, 케이블은 도르래 고정점에서 손까지 이어진다.
  const shoulder = samplePose(motions['db-shoulder'], .5);
  const dumbbells = propSegments(motions['db-shoulder'], shoulder);
  assert.equal(dumbbells.length, 2);
  assert.ok(dumbbells.every(s => Math.abs(s.a[0] - s.b[0]) <= .18 + 1e-9));
  const pushdown = motions.pushdown.props.find(p => p.kind === 'cable');
  const cable = propSegments(motions.pushdown, samplePose(motions.pushdown, 0)).find(s => s.width < .02);
  assert.deepEqual(cable.a, pushdown.anchor);
  const hands = samplePose(motions.pushdown, 0);
  assert.ok(Math.abs(cable.b[1] - (hands[5][1] + hands[12][1]) / 2) < 1e-9);
});

test('맨몸 운동은 장비 선분이 없고, 벤치를 쓰는 운동은 벤치가 몸 아래에 있다', () => {
  for (const id of ['lunge','plank']) assert.equal(propSegments(motions[id], samplePose(motions[id], 0)).length, 0, id);
  for (const id of ['bench','hipthrust']) {
    const joints = samplePose(motions[id], 0);
    const bench = propSegments(motions[id], joints).find(s => s.width > .2);
    assert.ok(bench, id);
    assert.ok(bench.a[1] < joints[1][1] && bench.b[1] < joints[2][1], id);
  }
});
