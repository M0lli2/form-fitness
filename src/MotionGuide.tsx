import React, {useEffect, useState} from 'react';
import {AccessibilityInfo, AppState, StyleSheet, View} from 'react-native';
import {Button, Glass, Label, useTheme} from './theme';
import {bones, floor, motions, project, samplePose} from './motion-guide.mjs';

const HEIGHT = 210;
const CYCLE_MS = 3600;
const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI * 3 / 4, Math.PI, Math.PI * 5 / 4, Math.PI * 3 / 2, Math.PI * 7 / 4];

/** Native views render the projected joints, so the guide works offline without a web view. */
export function MotionGuide({exerciseId}: {exerciseId: string}) {
    const {colors} = useTheme();
    const [width, setWidth] = useState(0);
    const [angleIndex, setAngleIndex] = useState(1);
    const [zoom, setZoom] = useState(false);
    const [phase, setPhase] = useState(0);
    const [playing, setPlaying] = useState(false);
    const motion = Object.prototype.hasOwnProperty.call(motions, exerciseId) ? motions[exerciseId] : undefined;
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
    if (!motion) return <Label muted size={12}>이 운동은 아래 단계별 자세 가이드를 제공합니다.</Label>;

    const scale = Math.min(width / 2.15, 76) * (zoom ? 1.2 : 1);
    const yaw = angles[angleIndex];
    const joints = samplePose(motion, phase);
    const map = (point: number[]) => project(point, yaw, scale, width / 2, HEIGHT - 24);
    const dots = joints.map(map);
    const limbSegments = bones.map(([a,b]) => ({a:dots[a], b:dots[b], head:a===0}));
    const weights = [5,12].map(i => {
        const [x,y,z] = joints[i];
        return [map([x-.095,y,z]),map([x+.095,y,z])];
    });
    const propSegments = exerciseId === 'ohp' ? [[map([-.55,joints[5][1],joints[5][2]]),map([.55,joints[5][1],joints[5][2]])]]
        : ['curl','lateral'].includes(exerciseId) ? weights
        : exerciseId === 'goblet' ? [[dots[5],dots[12]]] : [];

    function line(a: number[], b: number[], color: string, thickness: number, key: string) {
        const [x,y] = a, [u,v] = b;
        const length = Math.hypot(u-x,v-y);
        return <View key={key} style={{position:'absolute', left:(x+u-length)/2, top:(y+v-thickness)/2,
            width:length, height:thickness, borderRadius:thickness, backgroundColor:color,
            transform:[{rotate:`${Math.atan2(v-y,u-x)}rad`}]}}/>;
    }

    return <Glass>
        <Label bold size={17}>3D 자세 가이드</Label>
        <View accessible accessibilityLabel="운동 관절과 장비의 3차원 자세"
            onLayout={e => setWidth(e.nativeEvent.layout.width)} style={[styles.stage,{backgroundColor:colors.bg}]}>
            {width>0 && floor.map(([a,b],i) => line(map(a),map(b),colors.line,1,'floor-'+i))}
            {width>0 && limbSegments.sort((l,r) => l.a[2]+l.b[2]-r.a[2]-r.b[2]).map(({a,b,head},i) =>
                line(a,b,colors.ink,head?4:6,'bone-'+i))}
            {width>0 && dots.map(([x,y],i) => {
                const d=i===0?19:8;
                return <View key={i} style={{position:'absolute',left:x-d/2,top:y-d/2,width:d,height:d,
                    backgroundColor:colors.solid,borderColor:colors.ink,borderWidth:2,borderRadius:d/2}}/>;
            })}
            {width>0 && propSegments.map(([a,b],i) => line(a,b,colors.muted,8,'weight-'+i))}
        </View>
        <Label muted size={12}>{playing ? '동작 반복 재생 중' : phase===0 ? motion.labels[0] : phase===.5 ? motion.labels[1] : '일시 정지'}</Label>
        <Button title={playing?'일시 정지':'동작 재생'} onPress={()=>setPlaying(value=>!value)}/>
        <View style={styles.controls}>
            <Button secondary title="회전" onPress={()=>setAngleIndex(value=>(value+1)%angles.length)}/>
            <Button secondary title={zoom?'축소':'확대'} onPress={()=>setZoom(value=>!value)}/>
            <Button secondary title="주요 자세" onPress={()=>{setPlaying(false);setPhase(value=>value===.5?0:.5);}}/>
        </View>
        <Label muted size={11}>관절 움직임을 단순화한 학습용 모델입니다.</Label>
    </Glass>;
}

const styles = StyleSheet.create({
    stage:{height:HEIGHT,borderRadius:16,overflow:'hidden'},
    controls:{flexDirection:'row',flexWrap:'wrap',gap:8},
});
