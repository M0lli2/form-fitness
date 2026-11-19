import test from 'node:test';
import assert from 'node:assert/strict';
import {motions, samplePose, project, frameMotion} from '../src/motion-guide.mjs';
import {activeMuscles, bodyFrame, muscleRoles, muscles, projectBody, projectMuscles} from '../src/muscle-map.mjs';
import {readFileSync} from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('../src/exercises.json', import.meta.url), 'utf8')).exercises;
const angles = Array.from({length: 8}, (_, i) => i * Math.PI / 4);
const find = (shapes, id, side) => shapes.find(s => s.id === id && (!side || s.bodySide === side));

test('every 3D guide maps to real muscles with a distinct primary group', () => {
  assert.deepEqual(Object.keys(muscleRoles).sort(), Object.keys(motions).sort());
  const ids = new Set(muscles.map(m => m.id));
  for (const [exercise, role] of Object.entries(muscleRoles)) {
    assert.ok(role.primary.length >= 1, exercise);
    assert.ok(role.secondary.length >= 1, exercise);
    for (const id of [...role.primary, ...role.secondary]) assert.ok(ids.has(id), `${exercise}: ${id}`);
    for (const id of role.primary) assert.ok(!role.secondary.includes(id), `${exercise}: ${id} 중복`);
    assert.ok(catalog.some(e => e.id === exercise), exercise);
    assert.deepEqual(activeMuscles(exercise).primary.map(m => m.id), role.primary);
    assert.deepEqual(activeMuscles(exercise).secondary.map(m => m.id), role.secondary);
  }
  assert.deepEqual(activeMuscles('unknown'), {primary: [], secondary: []});
});

test('모든 각도·자세에서 근육 타원이 화면 좌표로 유한하게 투영되고 뒤에서 앞으로 정렬된다', () => {
  for (const [exercise, motion] of Object.entries(motions)) {
    for (const phase of [0, .5]) {
      const joints = samplePose(motion, phase);
      for (const yaw of angles) {
        const shapes = projectMuscles({joints, yaw, scale: 80, centerX: 180, centerY: 130, exerciseId: exercise});
        assert.ok(shapes.length >= 20, exercise);
        shapes.forEach((s, i) => {
          for (const key of ['x', 'y', 'width', 'height', 'depth', 'rotation', 'facing'])
            assert.ok(Number.isFinite(s[key]), `${exercise} ${s.id} ${key}`);
          assert.ok(s.width > 0 && s.height > 0, `${exercise} ${s.id} 크기`);
          assert.ok(s.facing >= .18 && s.facing <= 1, `${exercise} ${s.id} facing`);
          if (i > 0) assert.ok(shapes[i - 1].depth <= s.depth + 1e-9, `${exercise} 정렬`);
        });
      }
    }
  }
});

test('근육 하나는 좌우 한 쌍 또는 몸통 하나의 타원으로 그린다', () => {
  const shapes = projectMuscles({joints: samplePose(motions.squat, 0), yaw: 0, scale: 80,
    centerX: 180, centerY: 130, exerciseId: 'squat'});
  for (const spec of muscles) {
    const copies = shapes.filter(s => s.id === spec.id);
    assert.equal(copies.length, spec.mirror ? 2 : 1, spec.id);
    assert.ok(copies.every(s => s.width > 0 && s.height > 0));
  }
});

test('전면·후면 근육이 회전에 따라 서로 반대쪽에 놓인다', () => {
  const joints = samplePose(motions.squat, 0);
  const front = projectMuscles({joints, yaw: 0, scale: 80, centerX: 180, centerY: 130, exerciseId: 'squat'});
  const back = projectMuscles({joints, yaw: Math.PI, scale: 80, centerX: 180, centerY: 130, exerciseId: 'squat'});
  assert.ok(find(front, 'quads').depth > find(front, 'hamstrings').depth);
  assert.ok(find(back, 'glute').depth > find(back, 'abs').depth);
  assert.ok(find(front, 'quads').facing > .9);
  assert.ok(find(front, 'hamstrings').facing < .4);
  assert.ok(find(front, 'glute').facing < .4);
  assert.ok(find(back, 'glute').facing > .9);
});

test('좌우 근육은 중심선을 기준으로 대칭이고 몸통 근육은 하나만 그린다', () => {
  const joints = samplePose(motions.ohp, .5);
  const shapes = projectMuscles({joints, yaw: 0, scale: 80, centerX: 180, centerY: 130, exerciseId: 'ohp'});
  for (const id of ['quads', 'delt-front', 'biceps']) {
    const right = find(shapes, id, 'right'), left = find(shapes, id, 'left');
    assert.ok(Math.abs(right.x + left.x - 360) < .5, id);
    assert.equal(right.y.toFixed(3), left.y.toFixed(3));
  }
  const abs = shapes.filter(s => s.id === 'abs');
  assert.equal(abs.length, 1);
  assert.equal(abs[0].bodySide, 'center');
});

test('주동근은 범례 순서대로 0부터 번호가 붙고 보조근은 번호가 없다', () => {
  for (const [exercise, role] of Object.entries(muscleRoles)) {
    const shapes = projectMuscles({joints: samplePose(motions[exercise], 0), yaw: 0, scale: 80,
      centerX: 180, centerY: 130, exerciseId: exercise});
    for (const [i, id] of role.primary.entries())
      for (const shape of shapes.filter(s => s.id === id)) assert.equal(shape.order, i, `${exercise} ${id}`);
    for (const id of role.secondary)
      for (const shape of shapes.filter(s => s.id === id)) assert.equal(shape.order, -1, `${exercise} ${id}`);
  }
});

test('몸통 기준축은 자세에 따라 가슴이 향하는 쪽을 가리킨다', () => {
  const standing = bodyFrame(samplePose(motions.squat, 0));
  assert.ok(standing.forward[2] > .95);                       // 서 있으면 앞은 +깊이
  const pushup = bodyFrame(samplePose(motions.pushup, 0));
  assert.ok(pushup.forward[1] < -.8);                         // 엎드린 자세는 가슴이 아래
  const bridge = bodyFrame(samplePose(motions.bridge, .5));
  assert.ok(bridge.forward[1] > .8);                          // 누운 자세는 가슴이 위
  for (const frame of [standing, pushup, bridge])
    assert.ok(Math.abs(frame.forward.reduce((s, v, i) => s + v * frame.up[i], 0)) < 1e-9);
});

test('인체 실루엣은 머리부터 발까지 모든 부위를 그린다', () => {
  const joints = samplePose(motions.lateral, 0);
  const shapes = projectBody({joints, yaw: 0, scale: 80, centerX: 180, centerY: 130});
  const ids = new Set(shapes.map(s => s.id));
  for (const part of ['head', 'neck', 'chest', 'shoulders', 'waist', 'hips', 'upperarm', 'forearm', 'hand', 'thigh', 'shin', 'foot'])
    assert.ok(ids.has(part), part);
  const head = shapes.find(s => s.id === 'head');
  const chest = shapes.find(s => s.id === 'chest');
  const thigh = shapes.find(s => s.id === 'thigh');
  assert.ok(head.y < chest.y && chest.y < thigh.y);
  assert.ok(shapes.every(s => s.width > 0 && s.height > 0 && Number.isFinite(s.x)));
});

test('운동별 프레이밍은 8방향 모든 자세를 스테이지 안에 넣는다', () => {
  const width = 340, height = 226;
  for (const [exercise, motion] of Object.entries(motions)) {
    const frame = frameMotion(motion, width, height, 112);
    assert.ok(frame.scale > 24 && frame.scale <= 112, exercise);
    for (const phase of [0, .5]) {
      const joints = samplePose(motion, phase);
      for (const yaw of angles) {
        for (const joint of joints) {
          const [x, y] = project(joint, yaw, 1, 0, 0);
          const sx = width / 2 + (x - frame.cx) * frame.scale;
          const sy = height / 2 + (y - frame.cy) * frame.scale;
          assert.ok(sx >= 0 && sx <= width, `${exercise} x ${sx}`);
          assert.ok(sy >= 0 && sy <= height, `${exercise} y ${sy}`);
        }
      }
    }
  }
});
