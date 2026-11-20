/** 최근 7일의 완료 세트 집계를 공통 인체 모델에 표시합니다. */
import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Label, useTheme} from './theme';
import {AnatomySides, StandingAnatomy, type AnatomySide} from './AnatomyFigure';
import {HEAT_ALPHA, heatLevel, weeklyMuscleLoad} from './volume.mjs';
import type {Session} from './types';

function tint(hex: string, alpha: number) {
    const value = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0');
    return `${hex}${value}`;
}

function mix(a: string, b: string, t: number) {
    const part = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map(i => Math.round(part(a, i) * (1 - t) + part(b, i) * t)
        .toString(16).padStart(2, '0')).join('');
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
    const [side,setSide]=useState<AnatomySide>('front');
    const load=useMemo(()=>weeklyMuscleLoad(history),[history]);
    const byId=useMemo(()=>new Map(load.muscles.map(row=>[row.id,row])),[load]);
    const heat=useMemo(()=>Object.fromEntries(load.muscles.map(row=>[row.id,HEAT_ALPHA[heatLevel(row.level)]])),[load]);
    const weightText = (kg: number) => {
        const value = unit === 'lb' ? Math.round(kg * 2.2046226218) : kg;
        return `${value.toLocaleString()} ${unit}`;
    };
    const top = load.top.map((id: string) => byId.get(id)).filter(Boolean) as any[];
    const untrained = load.untrained.length;

    return <View style={{gap: 10}}>
        <View style={styles.spread}>
            <Label bold size={15}>이번 주 근육 볼륨</Label>
            <AnatomySides side={side} onChange={setSide}/>
        </View>
        <StandingAnatomy side={side} heat={heat} caption={`최근 7일 근육 볼륨, ${side === 'front' ? '앞면' : '배면'}. `+
            (top.length ? `많이 쓴 근육 ${top.map(row=>row.name).join(', ')}. ` : '아직 완료한 세트가 없습니다. ')+
            `미사용 근육 ${untrained}개.`}>
            {!load.hasData && <View pointerEvents="none" style={styles.empty}>
                <Text style={{fontSize:12,color:colors.muted}}>이번 주 완료한 세트가 아직 없습니다.</Text>
            </View>}
        </StandingAnatomy>
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
    spread: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
    legendRow: {flexDirection: 'row', alignItems: 'center', gap: 3},
    swatch: {width: 12, height: 12, borderRadius: 3},
    row: {flexDirection: 'row', alignItems: 'center', gap: 8},
    bar: {flex: 1, height: 6, borderRadius: 3, overflow: 'hidden'},
    empty: {position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center'},
});
