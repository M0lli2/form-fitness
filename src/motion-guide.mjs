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

/** @typedef {{frames:number[][][], labels:string[], equipment?: number[][][]}} Motion */
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
};

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
