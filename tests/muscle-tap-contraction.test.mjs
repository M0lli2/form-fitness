import test from 'node:test';
import assert from 'node:assert/strict';
import {motions, samplePose} from '../src/motion-guide.mjs';
import {contractionState, hitTestMuscles, muscleCard, muscleRoles, muscleTips, muscles, projectMuscles} from '../src/muscle-map.mjs';

test('수축 강도는 시작과 끝에서 0, 중간 자세에서 1이다', () => {
  assert.equal(contractionState(0).intensity, 0);
  assert.equal(contractionState(.5).intensity, 1);
  assert.ok(contractionState(1).intensity < 1e-12);
  assert.equal(contractionState(.25).intensity.toFixed(6), contractionState(.75).intensity.toFixed(6));
  for (let i = 1; i <= 50; i++) {
    const a = contractionState((i - 1) / 100), b = contractionState(i / 100);
    if (i / 100 <= .5) assert.ok(b.intensity >= a.intensity - 1e-12, `${i}`);
  }
});

test('수축 국면은 배지와 주동근 불투명도 배율을 만든다', () => {
  assert.equal(contractionState(.5).stage, 'peak');
  assert.equal(contractionState(.5).badge, '수축 피크');
  assert.equal(contractionState(.1).stage, 'lift');
  assert.equal(contractionState(.1).badge, '수축 중');
  assert.equal(contractionState(.9).stage, 'return');
  assert.equal(contractionState(.9).badge, '이완 중');
  for (const phase of [0, .1, .3, .5, .8, .99, -.25, 2.4]) {
    const state = contractionState(phase);
    assert.ok(state.phase >= 0 && state.phase < 1, String(phase));
    assert.ok(state.intensity >= 0 && state.intensity <= 1);
    assert.ok(state.alpha >= .45 && state.alpha <= 1);
  }
  assert.ok(contractionState(.5).alpha > contractionState(.1).alpha);
  assert.equal(contractionState(Number.NaN).intensity, 0);
});

test('탭 지점의 근육을 찾고 빈 곳은 null을 돌려준다', () => {
  const shapes = projectMuscles({joints: samplePose(motions.squat, 0), yaw: 0, scale: 80,
    centerX: 180, centerY: 130, exerciseId: 'squat'});
  const quads = shapes.find(s => s.id === 'quads');
  assert.equal(hitTestMuscles(shapes, quads.x, quads.y)?.id, 'quads');
  assert.equal(hitTestMuscles(shapes, -50, -50), null);
  assert.equal(hitTestMuscles([], 10, 10), null);
  assert.equal(hitTestMuscles(undefined, 10, 10), null);
  // 타원 가장자리 바로 밖은 tolerance 안에서만 잡힌다.
  const lone = [{id: 'lone', x: 100, y: 100, width: 40, height: 20, rotation: 0, facing: 1}];
  assert.equal(hitTestMuscles(lone, 121, 100, 1), null);
  assert.equal(hitTestMuscles(lone, 121, 100, 1.6)?.id, 'lone');
});

test('겹친 근육은 카메라를 향한 쪽을 고른다', () => {
  const overlapping = [
    {id: 'near', x: 100, y: 100, width: 60, height: 40, rotation: 0, facing: 1},
    {id: 'far', x: 100, y: 100, width: 60, height: 40, rotation: 0, facing: .2},
  ];
  assert.equal(hitTestMuscles(overlapping, 100, 100).id, 'near');
  assert.equal(hitTestMuscles([...overlapping].reverse(), 100, 100).id, 'near');
});

test('회전한 타원도 자기 영역 안의 탭을 잡는다', () => {
  const shape = {id: 'tilted', x: 100, y: 100, width: 80, height: 12, rotation: 90, facing: 1};
  assert.equal(hitTestMuscles([shape], 100, 135)?.id, 'tilted');   // 회전축을 따라 긴 쪽
  assert.equal(hitTestMuscles([shape], 135, 100, 1), null);        // 회전 뒤 짧은 쪽
});

test('스테이지에 그려진 주동근은 자기 위치를 탭하면 선택된다', () => {
  for (const exercise of Object.keys(muscleRoles)) {
    for (const yaw of [0, Math.PI]) {
      const shapes = projectMuscles({joints: samplePose(motions[exercise], .5), yaw, scale: 80,
        centerX: 180, centerY: 130, exerciseId: exercise});
      const front = shapes.filter(s => s.facing >= .5);
      for (const shape of front) {
        const hit = hitTestMuscles(front, shape.x, shape.y);
        assert.ok(hit, `${exercise} ${shape.id}`);
        // 다른 근육이 더 가까이 겹친 경우에도 근육 하나는 반드시 선택된다.
        assert.ok(front.some(s => s.id === hit.id), `${exercise} ${shape.id}`);
      }
    }
  }
});

test('근육 카드는 이름·역할·자극·자세 팁을 담는다', () => {
  assert.equal(Object.keys(muscleTips).length, muscles.length);
  for (const spec of muscles) {
    assert.ok(muscleTips[spec.id].cue.length > 5 && muscleTips[spec.id].focus.length > 5, spec.id);
    const card = muscleCard(spec.id, 'squat');
    assert.equal(card.name, spec.name);
    assert.equal(card.latin, spec.latin);
    assert.equal(card.cue, muscleTips[spec.id].cue);
    assert.equal(card.focus, muscleTips[spec.id].focus);
    const role = muscleRoles.squat;
    if (role.primary.includes(spec.id)) {
      assert.equal(card.role, 'primary');
      assert.equal(card.order, role.primary.indexOf(spec.id));
      assert.equal(card.roleLabel, '주동근');
    } else if (role.secondary.includes(spec.id)) {
      assert.equal(card.role, 'secondary');
      assert.equal(card.roleLabel, '보조근');
    } else {
      assert.equal(card.role, 'inactive');
      assert.equal(card.order, -1);
    }
  }
  assert.equal(muscleCard('nope', 'squat'), null);
  assert.equal(muscleCard('pec', 'unknown-exercise').role, 'inactive');
  assert.equal(muscleCard('pec', undefined).role, 'inactive');
});
