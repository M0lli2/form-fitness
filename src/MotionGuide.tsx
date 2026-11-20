import React, {useEffect, useMemo, useState} from 'react';
import {requireNativeViewManager} from 'expo-modules-core';
import type {ViewProps} from 'react-native';
import {AccessibilityInfo, AppState, Pressable, StyleSheet, Text, View} from 'react-native';
import {Button, Glass, Label, useTheme} from './theme';
import {bones, floor, frameMotion, motions, project, propSegments, samplePose} from './motion-guide.mjs';
import {activeMuscles, contractionState, muscleCard} from './muscle-map.mjs';
import {faceAt, projectAnatomy, visibleMuscleMarkers} from './anatomy-mesh.mjs';

const MuscleMesh = requireNativeViewManager<ViewProps & {faces: number[]}>('FormDevice');

const HEIGHT = 226;
const CYCLE_MS = 3600;
const MAX_SCALE = 112;
const directions = ['정면', '오른쪽 앞', '오른쪽', '오른쪽 뒤', '뒤', '왼쪽 뒤', '왼쪽', '왼쪽 앞'];
const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI, Math.PI * 5 / 4, Math.PI * 3 / 2, Math.PI * 7 / 4];
/** 테마 색상(#RRGGBB)에 알파를 붙입니다. */
function tint(hex: string, alpha: number) {
    const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
    return `${hex}${value}`;
}

/** 동작 국면 배지. 수축이 강해질수록 막대가 차고 피크에서 색이 진해집니다. */
function ContractionBadge({state}: {state: ReturnType<typeof contractionState>}) {
    const {colors} = useTheme();
    const peak = state.stage === 'peak';
    return <View pointerEvents="none" accessible accessibilityLabel={`${state.badge}, 수축 강도 ${Math.round(state.intensity * 100)}퍼센트`}
        style={[styles.badge, {backgroundColor: tint(peak ? colors.accent : colors.solid, peak ? .18 : .82),
            borderColor: tint(colors.accent, peak ? .7 : .25)}]}>
        <Text style={{fontSize: 10, lineHeight: 13, fontWeight: '700', color: peak ? colors.accent : colors.muted}}>{state.badge}</Text>
        <View style={[styles.badgeTrack, {backgroundColor: tint(colors.accent, .16)}]}>
            <View style={{width: `${Math.round(state.intensity * 100)}%`, height: 3, borderRadius: 2,
                backgroundColor: colors.accent}}/>
        </View>
    </View>;
}

/** 활성 근육 범례. 주동근은 모델 위 번호와 같은 번호를 달고, 칩을 누르면 근육 카드가 열립니다. */
function MuscleLegend({exerciseId, selected, onSelect}: {exerciseId: string; selected: string | null; onSelect: (id: string | null) => void}) {
    const {colors} = useTheme();
    const {primary, secondary} = activeMuscles(exerciseId);
    if (!primary.length) return null;
    const chip = (key: string, name: string, index: number) => {
        const active = selected === key;
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{selected: active}}
            accessibilityLabel={`${name} 근육 정보 보기`} onPress={() => onSelect(active ? null : key)}
            style={[styles.chip, {backgroundColor: active ? tint(colors.accent, .18) : colors.soft,
                borderColor: active ? tint(colors.accent, .6) : 'transparent'}]}>
            <View style={[styles.dot, {backgroundColor: colors.accent, opacity: index ? 1 : .42}]}>
                <Text style={{fontSize: 9, lineHeight: 11, fontWeight: '700', color: index ? colors.bg : colors.ink}}>{index || '·'}</Text>
            </View>
            <Text style={{fontSize: 12, lineHeight: 16, color: colors.ink, fontWeight: active ? '700' : '400'}}>{name}</Text>
        </Pressable>;
    };
    return <View accessible accessibilityLabel={`주동근 ${primary.map((m: any) => m.name).join(', ')}. 보조근 ${secondary.map((m: any) => m.name).join(', ')}.`}
        style={styles.legend}>
        <View style={styles.legendRow}>
            <Text style={[styles.legendTitle, {color: colors.accent}]}>주동근</Text>
            {primary.map((m: any, i: number) => chip(m.id, m.name, i + 1))}
        </View>
        <View style={styles.legendRow}>
            <Text style={[styles.legendTitle, {color: colors.muted}]}>보조근</Text>
            {secondary.map((m: any) => chip(m.id, m.name, 0))}
        </View>
    </View>;
}

/** 탭한 근육의 이름·역할·자극과 자세 포커스를 보여 주는 카드. */
function MuscleCard({muscleId, exerciseId, onClose}: {muscleId: string; exerciseId: string; onClose: () => void}) {
    const {colors} = useTheme();
    const card = muscleCard(muscleId, exerciseId);
    if (!card) return null;
    const tone = card.role === 'primary' ? colors.accent : colors.muted;
    return <View accessible accessibilityLabel={`${card.name} ${card.latin}, ${card.roleLabel}. ${card.cue} ${card.focus}`}
        style={[styles.card, {backgroundColor: colors.soft, borderColor: tint(tone, .35)}]}>
        <View style={styles.spread}>
            <View style={styles.flex}>
                <View style={styles.row}>
                    <View style={[styles.roleBadge, {backgroundColor: tint(tone, card.role === 'primary' ? .18 : .12)}]}>
                        <Text style={{fontSize: 10, lineHeight: 13, fontWeight: '700', color: tone}}>
                            {card.role === 'primary' ? `주동근 ${card.order + 1}` : card.role === 'secondary' ? '보조근' : '비활성'}
                        </Text>
                    </View>
                    <Text style={{fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink}}>{card.name}</Text>
                    <Text style={{fontSize: 11, lineHeight: 15, color: colors.muted}}>{card.latin}</Text>
                </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="근육 카드 닫기" onPress={onClose} hitSlop={8}>
                <Text style={{fontSize: 16, color: colors.muted}}>×</Text>
            </Pressable>
        </View>
        <Text style={{fontSize: 12, lineHeight: 17, color: colors.ink}}>{card.cue}</Text>
        <Text style={{fontSize: 12, lineHeight: 17, color: colors.muted}}>자세 포커스 · {card.focus}</Text>
    </View>;
}

/** Native views render the projected joints and muscles, so the guide works offline without a web view. */
export function MotionGuide({exerciseId}: {exerciseId: string}) {
    const {colors} = useTheme();
    const [width, setWidth] = useState(0);
    const [angleIndex, setAngleIndex] = useState(1);
    const [zoom, setZoom] = useState(false);
    const [showMuscles, setShowMuscles] = useState(true);
    const [phase, setPhase] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const motion = Object.prototype.hasOwnProperty.call(motions, exerciseId) ? motions[exerciseId] : undefined;
    // 8방향 어디서 봐도 화면에 들어오는 공통 배율. 회전 중 크기가 바뀌지 않습니다.
    const frame = useMemo(() => motion ? frameMotion(motion, Math.max(width, 1), HEIGHT, MAX_SCALE) : null, [motion, width]);
    useEffect(() => {
        const state = AppState.addEventListener('change', value => {
            if (value !== 'active') setPlaying(false);
        });
        const motionSetting = AccessibilityInfo.addEventListener('reduceMotionChanged', enabled => {
            if (enabled) setPlaying(false);
        });
        return () => { state.remove(); motionSetting.remove(); };
    }, []);
    useEffect(() => {
        if (!playing) return;
        // Preserve the current pose across a pause, with no timer while the view is idle.
        let last = Date.now();
        const timer = setInterval(() => {
            const now = Date.now();
            const dt = (now - last) / CYCLE_MS;
            last = now;
            setPhase(current => (current + dt) % 1);
        }, 42);
        return () => clearInterval(timer);
    }, [playing]);
    // 다른 운동으로 바뀌면 이전 운동에서 고른 근육을 지웁니다.
    useEffect(() => { setSelected(null); }, [exerciseId]);
    if (!motion || !frame) return <Label muted size={12}>이 운동은 아래 단계별 자세 가이드를 제공합니다.</Label>;

    const scale = frame.scale * (zoom ? 1.18 : 1);
    const yaw = angles[angleIndex];
    const joints = samplePose(motion, phase);
    const map = (point: number[]) => {
        const [x, y] = project(point, yaw, 1, 0, 0);
        return [width / 2 + (x - frame.cx) * scale, HEIGHT / 2 + (y - frame.cy) * scale];
    };
    const dots = joints.map(map);
    const limbSegments = bones.map(([a,b]) => ({a:dots[a], b:dots[b], head:a===0}));
    const weights = [5,12].map(i => {
        const [x,y,z] = joints[i];
        return [map([x-.095,y,z]),map([x+.095,y,z])];
    });
    const weightProps = exerciseId === 'ohp' ? [[map([-.55,joints[5][1],joints[5][2]]),map([.55,joints[5][1],joints[5][2]])]]
        : ['curl','lateral'].includes(exerciseId) ? weights
        : exerciseId === 'goblet' ? [[dots[5],dots[12]]] : [];
    // 장비는 motion-guide의 데이터로 그립니다. 바벨·덤벨은 손을 따라가고 벤치·케이블은 자리에 고정됩니다.
    const equipment = (propSegments(motion, joints) as {a:number[]; b:number[]; width:number}[])
        .map(({a,b,width}): [number[],number[],number] => [map(a), map(b), Math.max(3, width * scale)]);
    const centerX = width / 2 - frame.cx * scale, centerY = HEIGHT / 2 - frame.cy * scale;
    const anatomy = showMuscles && width > 0
        ? projectAnatomy({joints, yaw, scale, centerX, centerY, exerciseId, phase, selected, palette: colors})
        : null;
    const markers = anatomy ? visibleMuscleMarkers(anatomy.faces) : [];
    const active = activeMuscles(exerciseId);
    const backView = angleIndex >= 3 && angleIndex <= 5;
    const contraction = contractionState(phase);

    function line(a: number[], b: number[], color: string, thickness: number, key: string) {
        const [x,y] = a, [u,v] = b;
        const length = Math.hypot(u-x,v-y);
        return <View key={key} style={{position:'absolute', left:(x+u-length)/2, top:(y+v-thickness)/2,
            width:length, height:thickness, borderRadius:thickness, backgroundColor:color,
            transform:[{rotate:`${Math.atan2(v-y,u-x)}rad`}]}}/>;
    }

    return <Glass>
        <Label bold size={17}>3D 자세 가이드</Label>
        <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={[styles.stage,{backgroundColor:colors.bg}]}>
            {width>0 && floor.map(([a,b],i) => line(map(a),map(b),colors.line,1,'floor-'+i))}
            {anatomy && <MuscleMesh pointerEvents="none" faces={anatomy.coordinates} style={StyleSheet.absoluteFill}/>}
            {width>0 && !showMuscles && limbSegments.sort((l,r) => l.a[2]+l.b[2]-r.a[2]-r.b[2]).map(({a,b,head},i) =>
                line(a,b,colors.ink,head?4:6,'bone-'+i))}
            {width>0 && weightProps.map(([a,b],i) => line(a,b,colors.muted,7,'weight-'+i))}
            {width>0 && equipment.map(([a,b,thick],i) => line(a,b,colors.muted,thick,'equipment-'+i))}
            {width>0 && !showMuscles && dots.map(([x,y],i) => {
                const d=i===0?19:8;
                return <View key={i} style={{position:'absolute',left:x-d/2,top:y-d/2,width:d,height:d,
                    backgroundColor:colors.solid,borderColor:colors.ink,borderWidth:2,borderRadius:d/2}}/>;
            })}
            {width>0 && markers.map((shape: any) => {
                const d = 14, label = String(shape.order + 1);
                const lit = shape.id === selected;
                return <View key={'marker-'+shape.id} style={[styles.marker,{left:shape.x-d/2, top:shape.y-d/2, width:d, height:d,
                    borderRadius:d/2, backgroundColor:tint(colors.accent, lit ? 1 : .92)}]}>
                    <Text style={{fontSize: 9, lineHeight: 11, fontWeight: '700', color: colors.bg}}>{label}</Text>
                </View>;
            })}
            {width>0 && showMuscles && <ContractionBadge state={contraction}/>}
            {/* 근육과 범례 어디를 눌러도 같은 근육이 선택되도록 스테이지 전체가 탭을 받습니다. */}
            {width>0 && showMuscles && <Pressable accessibilityRole="button"
                accessibilityLabel={`운동 관절과 장비의 3차원 자세, ${directions[angleIndex]}, 주동근 ${active.primary.map((m: any) => m.name).join(', ')}. 모델의 근육을 탭하면 자극 포인트가 열립니다.`}
                onPress={event => {
                    const {locationX, locationY} = event.nativeEvent;
                    const hit = anatomy ? faceAt(anatomy.faces, locationX, locationY) : null;
                    setSelected(hit?.muscle ?? null);
                }} style={StyleSheet.absoluteFill}/>}
        </View>
        <Label muted size={12}>{playing ? '동작 반복 재생 중' : phase===0 ? motion.labels[0] : phase===.5 ? motion.labels[1] : '일시 정지'}</Label>
        {showMuscles && selected && <MuscleCard muscleId={selected} exerciseId={exerciseId} onClose={() => setSelected(null)}/>}
        {showMuscles && <MuscleLegend exerciseId={exerciseId} selected={selected} onSelect={setSelected}/>}
        <Button title={playing?'일시 정지':'동작 재생'} onPress={()=>setPlaying(value=>!value)}/>
        <View style={styles.controls}>
            <Button secondary title="회전" onPress={()=>setAngleIndex(value=>(value+1)%angles.length)}/>
            <Button secondary title={backView?'앞면 보기':'배면 보기'} onPress={()=>setAngleIndex(()=>backView?0:4)}/>
            <Button secondary title={zoom?'축소':'확대'} onPress={()=>setZoom(value=>!value)}/>
            <Button secondary title="주요 자세" onPress={()=>{setPlaying(false);setPhase(value=>value===.5?0:.5);}}/>
            <Button secondary title={showMuscles?'근육 숨기기':'근육 보기'} onPress={()=>setShowMuscles(value=>!value)}/>
        </View>
        <Label muted size={11}>{showMuscles
            ? '관절 움직임을 따라 근육 윤곽이 움직이는 학습용 모델입니다. 근육이나 범례를 탭하면 자극 포인트가 열립니다. 색이 진한 근육이 주동근, 옅은 근육이 보조근입니다.'
            : '관절 움직임을 단순화한 학습용 모델입니다.'}</Label>
    </Glass>;
}

const styles = StyleSheet.create({
    stage:{height:HEIGHT,borderRadius:16,overflow:'hidden'},
    controls:{flexDirection:'row',flexWrap:'wrap',gap:8},
    marker:{position:'absolute',alignItems:'center',justifyContent:'center'},
    legend:{gap:6},
    legendRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:6},
    legendTitle:{fontSize:11,lineHeight:15,fontWeight:'700',minWidth:34},
    chip:{flexDirection:'row',alignItems:'center',gap:5,borderRadius:999,paddingLeft:4,paddingRight:9,paddingVertical:3,borderWidth:1},
    dot:{width:16,height:16,borderRadius:8,alignItems:'center',justifyContent:'center'},
    badge:{position:'absolute',left:10,top:10,borderRadius:999,paddingHorizontal:9,paddingVertical:5,gap:3,borderWidth:1},
    badgeTrack:{width:44,height:3,borderRadius:2,overflow:'hidden'},
    card:{borderRadius:14,borderWidth:1,padding:10,gap:4},
    roleBadge:{borderRadius:999,paddingHorizontal:7,paddingVertical:2},
    row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:6},
    spread:{flexDirection:'row',alignItems:'flex-start',gap:8},
    flex:{flex:1},
});
