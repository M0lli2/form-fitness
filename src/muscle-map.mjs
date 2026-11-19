// 근육 해부 레이어. 근육은 관절에 고정된 타원체로 정의해 어떤 자세에서도 뼈대를 따라갑니다.
// 좌표계는 motion-guide.mjs와 같습니다: [좌우, 높이, 깊이], 깊이 양수가 앞쪽입니다.
import {project} from './motion-guide.mjs';

/** @typedef {{id:string, name:string, latin:string, region:string, mirror:boolean,
 *   center:[number,number][], axis:[number,number], span:number, thick:number,
 *   depth?:number, lift?:number, round?:boolean}} MuscleSpec */

/**
 * 부위별 근육. center는 관절 가중치의 합, axis는 근육이 붙는 두 관절입니다.
 * span은 축 길이에 대한 반길이 비율, thick은 몸통 단위 반지름입니다.
 */
/** @type {MuscleSpec[]} */
export const muscles = [
  // 몸통 앞면
  {id:'pec', name:'대흉근', latin:'Pectoralis major', region:'가슴', mirror:true,
    center:[[1,.5],[3,.5]], axis:[1,3], span:.52, thick:.100, depth:.085},
  {id:'abs', name:'복직근', latin:'Rectus abdominis', region:'코어', mirror:false,
    center:[[2,.45],[1,.55]], axis:[2,1], span:.55, thick:.115, depth:.075},
  // 몸통 뒷면
  {id:'traps', name:'승모근', latin:'Trapezius', region:'등', mirror:true,
    center:[[1,.45],[3,.55]], axis:[1,3], span:.50, thick:.070, depth:-.030},
  {id:'lats', name:'광배근', latin:'Latissimus dorsi', region:'등', mirror:true,
    center:[[2,.50],[3,.50]], axis:[2,3], span:.50, thick:.105, depth:-.065},
  {id:'erectors', name:'척추기립근', latin:'Erector spinae', region:'코어', mirror:false,
    center:[[2,.45],[1,.55]], axis:[2,1], span:.55, thick:.090, depth:-.070},
  // 어깨
  {id:'delt-front', name:'전면 삼각근', latin:'Anterior deltoid', region:'어깨', mirror:true,
    center:[[3,1]], axis:[3,4], span:.20, thick:.086, depth:.030},
  {id:'delt-lat', name:'측면 삼각근', latin:'Lateral deltoid', region:'어깨', mirror:true,
    center:[[3,1]], axis:[3,4], span:.22, thick:.098, depth:0},
  {id:'delt-rear', name:'후면 삼각근', latin:'Posterior deltoid', region:'어깨', mirror:true,
    center:[[3,1]], axis:[3,4], span:.20, thick:.082, depth:-.030},
  // 팔
  {id:'biceps', name:'상완이두근', latin:'Biceps brachii', region:'팔', mirror:true,
    center:[[3,.5],[4,.5]], axis:[3,4], span:.46, thick:.058, depth:.042},
  {id:'triceps', name:'상완삼두근', latin:'Triceps brachii', region:'팔', mirror:true,
    center:[[3,.5],[4,.5]], axis:[3,4], span:.50, thick:.062, depth:-.042},
  {id:'forearm', name:'전완근', latin:'Forearm flexors', region:'팔', mirror:true,
    center:[[4,.5],[5,.5]], axis:[4,5], span:.46, thick:.050, depth:.012},
  // 하체
  {id:'quads', name:'대퇴사두근', latin:'Quadriceps femoris', region:'하체', mirror:true,
    center:[[6,.5],[7,.5]], axis:[6,7], span:.50, thick:.094, depth:.055},
  {id:'hamstrings', name:'햄스트링', latin:'Hamstrings', region:'하체', mirror:true,
    center:[[6,.5],[7,.5]], axis:[6,7], span:.48, thick:.088, depth:-.050},
  {id:'glute', name:'대둔근', latin:'Gluteus maximus', region:'둔부', mirror:true,
    center:[[2,.40],[6,.60]], axis:[2,6], span:.85, thick:.105, depth:-.070},
  {id:'calves', name:'비복근', latin:'Gastrocnemius', region:'종아리', mirror:true,
    center:[[7,.62],[8,.38]], axis:[7,8], span:.50, thick:.074, depth:-.038},
  {id:'soleus', name:'가자미근', latin:'Soleus', region:'종아리', mirror:true,
    center:[[7,.30],[8,.70]], axis:[7,8], span:.40, thick:.062, depth:-.026},
];

/** 운동별 주동근(primary)과 보조근(secondary). 운동도감 3D 가이드와 1:1로 대응합니다. */
export const muscleRoles = {
  squat: {primary:['quads','glute'], secondary:['hamstrings','calves','abs','erectors']},
  goblet: {primary:['quads','glute'], secondary:['hamstrings','calves','abs','erectors','traps']},
  pushup: {primary:['pec','triceps'], secondary:['delt-front','abs','lats']},
  bridge: {primary:['glute','hamstrings'], secondary:['erectors','abs','calves']},
  calf: {primary:['calves','soleus'], secondary:['hamstrings','quads']},
  curl: {primary:['biceps'], secondary:['forearm','delt-front']},
  lateral: {primary:['delt-lat'], secondary:['traps','delt-front']},
  ohp: {primary:['delt-front','triceps'], secondary:['delt-lat','traps','abs','pec']},
  // ── 핵심 복합·고립 운동 14종 (v2 확장) ──
  bench: {primary:['pec','triceps'], secondary:['delt-front','lats','abs']},
  'back-squat': {primary:['quads','glute'], secondary:['hamstrings','erectors','abs','calves']},
  deadlift: {primary:['glute','hamstrings','erectors'], secondary:['quads','lats','traps','forearm']},
  lat: {primary:['lats'], secondary:['biceps','delt-rear','traps','forearm']},
  pullup: {primary:['lats','biceps'], secondary:['traps','delt-rear','forearm','abs']},
  'bar-row': {primary:['lats','traps'], secondary:['biceps','delt-rear','erectors','forearm']},
  lunge: {primary:['quads','glute'], secondary:['hamstrings','calves','abs','erectors']},
  hipthrust: {primary:['glute','hamstrings'], secondary:['quads','erectors','abs']},
  legpress: {primary:['quads'], secondary:['glute','hamstrings','calves']},
  pushdown: {primary:['triceps'], secondary:['forearm','abs']},
  facepull: {primary:['delt-rear','traps'], secondary:['delt-lat','biceps','erectors']},
  plank: {primary:['abs'], secondary:['erectors','delt-front','glute','quads']},
  dips: {primary:['triceps','pec'], secondary:['delt-front','abs']},
  'db-shoulder': {primary:['delt-front'], secondary:['triceps','delt-lat','traps']},
};

/**
 * 인체 실루엣. 머리부터 발까지 캡슐을 겹쳐 몸이 사람으로 읽히게 합니다.
 * round는 축 길이와 무관한 구(머리)입니다.
 */
export const bodyParts = [
  {id:'head', round:true, center:[[0,1]], axis:[0,1], span:.10, thick:.108},
  {id:'neck', center:[[1,.58],[0,.42]], axis:[1,0], span:.46, thick:.068},
  {id:'chest', center:[[1,.78],[2,.22]], axis:[1,2], span:.36, thick:.185},
  {id:'shoulders', center:[[3,.5],[10,.5]], axis:[3,10], span:.50, thick:.075},
  {id:'waist', center:[[1,.28],[2,.72]], axis:[1,2], span:.32, thick:.142},
  {id:'hips', center:[[2,1]], axis:[6,13], span:.50, thick:.092},
  {id:'upperarm', mirror:true, center:[[3,.5],[4,.5]], axis:[3,4], span:.55, thick:.050},
  {id:'forearm', mirror:true, center:[[4,.5],[5,.5]], axis:[4,5], span:.55, thick:.040},
  {id:'hand', mirror:true, center:[[5,1]], axis:[4,5], span:.22, thick:.038},
  {id:'thigh', mirror:true, center:[[6,.5],[7,.5]], axis:[6,7], span:.55, thick:.076},
  {id:'shin', mirror:true, center:[[7,.5],[8,.5]], axis:[7,8], span:.55, thick:.050},
  {id:'foot', mirror:true, center:[[8,.65],[9,.35]], axis:[8,9], span:.55, thick:.036},
];

const specById = new Map(muscles.map(m => [m.id, m]));

const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul = (a,k) => [a[0]*k, a[1]*k, a[2]*k];
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const length = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => { const n = length(a) || 1; return [a[0]/n, a[1]/n, a[2]/n]; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 자세의 몸통 기준축. 위(골반→목), 옆(오른어깨→왼어깨), 앞(가슴이 향하는 쪽)을 돌려줍니다. */
export function bodyFrame(joints) {
  const up = unit(sub(joints[1], joints[2]));
  const side = unit(sub(joints[3], joints[10]));
  let forward = cross(side, up);
  if (length(forward) < 1e-6) forward = [0, 0, 1];    // 팔을 완전히 접은 예외 자세의 안전값
  forward = unit(forward);
  return {up: unit(cross(forward, side)), side, forward};
}

/** 관절 인덱스와 가중치의 합으로 근육 중심을 만듭니다. */
function weighted(joints, pairs) {
  const total = pairs.reduce((sum, [,w]) => sum + w, 0) || 1;
  return pairs.reduce((point, [i,w]) => add(point, mul(joints[i], w/total)), [0,0,0]);
}

/** 근육 하나를 자세에 맞춰 타원체(양 끝점 + 반지름)로 풀어냅니다. */
export function resolveMuscle(spec, joints, frame) {
  const half = spec.span * length(sub(joints[spec.axis[1]], joints[spec.axis[0]]));
  const dir = unit(sub(joints[spec.axis[1]], joints[spec.axis[0]]));
  const center = add(add(weighted(joints, spec.center),
    mul(frame.forward, spec.depth ?? 0)), mul(frame.up, spec.lift ?? 0));
  return {
    a: add(center, mul(dir, -half)),
    b: add(center, mul(dir, half)),
    thick: spec.thick,
  };
}

/** 운동의 활성 근육을 범례 순서대로 돌려줍니다. */
export function activeMuscles(exerciseId) {
  const roles = muscleRoles[exerciseId];
  if (!roles) return {primary: [], secondary: []};
  return {
    primary: roles.primary.map(id => specById.get(id)),
    secondary: roles.secondary.map(id => specById.get(id)),
  };
}

/**
 * 근육 레이어를 화면 좌표 타원으로 투영합니다.
 * 반환 목록은 뒤쪽(depth 작음)부터 정렬되어 있어 그 순서대로 그리면 앞 근육이 위에 옵니다.
 * facing은 근육이 카메라를 향한 정도(1=정면, .55=측면, .18=반대편)입니다.
 */
export function projectMuscles({joints, yaw, scale, centerX, centerY, exerciseId, includeInactive = true}) {
  const frame = bodyFrame(joints);
  const roles = muscleRoles[exerciseId] ?? {primary: [], secondary: []};
  const rank = new Map();
  roles.primary.forEach((id, i) => rank.set(id, {role: 'primary', order: i}));
  roles.secondary.forEach(id => { if (!rank.has(id)) rank.set(id, {role: 'secondary', order: -1}); });
  // 카메라가 보는 축. project()의 depth와 같은 방향입니다.
  const viewAxis = [Math.sin(yaw), 0, Math.cos(yaw)];
  const shapes = [];
  for (const spec of muscles) {
    const info = rank.get(spec.id);
    const role = info ? info.role : 'inactive';
    if (role === 'inactive' && !includeInactive) continue;
    const base = resolveMuscle(spec, joints, frame);
    const anatomical = spec.depth > 0 ? 'front' : spec.depth < 0 ? 'back' : 'side';
    const normal = anatomical === 'front' ? frame.forward : anatomical === 'back' ? mul(frame.forward, -1) : null;
    const facing = normal
      ? clamp(.55 + .45 * (normal[0]*viewAxis[0] + normal[1]*viewAxis[1] + normal[2]*viewAxis[2]), .18, 1)
      : .7;
    for (const sign of (spec.mirror ? [1, -1] : [1])) {
      const mirror = (p) => [p[0]*sign, p[1], p[2]];
      const a = project(mirror(base.a), yaw, scale, centerX, centerY);
      const b = project(mirror(base.b), yaw, scale, centerX, centerY);
      const depth = (a[2]+b[2])/2;
      const persp = 1 + clamp(depth, -.6, .6) * .14;
      const span = Math.hypot(b[0]-a[0], b[1]-a[1]);
      const thick = spec.thick * 2 * scale * persp;
      shapes.push({
        id: spec.id, name: spec.name, latin: spec.latin, region: spec.region,
        role, order: info?.order ?? -1, bodySide: spec.mirror ? (sign > 0 ? 'right' : 'left') : 'center',
        x: (a[0]+b[0])/2, y: (a[1]+b[1])/2,
        width: Math.max(span, thick * .55), height: thick,
        rotation: Math.atan2(b[1]-a[1], b[0]-a[0]) * 180 / Math.PI,
        depth, aspect: anatomical, facing,
      });
    }
  }
  // 같은 근육의 좌우 사본은 겹칠 수 있으므로 뒤쪽부터 그립니다.
  return shapes.sort((l, r) => l.depth - r.depth);
}

/** 인체 실루엣을 화면 타원으로 투영합니다. 뒤쪽부터 정렬해 돌려줍니다. */
export function projectBody({joints, yaw, scale, centerX, centerY}) {
  const frame = bodyFrame(joints);
  const shapes = [];
  for (const part of bodyParts) {
    const base = resolveMuscle(part, joints, frame);
    for (const sign of (part.mirror ? [1, -1] : [1])) {
      const mirror = (p) => [p[0]*sign, p[1], p[2]];
      const a = project(mirror(base.a), yaw, scale, centerX, centerY);
      const b = project(mirror(base.b), yaw, scale, centerX, centerY);
      const depth = (a[2]+b[2])/2;
      const persp = 1 + clamp(depth, -.6, .6) * .14;
      const span = Math.hypot(b[0]-a[0], b[1]-a[1]);
      const thick = part.thick * 2 * scale * persp;
      shapes.push({
        id: part.id, x: (a[0]+b[0])/2, y: (a[1]+b[1])/2,
        width: part.round ? thick : Math.max(span, thick * .72), height: thick,
        rotation: Math.atan2(b[1]-a[1], b[0]-a[0]) * 180 / Math.PI, depth,
      });
    }
  }
  return shapes.sort((l, r) => l.depth - r.depth);
}

/**
 * 근육별 자극 포인트와 자세 포커스. 탭한 근육 카드에 그대로 표시합니다.
 * cue는 어떤 움직임에서 이 근육이 일하는지, focus는 자세에서 챙길 한 가지입니다.
 */
export const muscleTips = {
  pec: {cue:'팔을 가슴 앞으로 모을 때 수축합니다.', focus:'어깨를 뒤로 내리고 갈비뼈가 들리지 않게 유지하세요.'},
  abs: {cue:'갈비뼈를 골반 쪽으로 말아 올릴 때 강하게 수축합니다.', focus:'허리가 바닥에서 뜨지 않게 하고 숨을 내쉬며 힘을 주세요.'},
  traps: {cue:'어깨뼈를 위·안쪽으로 끌어올릴 때 수축합니다.', focus:'귀를 어깨에 붙이듯 으쓱하지 말고 어깨뼈만 움직이세요.'},
  lats: {cue:'팔을 몸 옆으로 당길 때 겨드랑이 아래가 조여집니다.', focus:'팔이 아니라 팔꿈치를 먼저 뒤로 보내며 가슴을 편 채 당기세요.'},
  erectors: {cue:'허리를 중립으로 세울 때 등 중앙이 긴장합니다.', focus:'등을 과하게 젖히지 말고 복압을 유지하세요.'},
  'delt-front': {cue:'팔을 앞·위로 밀 때 어깨 앞쪽이 수축합니다.', focus:'갈비뼈를 내린 채 팔을 밀어 올리세요.'},
  'delt-lat': {cue:'팔을 옆으로 벌릴 때 어깨 바깥이 수축합니다.', focus:'팔꿈치를 살짝 굽히고 어깨가 올라가지 않는 높이까지만 올리세요.'},
  'delt-rear': {cue:'팔을 뒤로 보내며 어깨 뒤쪽이 수축합니다.', focus:'어깨를 으쓱하지 말고 견갑을 뒤로 모으는 느낌으로 당기세요.'},
  biceps: {cue:'팔꿈치를 굽힐 때 위팔 앞쪽이 수축합니다.', focus:'팔꿈치를 옆구리에 고정하고 손목이 꺾이지 않게 하세요.'},
  triceps: {cue:'팔꿈치를 펼 때 위팔 뒤쪽이 수축합니다.', focus:'팔꿈치가 몸통에서 벌어지지 않게 하고 끝에서 완전히 펴세요.'},
  forearm: {cue:'무게를 쥐고 버틸 때 전완이 긴장합니다.', focus:'손목을 중립으로 두고 그립을 과하게 말지 마세요.'},
  quads: {cue:'무릎을 펼 때 허벅지 앞쪽이 수축합니다.', focus:'무릎이 발끝 방향을 향하게 하고 뒤꿈치로 바닥을 밀어 보세요.'},
  hamstrings: {cue:'고관절을 펴고 무릎을 굽힐 때 허벅지 뒤가 수축합니다.', focus:'골반이 뒤로 말리지 않게 허리를 중립으로 유지하세요.'},
  glute: {cue:'고관절을 펼 때 엉덩이가 가장 강하게 수축합니다.', focus:'허리로 젖히지 말고 엉덩이를 조여 골반을 밀어 넣으세요.'},
  calves: {cue:'발목을 밀어 올릴 때 종아리가 수축합니다.', focus:'무릎을 굽히지 말고 가동 범위 끝에서 잠깐 멈추세요.'},
  soleus: {cue:'무릎을 굽힌 채 발목을 밀 때 종아리 안쪽이 수축합니다.', focus:'무릎을 굽힌 자세로 천천히 내려와 깊은 범위를 쓰세요.'},
};

/**
 * 동작 국면에 따른 수축 강도. 0은 시작 자세, .5는 최대 수축, 1은 시작으로 돌아온 자세입니다.
 * 왕복 동작이라 수축 강도는 시작과 끝에서 0, 중간에서 1이 되는 대칭 곡선을 씁니다.
 */
export function contractionState(phase) {
  const p = Number.isFinite(phase) ? ((phase % 1) + 1) % 1 : 0;
  const intensity = (1 - Math.cos(p * Math.PI * 2)) / 2;
  const stage = intensity >= .85 ? 'peak' : p < .5 ? 'lift' : 'return';
  return {
    phase: p,
    intensity,
    stage,
    badge: stage === 'peak' ? '수축 피크' : stage === 'lift' ? '수축 중' : '이완 중',
    // 주동근 불투명도에 곱하는 값. 수축 구간에서 진해지고 이완에서 옅어집니다.
    alpha: .45 + .55 * intensity,
  };
}

/**
 * 화면에서 탭한 지점에 있는 근육을 찾습니다. 타원을 회전시켜 그리므로 같은 회전을 되돌려
 * 국소 좌표에서 거리를 재고, tolerance 안에서 가장 가까운 근육을 고릅니다.
 * 겹친 근육은 카메라를 향한(facing 큰) 쪽을 조금 더 우선합니다.
 */
export function hitTestMuscles(shapes, x, y, tolerance = 1.15) {
  let best = null, bestScore = Infinity;
  for (const shape of shapes ?? []) {
    const theta = (shape.rotation ?? 0) * Math.PI / 180;
    const dx = x - shape.x, dy = y - shape.y;
    const u = (dx * Math.cos(theta) + dy * Math.sin(theta)) / Math.max(1, Math.abs(shape.width) / 2);
    const v = (-dx * Math.sin(theta) + dy * Math.cos(theta)) / Math.max(1, Math.abs(shape.height) / 2);
    const distance = Math.hypot(u, v);
    if (!Number.isFinite(distance) || distance > tolerance) continue;
    const score = distance - (shape.facing ?? .5) * .15;
    if (score < bestScore) { bestScore = score; best = shape; }
  }
  return best;
}

/**
 * 탭한 근육의 정보 카드. 이 동작에서의 역할과 순번, 자극·자세 팁을 함께 돌려줍니다.
 * 동작에 쓰이지 않는 근육도 이름과 팁은 보여 주되 역할을 '비활성'으로 표시합니다.
 */
export function muscleCard(muscleId, exerciseId) {
  const spec = specById.get(muscleId);
  if (!spec) return null;
  const roles = muscleRoles[exerciseId] ?? {primary: [], secondary: []};
  const order = roles.primary.indexOf(muscleId);
  const role = order >= 0 ? 'primary' : roles.secondary.includes(muscleId) ? 'secondary' : 'inactive';
  const tip = muscleTips[muscleId] ?? {cue: '', focus: ''};
  return {
    id: spec.id, name: spec.name, latin: spec.latin, region: spec.region,
    role, order, roleLabel: role === 'primary' ? '주동근' : role === 'secondary' ? '보조근' : '이 동작에서는 비활성',
    cue: tip.cue, focus: tip.focus,
  };
}

/**
 * 큰 부위 그룹. 세부 근육을 묶어 '어깨', '엉덩이', '하체'처럼 넓게 고르거나 검색할 수 있게 합니다.
 * 승모근은 등과 어깨, 대둔근은 엉덩이와 하체에 함께 속하는 것처럼 한 근육이 두 그룹에 들어갈 수 있습니다.
 */
export const muscleGroups = [
  {id:'chest', name:'가슴', muscles:['pec'], aliases:['가슴','흉근']},
  {id:'back', name:'등', muscles:['lats','traps','erectors'], aliases:['등','광배','활배근']},
  {id:'shoulders', name:'어깨', muscles:['delt-front','delt-lat','delt-rear','traps'], aliases:['어깨']},
  {id:'arms', name:'팔', muscles:['biceps','triceps','forearm'], aliases:['팔','알통']},
  {id:'core', name:'코어', muscles:['abs','erectors'], aliases:['코어','복부','복근','배']},
  {id:'glutes', name:'엉덩이', muscles:['glute'], aliases:['엉덩이','둔근','힙']},
  {id:'legs', name:'하체', muscles:['quads','hamstrings','glute','calves','soleus'], aliases:['하체','다리','허벅지']},
];

/** 운동도감 부위명이 가리키는 근육. 3D 근육 매핑이 없는 운동의 타깃을 추정할 때 씁니다. */
export const catalogPartMuscles = {
  '가슴': ['pec'],
  '등': ['lats', 'traps'],
  '하체': ['quads', 'hamstrings'],
  '둔근': ['glute'],
  '종아리': ['calves', 'soleus'],
  '어깨': ['delt-front', 'delt-lat', 'delt-rear'],
  '팔': ['biceps', 'triceps'],
  '코어': ['abs', 'erectors'],
};
