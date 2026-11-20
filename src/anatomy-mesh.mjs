// 운동 자세의 관절 사이에 몸통과 팔다리의 단면을 연결하고, 근육 면을 표면에 붙입니다.
import {project} from './motion-guide.mjs';
import {bodyFrame, contractionState, muscleRoles} from './muscle-map.mjs';

const TAU = 2 * Math.PI;
const RING_SIDES = 16;
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
const torso = [[-.17,.018,.026],[-.02,.199,.115],[.20,.197,.118],[.40,.148,.091],[.59,.172,.111],[.77,.217,.129],[.91,.198,.104],[1.03,.080,.067],[1.12,.032,.034]];
const neck = [[-.25,.057,.049],[.2,.058,.053],[.54,.062,.059],[.82,.048,.047]];
const head = [[-.90,.025,.036],[-.62,.060,.072],[-.26,.085,.091],[.02,.095,.103],[.31,.082,.089],[.50,.048,.053],[.56,.004,.005]];
const upperArm = [[-.19,.035,.035],[.02,.077,.075],[.27,.072,.069],[.56,.062,.059],[.83,.047,.046],[1.10,.035,.036]];
const forearm = [[-.13,.036,.034],[.12,.051,.047],[.35,.050,.045],[.64,.037,.034],[.95,.028,.024],[1.10,.026,.023]];
const hand = [[-.28,.027,.024],[.02,.042,.030],[.35,.040,.026],[.65,.032,.022],[.86,.011,.009]];
const thigh = [[-.15,.069,.071],[.08,.106,.108],[.31,.102,.107],[.62,.082,.083],[.87,.060,.060],[1.08,.049,.051]];
const shin = [[-.11,.044,.045],[.12,.060,.062],[.34,.067,.076],[.57,.055,.064],[.82,.034,.042],[1.05,.026,.032]];
const foot = [[-.32,.027,.037],[.02,.048,.045],[.32,.051,.037],[.66,.053,.027],[.94,.043,.021],[1.05,.010,.011]];

// 이름이 같은 여러 표면을 한 근육으로 선택합니다. 각 항목은 [id, 축 시작, 축 끝, 중심각, 각 너비]입니다.
const torsoMuscles = [
  ['pec',.68,.95,.58,.52],['pec',.68,.95,-.58,.52],
  ['abs',.23,.42,0,.57],['abs',.42,.56,0,.60],['abs',.56,.69,0,.57],
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
  return [x0+(x1-x0)*k,z0+(z1-z0)*k];
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

const rgb = hex => [1,3,5].map(i => Number.parseInt(hex.slice(i,i+2),16));
const blend = (a,b,k) => a.map((v,i) => Math.round(v+(b[i]-v)*k));
const packed = ([r,g,b]) => (r<<16)|(g<<8)|b;

function shade(colors,role,amount,selected,normal,light) {
  const dark = colors.bg[0] < 90;
  const base = dark ? [161,168,188] : [140,147,167];
  const amountLit = clamp(dot(normal,light),0,1);
  const paint = role === 'primary' ? .74+amount*.21 : role === 'secondary' ? .36+amount*.10 : role === 'inactive' ? .08 : 0;
  const target = role === 'inactive' ? colors.ink : blend(colors.accent,[60,87,217],dark ? .64 : .30);
  const mix = blend(base,target,selected ? 1 : paint);
  return packed(blend(blend(mix,[12,16,27],.49*(1-amountLit)),[255,255,255],.16*amountLit));
}

/** 뒤→앞 순서의 면과 캔버스용 숫자 버퍼를 만듭니다. 포즈와 입력 파일은 한 운동에서 공유합니다. */
export function projectAnatomy({joints,yaw,scale,centerX,centerY,exerciseId,phase,selected,palette}) {
  const frame = bodyFrame(joints);
  const camera = [Math.sin(yaw)*.95,.31,Math.cos(yaw)*.95];
  const light = unit(add(camera,[-.45,.68,.15]));
  const colors = {bg:rgb(palette.bg),ink:rgb(palette.ink),accent:rgb(palette.accent)};
  const roles = muscleRoles[exerciseId] ?? {primary:[],secondary:[]};
  const {intensity} = contractionState(phase);
  const faces = [];
  function surface(point,stops,circumference,minAngle,maxAngle,lift,muscle,capped=false) {
    const primary = muscle ? roles.primary.indexOf(muscle) : -1;
    const role = primary >= 0 ? 'primary' : roles.secondary.includes(muscle) ? 'secondary' : muscle ? 'inactive' : 'body';
    const steps = stops.length - 1;
    const rings = stops.map((t,i) => {
      const progress = i/steps;
      const span = muscle ? .15+.85*Math.sin(Math.PI*progress)**.63 : 1;
      const middle = (minAngle+maxAngle)/2;
      const amount = lift*(.15+.85*Math.sin(Math.PI*progress));
      return Array.from({length:circumference+1},(_,j) => {
        const angle = minAngle+(maxAngle-minAngle)*j/circumference;
        return point(t,middle+(angle-middle)*span,amount);
      });
    });
    function storeFace(vertices,outward) {
      let normal = unit(cross(sub(vertices[1],vertices[0]),sub(vertices[3],vertices[0])));
      if (dot(normal,outward)<0) normal=mul(normal,-1);
      if (dot(normal,camera)<=.015) return;
      const screen = vertices.map(v => project(v,yaw,scale,centerX,centerY).slice(0,2));
      const depth = vertices.reduce((sum,v) => sum+dot(v,camera),0)/4;
      faces.push({screen,depth,muscle,primary,color:shade(colors,role,intensity,muscle&&muscle===selected,normal,light)});
    }
    for(let i=0;i<steps;i++) {
      const t = (stops[i]+stops[i+1])/2;
      const center = midpoint(point(t,0),point(t,Math.PI));
      for(let j=0;j<circumference;j++) {
        const a=rings[i][j], b=rings[i][j+1], c=rings[i+1][j+1], d=rings[i+1][j];
        storeFace([a,b,c,d],sub(midpoint(a,c),center));
      }
    }
    if (capped) {
      const from=stops[0], to=stops[steps];
      const start = midpoint(point(from,0),point(from,Math.PI));
      const end = midpoint(point(to,0),point(to,Math.PI));
      const axis = sub(end,start);
      for(let j=0;j<circumference;j++) {
        storeFace([start,rings[0][j],rings[0][j],rings[0][j+1]],mul(axis,-1));
        storeFace([end,rings[steps][j],rings[steps][j],rings[steps][j+1]],axis);
      }
    }
  }
  function body(start,end,profile,patches=[],sign=1,width=1) {
    const point=loft(start,end,profile,frame,sign,width);
    // 단면을 나누는 위치에서 허리와 관절의 너비가 유지되도록 합니다.
    surface(point,profile.map(([t]) => t),RING_SIDES,0,TAU,0,null,true);
    for(const [id,a,b,angle,span] of patches) {
      const lift = roles.primary.includes(id) ? .008+.009*intensity : .007;
      const stops=Array.from({length:5},(_,i) => a+(b-a)*i/4);
      surface(point,stops,4,angle-span,angle+span,lift,id);
    }
  }
  const shoulderWidth=clamp(norm(sub(joints[3],joints[10]))/.46,.84,1.15);
  body(joints[2],joints[1],torso,torsoMuscles,1,shoulderWidth);
  body(joints[1],midpoint(joints[1],joints[0]),neck);
  body(joints[0],add(joints[0],mul(unit(sub(joints[0],joints[1])),.18)),head);
  for(const [sign,offset] of [[1,0],[-1,7]]) {
    const [shoulder,elbow,wrist,hip,knee,ankle,toe]=joints.slice(3+offset,10+offset);
    body(shoulder,elbow,upperArm,upperArmMuscles,sign);
    body(elbow,wrist,forearm,[['forearm',.10,.91,.11,.93]],sign);
    body(wrist,add(wrist,mul(unit(sub(wrist,elbow)),.104)),hand,[],sign);
    body(hip,knee,thigh,thighMuscles,sign);
    body(knee,ankle,shin,shinMuscles,sign);
    body(ankle,toe,foot,[],sign);
  }
  faces.sort((a,b) => a.depth-b.depth);
  const coordinates=faces.flatMap(f => [...f.screen.flat().map(n => Math.round(n*10)/10),f.color]);
  return {faces,coordinates};
}

/** 가장 앞에 그려진 면만 선택합니다. 몸에 가린 근육은 탭할 수 없습니다. */
export function faceAt(faces,x,y) {
  for(let i=faces.length-1;i>=0;i--) {
    const face=faces[i];
    let inside=false;
    for(let a=0,b=face.screen.length-1;a<face.screen.length;b=a++) {
      const [ax,ay]=face.screen[a], [bx,by]=face.screen[b];
      if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
    }
    if(inside) return face;
  }
  return null;
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
