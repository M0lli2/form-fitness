// Coordinates are [left/right, height, depth] in a shared space. Positive depth is forward.
// These original keyframes describe the primary joint positions, without prescribing load or range.
const standing = [
  [0,1.72,0],[0,1.49,0],[0,1.02,0],
  [.23,1.43,0],[.27,1.13,0],[.28,.88,0],
  [.13,.99,0],[.15,.53,0],[.16,.1,0],[.16,.04,.18],
];

function pose(changes = {}) {
  const half = standing.map((point, i) => changes[i] ?? point);
  return [...half, ...half.slice(3).map(([x,y,z]) => [-x,y,z])];
}

// 서 있지 않은 동작의 기저 자세. 오른쪽 절반 10관절만 적고 왼쪽은 몸 중심으로 대칭을 만듭니다.
const supine = [ // 벤치에 누워 발을 바닥에 둔 자세
  [0,.60,.28],[0,.54,.12],[0,.52,-.55],
  [.20,.52,.06],[.24,.44,-.04],[.26,.32,-.10],
  [.13,.52,-.55],[.16,.56,-.86],[.16,.14,-.96],[.16,.08,-1.06],
];
const hinge = [ // 엉덩이를 뒤로 빼고 상체를 숙인 자세
  [0,1.36,.42],[0,1.28,.30],[0,.98,-.18],
  [.23,1.24,.28],[.25,.95,.30],[.26,.68,.32],
  [.13,.96,-.18],[.15,.55,0],[.16,.10,0],[.16,.04,.18],
];
const seated = [ // 의자에 앉아 등을 편 자세
  [0,1.74,0],[0,1.60,0],[0,.62,0],
  [.23,1.52,0],[.27,1.22,.02],[.28,.98,.04],
  [.13,.60,0],[.16,.56,.44],[.16,.10,.60],[.16,.05,.74],
];
const prone = [ // 엎드려 전완으로 바닥을 지지한 자세
  [0,.62,.88],[0,.55,.62],[0,.45,-.28],
  [.21,.55,.62],[.22,.30,.70],[.22,.10,.86],
  [.13,.44,-.28],[.15,.26,-.70],[.16,.12,-.98],[.16,.06,-1.06],
];

/** 기저 자세에서 필요한 관절만 바꿔 17관절 자세를 만듭니다. */
function poseFrom(base, changes = {}) {
  const half = base.map((point, i) => changes[i] ?? point);
  return [...half, ...half.slice(3).map(([x,y,z]) => [-x,y,z])];
}

/**
 * 장비 표시. 손에 붙은 장비(바벨·덤벨·손잡이)는 자세를 따라 움직이고,
 * 바닥에 고정된 장비(케이블 도르래·풀업 바)는 고정 좌표를 씁니다.
 * @typedef {{kind:'bar'|'bars'|'dumbbell'|'handle'|'bench'|'platform'|'cable',
 *   spread?:number, joints?:number[], drop?:number, width?:number, anchor?:number[]}} Prop
 * @typedef {{frames:number[][][], labels:string[], props?: Prop[]}} Motion */
/** @type {Record<string, Motion>} */
export const motions = {
  squat: {frames:[pose(),pose({0:[0,1.25,.13],1:[0,1.03,.09],2:[0,.61,-.22],3:[.23,.98,.06],4:[.28,.92,.29],5:[.29,.97,.52],6:[.13,.58,-.22],7:[.19,.48,.23]})],labels:['서서 준비','엉덩이 낮추기']},
  pushup: {frames:[
    pose({0:[0,.65,.59],1:[0,.58,.39],2:[0,.38,-.18],3:[.21,.55,.36],4:[.24,.3,.35],5:[.25,.05,.39],6:[.13,.36,-.18],7:[.14,.2,-.56],8:[.15,.08,-.94],9:[.15,.03,-.99]}),
    pose({0:[0,.33,.69],1:[0,.29,.47],2:[0,.22,-.14],3:[.21,.27,.45],4:[.36,.24,.19],5:[.25,.05,.39],6:[.13,.21,-.14],7:[.14,.13,-.54],8:[.15,.08,-.94],9:[.15,.03,-.99]})
  ],labels:['팔을 펴서 준비','몸을 한 선으로 낮추기']},
  bridge: {frames:[
    pose({0:[0,.17,-.81],1:[0,.14,-.58],2:[0,.12,-.03],3:[.21,.12,-.56],4:[.25,.07,-.33],5:[.26,.06,-.1],6:[.12,.12,-.03],7:[.15,.48,.22],8:[.15,.08,.52],9:[.15,.04,.68]}),
    pose({0:[0,.17,-.81],1:[0,.15,-.57],2:[0,.49,-.05],3:[.21,.14,-.56],4:[.25,.07,-.33],5:[.26,.06,-.1],6:[.12,.46,-.04],7:[.15,.51,.28],8:[.15,.08,.52],9:[.15,.04,.68]})
  ],labels:['눕고 발 고정','골반 들어 올리기']},
  calf: {frames:[pose(),pose({0:[0,1.83,0],1:[0,1.60,0],2:[0,1.13,0],3:[.23,1.54,0],4:[.27,1.24,0],5:[.28,.99,0],6:[.13,1.1,0],7:[.15,.64,0],8:[.16,.21,0]})],labels:['발바닥으로 지지','뒤꿈치 들어 올리기']},
  curl: {frames:[pose(),pose({4:[.27,1.13,.04],5:[.27,1.39,.22]})],labels:['팔을 내리고 준비','팔꿈치를 굽혀 들어 올리기']},
  lateral: {frames:[pose(),pose({4:[.51,1.39,.06],5:[.76,1.38,.08]})],labels:['팔을 몸 옆에 두기','양팔을 옆으로 들어 올리기']},
  goblet: {frames:[
    pose({4:[.24,1.16,.22],5:[.09,1.31,.35]}),
    pose({0:[0,1.25,.13],1:[0,1.03,.09],2:[0,.61,-.22],3:[.23,.98,.06],4:[.23,.71,.31],5:[.09,.9,.38],6:[.13,.58,-.22],7:[.19,.48,.23]})
  ],labels:['중량을 가슴 앞에 두기','엉덩이 낮추기']},
  ohp: {frames:[
    pose({4:[.34,1.16,.21],5:[.34,1.43,.24]}),
    pose({4:[.28,1.71,0],5:[.29,1.97,0]})
  ],labels:['바를 어깨 앞에 두기','바를 머리 위로 밀기']},

  // ── 핵심 복합·고립 운동 14종 (v2 확장) ──
  bench: {frames:[
    poseFrom(supine,{3:[.20,.54,.06],4:[.34,.74,.00],5:[.40,.94,-.02]}),
    poseFrom(supine,{3:[.20,.54,.06],4:[.44,.50,-.02],5:[.38,.58,.04]})
  ],labels:['바를 가슴 위로 밀기','팔꿈치를 굽혀 가슴으로'],props:[
    {kind:'bar',spread:.28},{kind:'bench',joints:[1,2],drop:.24,width:.30}]},
  'back-squat': {frames:[
    pose({4:[.28,1.24,-.06],5:[.30,1.45,-.10]}),
    pose({0:[0,1.25,.13],1:[0,1.03,.09],2:[0,.61,-.22],3:[.23,.98,.06],4:[.27,.86,-.05],5:[.29,1.02,-.12],6:[.13,.58,-.22],7:[.19,.48,.23]})
  ],labels:['바를 등에 걸고 서기','엉덩이 낮추기'],props:[{kind:'bar',spread:.28}]},
  deadlift: {frames:[
    poseFrom(hinge,{4:[.245,.76,.30],5:[.26,.32,.32]}),
    pose({4:[.27,1.10,-.02],5:[.28,.86,-.02]})
  ],labels:['바닥에서 바를 잡기','일어서며 잠그기'],props:[{kind:'bar',spread:.32}]},
  lat: {frames:[
    poseFrom(seated,{3:[.23,1.52,0],4:[.30,1.78,.02],5:[.36,2.04,0]}),
    poseFrom(seated,{3:[.23,1.52,0],4:[.34,1.26,-.08],5:[.28,1.50,.10]})
  ],labels:['바를 머리 위로 뻗기','가슴 앞으로 당기기'],props:[
    {kind:'bar',spread:.42},{kind:'cable',anchor:[0,2.30,.05]}]},
  pullup: {frames:[
    pose({0:[0,1.58,0],1:[0,1.46,0],2:[0,1.02,0],3:[.23,1.42,0],4:[.30,1.70,0],5:[.28,1.97,0],6:[.13,1.00,0],7:[.15,.55,-.02],8:[.16,.10,-.04],9:[.16,.05,.10]}),
    pose({0:[0,1.76,0],1:[0,1.64,0],2:[0,1.20,0],3:[.23,1.60,0],4:[.32,1.55,.06],5:[.28,1.97,0],6:[.13,1.18,0],7:[.15,.73,-.02],8:[.16,.28,-.04],9:[.16,.23,.10]})
  ],labels:['철봉에 매달리기','턱을 바 위로'],props:[{kind:'bar',spread:.55}]},
  'bar-row': {frames:[
    poseFrom(hinge,{4:[.30,.95,.30],5:[.34,.68,.32]}),
    poseFrom(hinge,{4:[.32,1.06,-.02],5:[.32,.98,.04]})
  ],labels:['숙인 자세로 바를 잡기','배꼽 쪽으로 당기기'],props:[{kind:'bar',spread:.30}]},
  lunge: {frames:[
    pose({2:[0,1.02,-.02],1:[0,1.48,-.02],0:[0,1.71,-.02],6:[.13,.99,0],7:[.15,.53,.22],8:[.16,.10,.36],9:[.16,.04,.50],13:[-.13,.99,-.05],14:[-.15,.52,-.26],15:[-.16,.10,-.44],16:[-.16,.04,-.30]}),
    pose({2:[0,.84,-.06],1:[0,1.30,-.06],0:[0,1.53,-.06],6:[.13,.82,-.04],7:[.16,.58,.28],8:[.16,.10,.44],9:[.16,.04,.58],13:[-.13,.80,-.08],14:[-.15,.18,-.38],15:[-.16,.10,-.56],16:[-.16,.04,-.42]})
  ],labels:['한 발을 뒤로 디디기','뒤 무릎을 내리기']},
  hipthrust: {frames:[
    poseFrom(supine,{0:[0,.57,-.76],1:[0,.50,-.60],2:[0,.36,-.08],3:[.20,.50,-.60],4:[.24,.32,-.66],5:[.26,.14,-.72],6:[.13,.34,-.06],7:[.16,.52,.34],8:[.16,.10,.50],9:[.16,.04,.62]}),
    poseFrom(supine,{0:[0,.63,-.72],1:[0,.58,-.58],2:[0,.70,-.08],3:[.20,.56,-.58],4:[.24,.40,-.64],5:[.26,.20,-.70],6:[.13,.68,-.06],7:[.16,.54,.34],8:[.16,.10,.50],9:[.16,.04,.62]})
  ],labels:['엉덩이를 바닥에 두기','골반을 들어 올리기'],props:[
    {kind:'bar',spread:.28},{kind:'bench',joints:[1,2],drop:.10,width:.28}]},
  legpress: {frames:[
    poseFrom(supine,{0:[0,.55,.10],1:[0,.50,-.05],2:[0,.50,-.60],3:[.20,.48,-.10],4:[.26,.34,-.22],5:[.28,.30,-.14],6:[.13,.48,-.52],7:[.17,.46,.16],8:[.18,.54,.58],9:[.18,.48,.68]}),
    poseFrom(supine,{0:[0,.55,.10],1:[0,.50,-.05],2:[0,.50,-.60],3:[.20,.48,-.10],4:[.26,.34,-.22],5:[.28,.30,-.14],6:[.13,.48,-.52],7:[.19,.62,-.06],8:[.18,.44,.32],9:[.18,.38,.42]})
  ],labels:['다리를 펴고 밀기','무릎을 가슴으로'],props:[{kind:'platform',joints:[8,15],width:.20}]},
  pushdown: {frames:[
    pose({4:[.26,1.16,.04],5:[.26,1.36,.16]}),
    pose({4:[.25,1.12,.02],5:[.25,.88,.10]})
  ],labels:['팔꿈치를 옆구리에 고정','아래로 펴기'],props:[
    {kind:'cable',anchor:[0,2.25,.15]},{kind:'handle'}]},
  facepull: {frames:[
    pose({4:[.26,1.42,.20],5:[.30,1.40,.44]}),
    pose({4:[.34,1.40,.06],5:[.26,1.48,.12]})
  ],labels:['팔을 앞으로 뻗기','얼굴 쪽으로 당기기'],props:[
    {kind:'cable',anchor:[0,1.52,1.05]},{kind:'handle'}]},
  plank: {frames:[
    poseFrom(prone),
    poseFrom(prone,{0:[0,.63,.88],1:[0,.56,.62],2:[0,.48,-.28],3:[.21,.56,.62],6:[.13,.47,-.28]})
  ],labels:['전완으로 몸을 지지','배에 힘을 주고 버티기']},
  dips: {frames:[
    pose({0:[0,1.60,.06],1:[0,1.47,.04],2:[0,1.14,.02],3:[.22,1.45,.04],4:[.26,1.25,.02],5:[.28,1.06,.06],6:[.13,1.12,0],7:[.16,.88,.26],8:[.16,.60,.42],9:[.16,.54,.54]}),
    pose({0:[0,1.38,.10],1:[0,1.24,.08],2:[0,.94,.04],3:[.22,1.18,.08],4:[.32,1.12,.02],5:[.28,1.06,.06],6:[.13,.92,.02],7:[.16,.74,.26],8:[.16,.54,.42],9:[.16,.48,.54]})
  ],labels:['평행봉을 짚고 서기','팔꿈치를 굽혀 내려가기'],props:[{kind:'bars'}]},
  'db-shoulder': {frames:[
    pose({4:[.30,1.28,.10],5:[.31,1.50,.12]}),
    pose({4:[.28,1.62,.04],5:[.30,1.95,.04]})
  ],labels:['덤벨을 어깨 높이에','머리 위로 밀기'],props:[{kind:'dumbbell'}]},
};

/**
 * 운동에 적힌 장비를 월드 좌표 선분으로 풀어냅니다.
 * 손에 붙은 장비는 5번·12번 손 관절을 따라가고, 바닥 장비는 고정 좌표를 씁니다.
 * width는 미터 단위 굵기이며 그리는 쪽에서 배율을 곱합니다.
 */
export function propSegments(/** @type {Motion} */ motion, /** @type {number[][]} */ joints) {
  const hands = [joints[5], joints[12]];
  const mid = [0,1,2].map(i => (hands[0][i] + hands[1][i]) / 2);
  const segments = [];
  for (const spec of motion.props ?? []) {
    if (spec.kind === 'cable') { segments.push({a:spec.anchor, b:mid, width:.016}); continue; }
    if (spec.kind === 'handle') { segments.push({a:hands[0], b:hands[1], width:.026}); continue; }
    if (spec.kind === 'bars') {
      for (const hand of hands) segments.push({a:[hand[0]-.16,hand[1],hand[2]], b:[hand[0]+.16,hand[1],hand[2]], width:.026});
      continue;
    }
    if (spec.kind === 'dumbbell') {
      for (const hand of hands) segments.push({a:[hand[0]-.09,hand[1],hand[2]], b:[hand[0]+.09,hand[1],hand[2]], width:.042});
      continue;
    }
    if (spec.kind === 'bar') {
      const half = (spec.spread ?? .25) + Math.max(Math.abs(hands[0][0]), Math.abs(hands[1][0]));
      segments.push({a:[-half,mid[1],mid[2]], b:[half,mid[1],mid[2]], width:.030});
      continue;
    }
    if (spec.kind === 'bench' || spec.kind === 'platform') {
      const [from, to] = spec.joints.map(i => joints[i]);
      const drop = spec.drop ?? 0;
      segments.push({a:[from[0],from[1]-drop,from[2]], b:[to[0],to[1]-drop,to[2]], width:spec.width ?? .16});
    }
  }
  return segments;
}

export const bones = [[0,1],[1,2],[3,10],[6,13],[1,3],[1,10],[3,4],[4,5],[10,11],[11,12],[2,6],[2,13],[6,7],[7,8],[8,9],[13,14],[14,15],[15,16]];
export const floor = Array.from({length:5},(_,i) => {
  const v=(i-2)*.45;
  return [[[-.9,0,v],[.9,0,v]],[[v,0,-.9],[v,0,.9]]];
}).flat();

/** Interpolate a continuous forward-and-return cycle with zero speed at each endpoint. */
export function samplePose(/** @type {Motion} */ motion, /** @type {number} */ phase) {
  const t=(1-Math.cos(phase*Math.PI*2))/2;
  return motion.frames[0].map((point,i) => point.map((axis,j) => axis+(motion.frames[1][i][j]-axis)*t));
}

/** Rotate the joint around the vertical axis, then pitch the camera and project to the screen. */
export function project(/** @type {number[]} */ point, /** @type {number} */ yaw, /** @type {number} */ scale, /** @type {number} */ centerX, /** @type {number} */ centerY) {
  const [x,y,z]=point;
  const side=x*Math.cos(yaw)-z*Math.sin(yaw);
  const depth=x*Math.sin(yaw)+z*Math.cos(yaw);
  return [centerX+side*scale,centerY-(y*.95-depth*.31)*scale,depth];
}

/**
 * 운동 하나가 8방향 어디에서 보여도 화면 안에 들어오도록 공통 배율과 중심을 정합니다.
 * 회전할 때 크기가 튀지 않도록 모든 방향의 투영 경계를 한 번에 계산합니다.
 * 반환값의 cx, cy는 project(point, yaw, 1, 0, 0) 좌표계의 중심입니다.
 */
export function frameMotion(/** @type {Motion} */ motion, /** @type {number} */ width, /** @type {number} */ height, /** @type {number} */ maxScale = 96) {
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  const directions = 8;
  for (const phase of [0,.5]) {
    const joints = samplePose(motion, phase);
    for (let i=0;i<directions;i++) {
      const yaw = i*Math.PI/4;
      for (const point of joints) {
        const [x,y] = project(point, yaw, 1, 0, 0);
        if (x<minX) minX=x; if (x>maxX) maxX=x;
        if (y<minY) minY=y; if (y>maxY) maxY=y;
      }
    }
  }
  const fit = Math.min(width*.84/Math.max(1e-3,maxX-minX), height*.84/Math.max(1e-3,maxY-minY));
  return {scale:Math.max(24, Math.min(maxScale, fit)), cx:(minX+maxX)/2, cy:(minY+maxY)/2};
}
