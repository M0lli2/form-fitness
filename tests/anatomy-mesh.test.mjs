import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAnatomy,faceAt,visibleMuscleMarkers} from '../src/anatomy-mesh.mjs';
import {frameMotion,motions,samplePose} from '../src/motion-guide.mjs';
import {muscleRoles} from '../src/muscle-map.mjs';

const palette={bg:'#101012',ink:'#F7F7F8',accent:'#B7C9FF'};
function guide(exerciseId,phase,yaw) {
  const motion=motions[exerciseId];
  const {scale,cx,cy}=frameMotion(motion,328,226,112);
  return projectAnatomy({joints:samplePose(motion,phase),yaw,scale,centerX:164-cx*scale,centerY:113-cy*scale,
    exerciseId,phase,selected:null,palette});
}

test('all modeled exercises generate finite native coordinates in each guide view',() => {
  for(const exerciseId of Object.keys(motions)) {
    for(const phase of [0,.25,.5]) {
      for(let angle=0;angle<8;angle++) {
        const {faces,coordinates}=guide(exerciseId,phase,angle*Math.PI/4);
        assert.ok(faces.length>100 && coordinates.length<=18000,exerciseId);
        assert.equal(coordinates.length,faces.length*9);
        assert.ok(coordinates.every(Number.isFinite),exerciseId);
        assert.ok(faces.every((f,i) => !i || f.depth>=faces[i-1].depth),exerciseId);
        assert.ok(faces.every(f => f.primary<0 || muscleRoles[exerciseId].primary[f.primary]===f.muscle),exerciseId);
      }
    }
  }
});

test('squat surface exposes quads in front and glutes in back',() => {
  for(const [yaw,muscle] of [[0,'quads'],[Math.PI,'glute']]) {
    const {faces}=guide('squat',0,yaw);
    const marker=visibleMuscleMarkers(faces).find(x => x.id===muscle);
    assert.ok(marker,'Missing visible marker for '+muscle);
    assert.equal(faceAt(faces,marker.x,marker.y).muscle,muscle);
    assert.equal(faceAt(faces,-10,-10),null);
  }
});

test('a body face in front of a muscle blocks the hit',() => {
  const screen=[[0,0],[10,0],[10,10],[0,10]];
  const front={screen,muscle:null}, back={screen,muscle:'pec'};
  assert.equal(faceAt([back,front],4,5),front);
  assert.equal(faceAt([front,back],4,5),back);
});
