import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bones, motions, project, samplePose} from '../src/motion-guide.mjs';

test('every 3D guide belongs to a catalog exercise and provides a loop with valid joints', () => {
  const entries = JSON.parse(readFileSync(new URL('../src/exercises.json',import.meta.url),'utf8')).exercises;
  for (const [id,motion] of Object.entries(motions)) {
    assert.ok(entries.some(e=>e.id===id), id);
    assert.equal(motion.labels.length,2);
    assert.deepEqual(samplePose(motion,0),samplePose(motion,1));
    assert.notDeepEqual(samplePose(motion,0),samplePose(motion,.5));
    for (const phase of [0,.25,.5,.75,1]) {
      const joints=samplePose(motion,phase);
      assert.equal(joints.length,17);
      assert.ok(bones.flat().every(i=>joints[i].length===3 && joints[i].every(Number.isFinite)));
    }
  }
});

test('rotating the camera exposes exercise depth rather than scaling a flat drawing', () => {
  const near=[0,1,.6], far=[0,1,-.6];
  assert.equal(project(near,0,50,0,0)[0],project(far,0,50,0,0)[0]);
  assert.notEqual(project(near,Math.PI/2,50,0,0)[0],project(far,Math.PI/2,50,0,0)[0]);
  assert.ok(Math.abs(project(near,0,100,0,0)[1])>Math.abs(project(near,0,50,0,0)[1]));
});
