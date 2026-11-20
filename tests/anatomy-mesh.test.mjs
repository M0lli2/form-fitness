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
        assert.ok(faces.length>100 && coordinates.length<=110000,exerciseId);
        assert.equal(coordinates.length,faces.length*16);
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
  const behind={...back,depths:[0,0,0,0],depth:2}, nearer={...front,depths:[1,1,1,1],depth:1};
  assert.equal(faceAt([nearer,behind],4,5),nearer);
  assert.equal(faceAt([back,front],4,5),front);
  assert.equal(faceAt([front,back],4,5),back);
});

test('catalog selection and volume bands use the same visible face labels',() => {
  const args={joints:samplePose(motions.squat,0),yaw:0,scale:104,centerX:164,centerY:112,palette};
  const inactive=projectAnatomy({...args,heat:{}}).faces;
  const heat=projectAnatomy({...args,heat:{quads:.9}}).faces;
  assert.equal(inactive.length,heat.length);
  for(let i=0;i<heat.length;i++){
    if(heat[i].muscle==='quads') assert.equal(heat[i].muscle,inactive[i].muscle);
  }
  assert.ok(heat.some((face,i)=>face.muscle==='quads'&&face.vertexColors.some((v,j)=>v!==inactive[i].vertexColors[j])));
  for(let i=0;i<heat.length;i++){
    if(heat[i].muscle==='delt-front') assert.deepEqual(heat[i].vertexColors,inactive[i].vertexColors);
  }
  const unselected=projectAnatomy(args).faces;
  const selection=projectAnatomy({...args,highlights:['quads']}).faces;
  assert.ok(selection.some((face,i)=>face.muscle==='quads'&&face.color!==unselected[i].color));
});
