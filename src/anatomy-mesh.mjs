/** Pose, shade and project the compact Diego Luján García anatomy sculpture. */
import {sculptureData} from './anatomy-sculpt-data.mjs';
import {project} from './motion-guide.mjs';
import {contractionState, muscleRoles} from './muscle-map.mjs';

const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(v,k)=>[v[0]*k,v[1]*k,v[2]*k];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=v=>Math.hypot(v[0],v[1],v[2]);
const unit=v=>mul(v,1/(length(v)||1));
const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const size=1.8/68.16;
const frontHalf=[
  [0,21.4,.05],[0,14.3,-.3],[0,-5.1,-.65],
  [7.04,10.65,-.7],[10.1,.03,-2.30],[11.83,-11.2,-.42],
  [4.08,-7.1,-.6],[4.45,-25.45,.22],[5.95,-39.46,-1.05],[6.02,-42.4,3.3],
].map(([x,y,z])=>[x*size,(y+43.13)*size,z*size]);
/** Calibrated authored rest joints, mirrored with the same guide convention. */
export const sculptRestPose=[...frontHalf,...frontHalf.slice(3).map(([x,y,z])=>[-x,y,z])];

function segments(joints) {
  const result=[[joints[2],joints[1]],[joints[1],joints[0]]];
  for(const side of [0,7]){
    const [shoulder,elbow,wrist,hip,knee,ankle,toe]=joints.slice(3+side,10+side);
    result.push([shoulder,elbow],[elbow,wrist],[wrist,add(wrist,mul(sub(wrist,elbow),.50))],
      [hip,knee],[knee,ankle],[ankle,toe]);
  }
  return result;
}
const rest=segments(sculptRestPose);

/** Neighboring bones blend at elbows, knees, hips and shoulders. */
function attachments(p,part) {
  const [x,y]=p, side=x>=0?0:6;
  const [arm,forearm,hand,thigh,shin,foot]=[2,3,4,5,6,7].map(n=>n+side);
  const adjacent=(a,b,t)=>t<=0?[[a,1]]:t>=1?[[b,1]]:[[a,1-t],[b,t]];
  const boundArm=(part>=5&&part<=9&&part!==6) || (part<2&&Math.abs(x)>.19&&y>.57);
  if(boundArm){
    if(y>1.33)return adjacent(arm,0,smooth(1.29,1.53,y)*(1-smooth(.14,.25,Math.abs(x))));
    if(y>.96)return adjacent(forearm,arm,smooth(1.06,1.23,y));
    return adjacent(hand,forearm,smooth(.78,.94,y));
  }
  if(part>=10||(part<2&&y<.98)){
    if(y>.77)return adjacent(thigh,0,smooth(.87,1.06,y)*(part===10?.88:1));
    if(y>.25)return adjacent(shin,thigh,smooth(.37,.57,y));
    return adjacent(foot,shin,smooth(.055,.17,y));
  }
  if(part===2||part===3||y>1.58)return adjacent(0,1,smooth(1.40,1.65,y));
  return [[0,1]];
}

/** Runtime muscle labels stay independent of the artist's subtool names. */
function muscleFor(part,x,y,z) {
  switch(part){
    case 4: return y>1.28&&Math.abs(x)<.115?'traps':Math.abs(x)<.081&&y<1.22?'erectors':'lats';
    case 5: return z>-.028?'delt-front':z<-.073?'delt-rear':'delt-lat';
    case 6: return y>1.31?'pec':'abs';
    case 7: return z>-.059?'biceps':'triceps';
    case 8: case 9: return y>.79?'forearm':null;
    case 10: return 'glute';
    case 11: return 'quads';
    case 12: return 'hamstrings';
    case 15: return y>.26?'calves':'soleus';
    default: return null;
  }
}

function readMeshes() {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup=new Uint8Array(128);
  for(let i=0;i<alphabet.length;i++)lookup[alphabet.charCodeAt(i)]=i;
  const padding=sculptureData.endsWith('==')?2:sculptureData.endsWith('=')?1:0;
  const bytes=new Uint8Array(sculptureData.length*3/4-padding);
  for(let i=0,n=0;i<sculptureData.length;i+=4){
    const c=(lookup[sculptureData.charCodeAt(i)]<<18)|(lookup[sculptureData.charCodeAt(i+1)]<<12)|
      (lookup[sculptureData.charCodeAt(i+2)]<<6)|lookup[sculptureData.charCodeAt(i+3)];
    bytes[n++]=c>>16; bytes[n++]=c>>8; bytes[n++]=c;
  }
  let offset=0;
  const view=new DataView(bytes.buffer);
  function u16(){const n=view.getUint16(offset,true);offset+=2;return n;}
  const count=u16(), groups=[];
  for(let part=0;part<count;part++){
    const vertexCount=u16(), faceCount=u16(), vertices=[], faces=[];
    for(let i=0;i<vertexCount;i++){
      const p=[view.getInt16(offset,true),view.getInt16(offset+2,true),view.getInt16(offset+4,true)].map(v=>v/10000);
      const n=[view.getInt8(offset+6),view.getInt8(offset+7),view.getInt8(offset+8)].map(v=>v/127);
      offset+=9;
      vertices.push({p,n,weights:attachments(p,part),muscle:muscleFor(part,...p)});
    }
    for(let i=0;i<faceCount;i++){
      const indices=[u16(),u16(),u16()];
      const center=indices.map(index=>vertices[index].p).reduce(add,[0,0,0]).map(v=>v/3);
      faces.push({indices,muscle:muscleFor(part,...center)});
    }
    groups.push({vertices,faces});
  }
  if(offset!==bytes.length||count!==16)throw new Error('Invalid anatomy sculpture data');
  return groups;
}
let meshes;

/** Shortest rotation aligns the original segment with the posed guide joint pair. */
function skinTransform([start,end],[origin,target]) {
  const from=sub(end,start),to=sub(target,origin),a=unit(from),b=unit(to);
  const cosine=clamp(dot(a,b),-1,1), crossAxis=cross(a,b);
  const axis=cosine<-.9999?unit(cross(a,Math.abs(a[0])<.9?[1,0,0]:[0,0,1])):crossAxis;
  const stretch=clamp(length(to)/(length(from)||1),.50,1.70)-1;
  const rotate=v=>{
    if(cosine<-.9999)return sub(mul(axis,2*dot(axis,v)),v);
    const w=cross(axis,v);
    return add(v,add(w,mul(cross(axis,w),1/(1+cosine))));
  };
  return {
    point:v=>{
      const q=sub(v,start);
      return add(origin,rotate(add(q,mul(a,dot(q,a)*stretch))));
    },
    normal:rotate,
  };
}

const surface=[207,203,198], inner=[162,161,159], violet=[127,120,177];
const scaleColor=(n,light,level,part)=>{
  const base=part<2?inner:surface;
  const reflect=.52+.47*Math.max(0,dot(n,light));
  const tint=base.map((channel,k)=>Math.round(reflect*(channel+(violet[k]-channel)*level)));
  return (tint[0]<<16)|(tint[1]<<8)|tint[2];
};

/** Shared draw data for every muscle view, with sixteen values per triangle. */
/** @param {{joints:number[][],yaw:number,scale:number,centerX:number,centerY:number,
 * exerciseId?:string,phase?:number,selected?:string|null,palette:{bg:string,ink:string,accent:string},
 * highlights?:string[],heat?:Record<string,number>}} options */
export function projectAnatomy({joints,yaw,scale,centerX,centerY,exerciseId='',phase=0,selected=null,highlights=[],heat}) {
  meshes??=readMeshes();
  const target=segments(joints);
  const transforms=rest.map((segment,i)=>skinTransform(segment,target[i]));
  const camera=[Math.sin(yaw)*.95,.31,Math.cos(yaw)*.95];
  const light=unit(add(camera,[-.59,.85,.27]));
  const roles=muscleRoles[exerciseId]??{primary:[],secondary:[]};
  const {intensity}=contractionState(phase);
  const emphasis=new Set(highlights);
  if(selected)emphasis.add(selected);
  function tint(id){
    if(!id)return 0;
    if(emphasis.has(id))return .94;
    if(heat)return clamp(heat[id]??0);
    return roles.primary.includes(id)?.80+intensity*.15:roles.secondary.includes(id)?.44:0;
  }
  const faces=[];
  for(const [part,mesh] of meshes.entries()){
    const projected=mesh.vertices.map(({p,n,weights,muscle})=>{
      let point=[0,0,0],normal=[0,0,0];
      for(const [bone,weight] of weights){
        point=add(point,mul(transforms[bone].point(p),weight));
        normal=add(normal,mul(transforms[bone].normal(n),weight));
      }
      normal=unit(normal);
      return {screen:project(point,yaw,scale,centerX,centerY).slice(0,2),depth:dot(point,camera),
        facing:dot(normal,camera),color:scaleColor(normal,light,tint(muscle),part)};
    });
    for(const {indices,muscle} of mesh.faces){
      const [a,b,c]=indices.map(index=>projected[index]);
      if(a.facing+b.facing+c.facing<-.13)continue;
      const screen=[a.screen,b.screen,c.screen,c.screen],depths=[a.depth,b.depth,c.depth,c.depth];
      const vertexColors=[a.color,b.color,c.color,c.color];
      const [ax,ay]=a.screen,[bx,by]=b.screen,[cx,cy]=c.screen;
      const box=[Math.min(ax,bx,cx),Math.min(ay,by,cy),Math.max(ax,bx,cx),Math.max(ay,by,cy)];
      faces.push({screen,box,depths,depth:(a.depth+b.depth+c.depth)/3,muscle,
        primary:muscle?roles.primary.indexOf(muscle):-1,color:vertexColors[0],vertexColors});
    }
  }
  faces.sort((a,b)=>a.depth-b.depth);
  const coordinates=[];
  for(const f of faces)for(let i=0;i<4;i++)coordinates.push(
    Math.round(f.screen[i][0]*100)/100,Math.round(f.screen[i][1]*100)/100,f.depths[i],f.vertexColors[i]);
  return {faces,coordinates};
}

/** 가장 앞에 그려진 면만 선택합니다. 몸에 가린 근육은 탭할 수 없습니다. */
export function faceAt(faces,x,y) {
  let best=null, depth=-Infinity;
  for(let i=faces.length-1;i>=0;i--){
    const face=faces[i];
    if(face.box&&(x<face.box[0]||x>face.box[2]||y<face.box[1]||y>face.box[3])) continue;
    for(let triangle=0;triangle<2;triangle++){
      const u=0,v=triangle+1,w=triangle+2;
      const p=face.screen[u],q=face.screen[v],r=face.screen[w];
      const den=(q[1]-r[1])*(p[0]-r[0])+(r[0]-q[0])*(p[1]-r[1]);
      if(Math.abs(den)<1e-8) continue;
      const s=((q[1]-r[1])*(x-r[0])+(r[0]-q[0])*(y-r[1]))/den;
      const t=((r[1]-p[1])*(x-r[0])+(p[0]-r[0])*(y-r[1]))/den;
      if(s<0||t<0||s+t>1) continue;
      const z=face.depths?s*face.depths[u]+t*face.depths[v]+(1-s-t)*face.depths[w]:(face.depth??i);
      if(z>depth){depth=z;best=face;}
    }
  }
  return best;
}

/** 가려지지 않은 주동근 표면에만 기존 번호를 하나씩 표시합니다. */
export function visibleMuscleMarkers(faces) {
  const found=new Map();
  for(let i=faces.length-1;i>=0;i--) {
    const face=faces[i];
    if(face.primary<0||found.has(face.muscle)) continue;
    const x=face.screen.reduce((sum,p) => sum+p[0],0)/4;
    const y=face.screen.reduce((sum,p) => sum+p[1],0)/4;
    if(faceAt(faces,x,y)?.muscle===face.muscle) found.set(face.muscle,{id:face.muscle,order:face.primary,x,y});
  }
  return [...found.values()];
}



