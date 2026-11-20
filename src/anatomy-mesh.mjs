// 운동 자세의 관절 사이에 몸통과 팔다리의 단면을 연결하고, 근육 면을 표면에 붙입니다.
import {project} from './motion-guide.mjs';
import {bodyFrame, contractionState, muscleRoles} from './muscle-map.mjs';

const TAU = 2 * Math.PI;
const RING_SIDES = 22;
const add = (a,b) => a.map((v,i) => v+b[i]);
const sub = (a,b) => a.map((v,i) => v-b[i]);
const mul = (v,k) => v.map(a => a*k);
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = v => Math.hypot(...v);
const unit = v => mul(v,1/(norm(v) || 1));
const midpoint = (a,b) => mul(add(a,b),.5);
const clamp = (x,min,max) => Math.min(max,Math.max(min,x));

// t, 가로 반경, 앞뒤 반경. 몸통은 골반→목, 사지는 몸에 가까운 관절→먼 관절입니다.
const torso = [[-.22,.042,.036],[-.12,.145,.090],[.02,.196,.113],[.19,.191,.119],[.36,.145,.094],[.50,.151,.099],[.68,.192,.124],[.83,.224,.139],[.93,.193,.112],[1.03,.085,.067],[1.13,.048,.041]];
const neck = [[-.28,.047,.051],[.12,.055,.063],[.52,.048,.052],[.90,.042,.040],[1.08,.039,.037]];
const head = [[-.84,.034,.039],[-.64,.048,.055],[-.38,.067,.075],[-.12,.083,.091],[.13,.085,.085],[.32,.070,.074],[.48,.040,.047],[.55,.003,.005]];
const upperArm = [[-.28,.025,.032],[-.13,.069,.064],[.07,.083,.079],[.28,.069,.071],[.52,.059,.060],[.78,.044,.045],[.99,.042,.042],[1.09,.031,.033]];
const forearm = [[-.13,.036,.034],[.12,.051,.047],[.35,.050,.045],[.64,.037,.034],[.95,.028,.024],[1.10,.026,.023]];
const hand = [[-.28,.027,.024],[.02,.042,.030],[.35,.040,.026],[.65,.032,.022],[.86,.011,.009]];
const thigh = [[-.22,.059,.063],[-.07,.092,.097],[.12,.109,.109],[.31,.105,.105],[.55,.086,.089],[.77,.069,.072],[.94,.056,.055],[1.10,.040,.043]];
const shin = [[-.17,.036,.043],[.01,.051,.051],[.15,.058,.061],[.30,.064,.074],[.51,.049,.064],[.72,.036,.046],[.90,.028,.032],[1.08,.024,.027]];
const foot = [[-.32,.027,.037],[.02,.048,.045],[.32,.051,.037],[.66,.053,.027],[.94,.043,.021],[1.05,.010,.011]];

// 이름이 같은 여러 표면을 한 근육으로 선택합니다. 각 항목은 [id, 축 시작, 축 끝, 중심각, 각 너비]입니다.
const torsoMuscles = [
  ['pec',.68,.95,.58,.52],['pec',.68,.95,-.58,.52],
  ['abs',.22,.43,.22,.22],['abs',.22,.43,-.22,.22],
  ['abs',.38,.57,.26,.25],['abs',.38,.57,-.26,.25],
  ['abs',.53,.70,.27,.26],['abs',.53,.70,-.27,.26],
  ['traps',.71,1.015,Math.PI-.40,.44],['traps',.71,1.015,Math.PI+.40,.44],
  ['lats',.41,.81,Math.PI-.99,.54],['lats',.41,.81,Math.PI+.99,.54],
  ['erectors',.22,.73,Math.PI-.21,.19],['erectors',.22,.73,Math.PI+.21,.19],
  ['glute',-.13,.28,Math.PI-.58,.55],['glute',-.13,.28,Math.PI+.58,.55],
];
const upperArmMuscles = [
  ['delt-front',-.14,.32,.48,.50],['delt-lat',-.13,.37,Math.PI/2,.48],
  ['delt-rear',-.14,.34,Math.PI-.47,.47],
  ['biceps',.30,.88,.05,.83],['triceps',.30,.92,Math.PI,.86],
];
const thighMuscles = [
  ['quads',.08,.89,.05,.40],['quads',.08,.84,.77,.39],['quads',.22,.92,-.63,.43],
  ['hamstrings',.11,.85,Math.PI+.42,.44],['hamstrings',.10,.85,Math.PI-.42,.44],
];
const shinMuscles = [
  ['calves',.08,.65,Math.PI-.42,.45],['calves',.09,.66,Math.PI+.42,.45],
  ['soleus',.46,.90,Math.PI,.70],
];

function radii(profile,t) {
  const high = profile.findIndex(([at]) => at >= t);
  if (high <= 0) return profile[high === 0 ? 0 : profile.length-1].slice(1);
  const [a,x0,z0] = profile[high-1];
  const [b,x1,z1] = profile[high];
  const k = (t-a)/(b-a);
  // Use cubic tangents along the longitudinal profile, with radii bounded by the neighboring rings.
  const prev=profile[Math.max(0,high-2)], next=profile[Math.min(profile.length-1,high+1)];
  const start=profile[high-1],end=profile[high];
  const k2=k*k,k3=k2*k;
  return [x0,z0].map((v,i)=>{
    const w=i?z1:x1, component=i+1;
    const m0=(end[component]-prev[component])*(b-a)/(b-prev[0]);
    const m1=(next[component]-start[component])*(b-a)/(next[0]-a);
    return clamp((2*k3-3*k2+1)*v+(k3-2*k2+k)*m0+(-2*k3+3*k2)*w+(k3-k2)*m1,Math.min(v,w),Math.max(v,w));
  });
}

/** 부위의 중심축과 앞·옆 축을 자세에서 계산한 뒤 표면 위치를 반환합니다. */
function loft(start,end,profile,frame,sideSign=1,widthScale=1) {
  const length = sub(end,start);
  const axis = unit(length);
  const flatten = v => sub(v,mul(axis,dot(v,axis)));
  const projected = flatten(frame.forward);
  const forward = unit(norm(projected) > .09 ? projected : flatten(frame.up));
  const right = unit(cross(axis,forward));
  const outward = mul(right,dot(right,frame.side) < 0 ? -sideSign : sideSign);
  return (t,angle,lift=0) => {
    const [w,d] = radii(profile,t);
    const center = add(start,mul(length,t));
    return add(center,add(mul(outward,Math.sin(angle)*(w*widthScale+lift)),mul(forward,Math.cos(angle)*(d+lift))));
  };
}

const blend = (a,b,k) => a.map((v,i) => Math.round(v+(b[i]-v)*k));
const packed = ([r,g,b]) => (r<<16)|(g<<8)|b;

// Warm ceramic and charcoal from the sculpt reference. Only data-selected muscles take the muted violet.
const ivory=[224,214,202], charcoal=[67,65,71], violet=[114,109,165];
function shade(normal,light,paint,cloth) {
  const base=cloth?charcoal:ivory;
  const tone=blend(base,violet,paint);
  const diffuse=clamp(dot(normal,light),0,1);
  const value=blend(tone,[47,43,49],.52*(1-diffuse)**1.5);
  return packed(blend(value,[255,247,236],.15*diffuse**2));
}

/** 뒤→앞 순서의 면과 캔버스용 숫자 버퍼를 만듭니다. 포즈와 입력 파일은 한 운동에서 공유합니다. */
/** @param {{joints:number[][], yaw:number, scale:number, centerX:number, centerY:number,
 * exerciseId?:string, phase?:number, selected?:string|null, palette:{bg:string,ink:string,accent:string},
 * highlights?:string[], heat?:Record<string, number>}} options */
export function projectAnatomy({joints,yaw,scale,centerX,centerY,exerciseId='',phase=0,selected=null,highlights=[],heat}) {
  const frame = bodyFrame(joints);
  const camera = [Math.sin(yaw)*.95,.31,Math.cos(yaw)*.95];
  const light = unit(add(camera,[-.66,.87,.21]));
  const roles = muscleRoles[exerciseId] ?? {primary:[],secondary:[]};
  const {intensity} = contractionState(phase);
  const faces = [];
  const emphasized = new Set(highlights);
  if (selected) emphasized.add(selected);
  // Each vertex belongs to several faces. Project it once per frame.
  const projected = new Map();
  const toScreen = vertex => {
    let xy = projected.get(vertex);
    if (!xy) {
      xy = project(vertex,yaw,scale,centerX,centerY).slice(0,2);
      projected.set(vertex,xy);
    }
    return xy;
  };
  function closestMuscle(patches,t,angle) {
    let best=null, distance=1;
    for(const [id,from,to,center,span] of patches) {
      if(t<=from||t>=to) continue;
      const delta=Math.atan2(Math.sin(angle-center),Math.cos(angle-center));
      const score=(2*(t-from)/(to-from)-1)**2+(delta/span)**2;
      if(score<distance){ best=id; distance=score; }
    }
    return {muscle:best,distance};
  }
  function body(start,end,profile,patches=[],sign=1,width=1,kind='',customPoint) {
    const point=customPoint??loft(start,end,profile,frame,sign,width);
    const steps=patches.length?3:2, sides=patches.length?26:RING_SIDES;
    const stops=profile.flatMap(([t],i)=>i?Array.from({length:steps},(_,j)=>profile[i-1][0]+(t-profile[i-1][0])*(j+1)/steps):[t]);
    const ringPoint=(t,angle)=>{
      const {muscle,distance}=closestMuscle(patches,t,angle);
      const amplitude=muscle==='pec'||muscle==='glute' ? .041 : muscle==='quads'||muscle==='calves' ? .027 : muscle==='abs' ? .023 : .019;
      const relief=muscle?(1-distance)**1.7*(amplitude+(roles.primary.includes(muscle) ? .008*intensity : 0)):0;
      return point(t,angle,relief);
    };
    const centers=stops.map(t=>midpoint(point(t,0),point(t,Math.PI)));
    const rings=stops.map(t=>Array.from({length:sides},(_,j)=>ringPoint(t,j*TAU/sides)));
    const markings=stops.map(t=>Array.from({length:sides},(_,j)=>closestMuscle(patches,t,j*TAU/sides)));
    // Derivatives of the connected surface give one shared normal per vertex.
    const normals=rings.map((row,i)=>row.map((vertex,j)=>{
      const a=sub(rings[Math.min(i+1,rings.length-1)][j],rings[Math.max(i-1,0)][j]);
      const b=sub(row[(j+1)%sides],row[(j+sides-1)%sides]);
      const n=unit(cross(a,b));
      return dot(n,sub(vertex,centers[i]))<0?mul(n,-1):n;
    }));
    function storeFace(vertices,vertexNormals,muscle=null,cloth=false,pointMuscles) {
      if(vertexNormals.every(normal=>dot(normal,camera)<-.10)) return;
      const screen=vertices.map(toScreen);
      const depths=vertices.map(v=>dot(v,camera));
      const depth=depths.reduce((sum,z)=>sum+z,0)/4;
      const primary=muscle?roles.primary.indexOf(muscle):-1;
      const vertexColors=vertexNormals.map((n,i)=>{
        const sample=pointMuscles?.[i];
        const id=sample?.muscle;
        const role=id&&roles.primary.includes(id)?'primary':id&&roles.secondary.includes(id)?'secondary':'body';
        const weight=id?clamp((1-sample.distance)*5,0,1):0;
        const level=heat ? (heat[id]??0) : emphasized.has(id) ? .91 : role==='primary' ? .67+intensity*.20 : role==='secondary' ? .40 : 0;
        return shade(n,light,clamp(level*weight,0,1),cloth);
      });
      const box=screen.reduce(([minX,minY,maxX,maxY],[x,y])=>[Math.min(minX,x),Math.min(minY,y),Math.max(maxX,x),Math.max(maxY,y)],[Infinity,Infinity,-Infinity,-Infinity]);
      faces.push({screen,box,depths,depth,muscle,primary,color:vertexColors[0],vertexColors});
    }
    for(let i=0;i<stops.length-1;i++){
      const t=(stops[i]+stops[i+1])/2;
      for(let j=0;j<sides;j++){
        const next=(j+1)%sides, angle=(j+.5)*TAU/sides;
        const {muscle}=closestMuscle(patches,t,angle);
        const rear=Math.cos(angle)<-.18;
        const cloth=kind==='pelvis'&&t<.26&&t>-.24&&(!rear||t>.14);
        const a=rings[i][j],b=rings[i][next],c=rings[i+1][next],d=rings[i+1][j];
        storeFace([a,b,c,d],[normals[i][j],normals[i][next],normals[i+1][next],normals[i+1][j]],muscle,cloth,[markings[i][j],markings[i][next],markings[i+1][next],markings[i+1][j]]);
      }
    }
    const axis=unit(sub(centers.at(-1),centers[0]));
    const tail=rings.at(-1);
    for(let j=0;j<sides;j++){
      const next=(j+1)%sides;
      storeFace([centers[0],rings[0][j],rings[0][next],rings[0][next]],[mul(axis,-1),normals[0][j],normals[0][next],normals[0][next]]);
      storeFace([centers.at(-1),tail[j],tail[next],tail[next]],[axis,normals.at(-1)[j],normals.at(-1)[next],normals.at(-1)[next]]);
    }
  }
  // Carry a single surface through each flexing joint so elbows and knees do not show detached caps.
  function limb(start,joint,end,near,far,nearMuscles,farMuscles,sign) {
    const proximal=loft(start,joint,near,frame,sign);
    const distal=loft(joint,end,far,frame,sign);
      const shifted=far.filter(([t])=>t>=.10).map(([t,w,d])=>[t+1,w,d]);
    const profile=[...near.filter(([t])=>t<.90),[.90,.04,.04],[1,.04,.04],...shifted];
    const regions=[...nearMuscles,...farMuscles.map(([id,a,b,c,d])=>[id,a+1,b+1,c,d])];
    const point=(t,angle,lift)=>{
      if(t<=.82) return proximal(t,angle,lift);
      if(t>=1.17) return distal(t-1,angle,lift);
      const x=(t-.82)/.35;
      const k=x*x*(3-2*x);
      return add(mul(proximal(t,angle,lift),1-k),mul(distal(t-1,angle,lift),k));
    };
    body(start,end,profile,regions,sign,1,'',point);
  }
  const shoulderWidth=clamp(norm(sub(joints[3],joints[10]))/.46,.84,1.15);
  body(joints[2],joints[1],torso,torsoMuscles,1,shoulderWidth,'pelvis');
  body(joints[1],midpoint(joints[1],joints[0]),neck);
  body(joints[0],add(joints[0],mul(unit(sub(joints[0],joints[1])),.18)),head);
  for(const [sign,offset] of [[1,0],[-1,7]]) {
    const [shoulder,elbow,wrist,hip,knee,ankle,toe]=joints.slice(3+offset,10+offset);
    limb(shoulder,elbow,wrist,upperArm,forearm,upperArmMuscles,[['forearm',.10,.91,.11,.93]],sign);
    body(wrist,add(wrist,mul(unit(sub(wrist,elbow)),.104)),hand,[],sign);
    limb(hip,knee,ankle,thigh,shin,thighMuscles,shinMuscles,sign);
    body(ankle,toe,foot,[],sign);
  }
  faces.sort((a,b) => a.depth-b.depth);
  // Four vertices per face: x, y, true camera depth, RGB.
  const coordinates=[];
  for(const f of faces) for(let i=0;i<4;i++) coordinates.push(
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
