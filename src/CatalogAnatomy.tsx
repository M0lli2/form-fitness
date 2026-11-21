import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {AnatomySides, StandingAnatomy, type AnatomySide} from './AnatomyFigure';
import {exerciseTargets} from './muscle-filter.mjs';
import {muscles} from './muscle-map.mjs';
import {Glass, Label, useTheme} from './theme';
import type {Exercise} from './types';

/** Give every catalog detail the same turnable model without borrowing another exercise's form. */
export function CatalogAnatomy({exercise}: {exercise: Exercise}) {
    const {colors} = useTheme();
    const [side, setSide] = useState<AnatomySide>('front');
    const [selected, setSelected] = useState<string | null>(null);
    const targets = exerciseTargets(exercise).muscles;
    const selection = muscles.find(muscle => muscle.id === selected);
    const targetList = muscles.filter(muscle => targets.includes(muscle.id));
    const highlights = selected ? [selected] : targets;
    const choose = (id: string) => setSelected(current => current === id ? null : id);
    return <Glass>
        <View style={styles.header}>
            <Label bold size={17}>3D 근육 보기</Label>
            <AnatomySides side={side} onChange={setSide}/>
        </View>
        <StandingAnatomy side={side} height={210} highlights={highlights} onMuscle={choose}
            caption={exercise.name + ' 근육 모형 · ' + (side === 'front' ? '앞면' : '배면')}/>
        {!!targetList.length && <View style={styles.chips}>
            {targetList.map(muscle => <Pressable key={muscle.id} accessibilityRole="button"
                accessibilityState={{selected: selected === muscle.id}}
                style={[styles.chip, {backgroundColor:colors.accentBase}]}
                onPress={() => choose(muscle.id)}>
                <Label size={12} bold={selected === muscle.id}>{muscle.name}</Label>
            </Pressable>)}
        </View>}
        {selection && <Label bold>{selection.name} · {selection.latin}</Label>}
        <Label muted size={12}>{targetList.length
            ? '보라색은 운동도감의 대상 부위를 표시합니다. 동작은 아래 운동 방법에서 확인하세요.'
            : '근육을 눌러 이름을 확인할 수 있습니다. 동작은 아래 운동 방법을 참고하세요.'}</Label>
    </Glass>;
}

const styles = StyleSheet.create({
    header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8},
    chips:{flexDirection:'row',flexWrap:'wrap',gap:6},
    chip:{minHeight:34,borderRadius:999,paddingHorizontal:11,justifyContent:'center'},
});

