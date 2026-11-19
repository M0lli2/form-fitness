/** 이번 주 근육 볼륨 히트맵. v1 인체·근육 투영을 그대로 재사용해 부위별 사용량을 색으로 보여 줍니다. */
import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Label, useTheme} from './theme';
import {frameMotion, motions, project, samplePose} from './motion-guide.mjs';
import {projectBody, projectMuscles} from './muscle-map.mjs';
import {HEAT_ALPHA, heatLevel, weeklyMuscleLoad} from './volume.mjs';
import type {Session} from './types';

const HEIGHT = 208;
const MAX_SCALE = 104;
// 정면·배면 어디서 봐도 같은 크기로 보이도록 서 있는 자세 하나를 기준으로 잡습니다.
const standing = samplePose(motions.squat, 0);
const stand = {frames: [standing, standing], labels: ['서기', '서기']};

function tint(hex: string, alpha: number) {
    const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
    return `${hex}${value}`;
}

function mix(a: string, b: string, t: number) {
    const part = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map(i => Math.round(part(a, i) * (1 - t) + part(b, i) * t)
        .toString(16).padStart(2, '0')).join('');
}

function Shape({shape, color, alpha, sheen = 0}: {shape: any; color: string; alpha: number; sheen?: number}) {
    const side = Math.max(shape.width, shape.height);
    if (side < 1.5 || alpha < .02) return null;
    return <View pointerEvents="none" style={{position: 'absolute', left: shape.x - side / 2, top: shape.y - side / 2,
        width: side, height: side, borderRadius: side / 2, backgroundColor: tint(color, alpha),
        transform: [{rotate: `${shape.rotation}deg`}, {scaleX: shape.width / side}, {scaleY: shape.height / side}]}}>
        {sheen > 0 && <View style={{position: 'absolute', left: '24%', top: '24%', width: '52%', height: '52%',
            borderRadius: 999, backgroundColor: tint('#FFFFFF', sheen)}}/>}
    </View>;
}

/** 색 단계 범례. 0은 이번 주에 쓰지 않은 근육입니다. */
function HeatLegend() {
    const {colors} = useTheme();
    return <View style={styles.legendRow} accessible accessibilityLabel="색이 진할수록 이번 주에 더 많이 쓴 근육입니다.">
        <Text style={{fontSize: 11, color: colors.muted}}>적음</Text>
        {HEAT_ALPHA.map((alpha, band) => <View key={band} style={[styles.swatch,
            {backgroundColor: band ? tint(colors.accent, alpha) : mix(colors.bg, colors.ink, .12)}]}/>)}
        <Text style={{fontSize: 11, color: colors.muted}}>많음</Text>
    </View>;
}

export function WeeklyVolume({history, unit}: {history: Session[]; unit: 'kg' | 'lb'}) {
    const {colors} = useTheme();
    const [width, setWidth] = useState(0);
    const [side, setSide] = useState<'front' | 'back'>('front');
    const load = useMemo(() => weeklyMuscleLoad(history), [history]);
    const frame = useMemo(() => frameMotion(stand, Math.max(width, 1), HEIGHT, MAX_SCALE), [width]);
    const yaw = side === 'front' ? 0 : Math.PI;
    const byId = useMemo(() => new Map(load.muscles.map((row: any) => [row.id, row])), [load]);
    const scale = width > 0 ? frame.scale : 0;
    const centerX = width / 2 - frame.cx * scale, centerY = HEIGHT / 2 - frame.cy * scale;
    const joints = samplePose(stand, 0);
    const bodyShapes = width > 0 ? projectBody({joints, yaw, scale, centerX, centerY}) : [];
    const muscleShapes = width > 0 ? projectMuscles({joints, yaw, scale, centerX, centerY, exerciseId: undefined, includeInactive: true}) : [];
    const near = muscleShapes.filter((shape: any) => shape.facing >= .5);
    const far = muscleShapes.filter((shape: any) => shape.facing < .5);
    const alphaOf = (shape: any) => {
        const row: any = byId.get(shape.id);
        return HEAT_ALPHA[heatLevel(row?.level ?? 0)] * (.7 + .3 * shape.facing);
    };
    const weightText = (kg: number) => {
        const value = unit === 'lb' ? Math.round(kg * 2.2046226218) : kg;
        return `${value.toLocaleString()} ${unit}`;
    };
    const top = load.top.map((id: string) => byId.get(id)).filter(Boolean) as any[];
    const untrained = load.untrained.length;

    return <View style={{gap: 10}}>
        <View style={styles.spread}>
            <Label bold size={15}>이번 주 근육 볼륨</Label>
            <View style={styles.segmented}>
                {(['front', 'back'] as const).map(value => <Pressable key={value} accessibilityRole="button"
                    accessibilityState={{selected: side === value}} accessibilityLabel={value === 'front' ? '앞면' : '배면'}
                    onPress={() => setSide(value)}
                    style={[styles.segment, {backgroundColor: side === value ? tint(colors.accent, .16) : 'transparent'}]}>
                    <Text style={{fontSize: 12, fontWeight: side === value ? '700' : '400',
                        color: side === value ? colors.accent : colors.muted}}>{value === 'front' ? '앞면' : '배면'}</Text>
                </Pressable>)}
            </View>
        </View>
        <View accessible accessibilityLabel={`최근 7일 근육 볼륨, ${side === 'front' ? '앞면' : '배면'}. ` +
            (top.length ? `많이 쓴 근육 ${top.map(row => row.name).join(', ')}. ` : '아직 완료한 세트가 없습니다. ') +
            `미사용 근육 ${untrained}개.`}
            onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[styles.stage, {backgroundColor: colors.bg}]}>
            {far.map((shape: any) => <Shape key={'far-' + shape.id + shape.bodySide} shape={shape}
                color={colors.accent} alpha={alphaOf(shape) * .55}/>)}
            {bodyShapes.map((shape: any, i: number) => <Shape key={'body-' + shape.id + i} shape={shape}
                color={mix(colors.bg, colors.ink, .17)} alpha={1}/>)}
            {near.map((shape: any) => <Shape key={'near-' + shape.id + shape.bodySide} shape={shape}
                color={colors.accent} alpha={alphaOf(shape)}
                sheen={alphaOf(shape) > .6 ? .16 : 0}/>)}
            {!load.hasData && <View pointerEvents="none" style={styles.empty}>
                <Text style={{fontSize: 12, color: colors.muted}}>이번 주 완료한 세트가 아직 없습니다.</Text>
            </View>}
        </View>
        <View style={styles.spread}>
            <Label muted size={12}>{load.sessions}회 운동 · {load.totalSets}세트 · {weightText(load.totalVolume)}</Label>
            <HeatLegend/>
        </View>
        {load.hasData && <View style={{gap: 4}}>
            {top.map(row => <View key={row.id} style={styles.row}>
                <Label size={12} style={{width: 84}}>{row.name}</Label>
                <View style={[styles.bar, {backgroundColor: tint(colors.accent, .12)}]}>
                    <View style={{width: `${Math.round(row.level * 100)}%`, height: 6, borderRadius: 3, backgroundColor: colors.accent}}/>
                </View>
                <Label size={12} muted>{row.sets}세트</Label>
            </View>)}
            <Label muted size={11}>{untrained ? `이번 주 자극이 없던 근육 ${untrained}개` : '이번 주 16개 근육을 모두 자극했습니다.'}</Label>
        </View>}
    </View>;
}

const styles = StyleSheet.create({
    stage: {height: HEIGHT, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
    spread: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
    segmented: {flexDirection: 'row', borderRadius: 999, overflow: 'hidden'},
    segment: {paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999},
    legendRow: {flexDirection: 'row', alignItems: 'center', gap: 3},
    swatch: {width: 12, height: 12, borderRadius: 3},
    row: {flexDirection: 'row', alignItems: 'center', gap: 8},
    bar: {flex: 1, height: 6, borderRadius: 3, overflow: 'hidden'},
    empty: {position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center'},
});
