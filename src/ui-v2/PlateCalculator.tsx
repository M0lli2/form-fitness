import React, {useState} from 'react';
import {Pressable, StyleSheet, TextInput, View} from 'react-native';
import {FormText, Surface} from './Primitives';
import {useFormTheme} from './Theme';
import {DEFAULT_PLATES, plateMath} from '../workout-features.mjs';

const BAR_OPTIONS = [20, 15, 10, 0];

/** 바벨 중량을 양쪽 원판 조합으로 보여 주는 계산기. 원판은 kg 기준입니다.
 *  목표 중량을 원판으로 정확히 맞출 수 없으면 실제 적재 무게와 남는 차이를 함께 알립니다. */
export function PlateCalculator({initialKg}: {initialKg?: number | null}) {
  const {palette} = useFormTheme();
  const [text, setText] = useState(initialKg && initialKg > 0 ? String(Math.round(initialKg * 10) / 10) : '60');
  const [barKg, setBarKg] = useState(20);
  const [plates, setPlates] = useState<number[]>(DEFAULT_PLATES);
  const value = Number(String(text).trim().replace(',', '.'));
  let result: ReturnType<typeof plateMath> | null = null;
  let error = '';
  if (!Number.isFinite(value) || value <= 0) error = '중량을 숫자로 입력하세요.';
  else if (value < barKg) error = `바(${barKg}kg)보다 가벼운 중량입니다.`;
  else result = plateMath(value, {barKg, plates});
  const counts = new Map<number, number>();
  for (const plate of result?.perSide ?? []) counts.set(plate, (counts.get(plate) ?? 0) + 1);

  return <>
    <FormText variant="caption" secondary>바벨에 끼우는 원판을 양쪽 기준으로 계산합니다. 기본 바 20kg · 원판 kg 기준.</FormText>
    <View style={styles.field}>
      <FormText variant="caption" secondary>목표 중량 (kg)</FormText>
      <TextInput accessibilityLabel="원판 계산 목표 중량" keyboardType="decimal-pad" selectTextOnFocus value={text}
        onChangeText={setText} style={[styles.input, {color: palette.text, borderColor: palette.line, backgroundColor: palette.raised}]}/>
    </View>
    <View style={styles.row}>
      <FormText variant="caption" secondary>바</FormText>
      {BAR_OPTIONS.map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{selected: barKg === option}}
        accessibilityLabel={'바 ' + (option === 0 ? '없음' : option + 'kg')} onPress={() => setBarKg(option)}
        style={[styles.chip, {backgroundColor: barKg === option ? palette.raised : 'transparent', borderColor: palette.line}]}>
        <FormText variant="caption">{option === 0 ? '없음' : option + 'kg'}</FormText></Pressable>)}
    </View>
    <View style={styles.row}>
      <FormText variant="caption" secondary>원판</FormText>
      {DEFAULT_PLATES.map(plate => {
        const on = plates.includes(plate);
        return <Pressable key={plate} accessibilityRole="button" accessibilityState={{selected: on}}
          accessibilityLabel={plate + 'kg 원판 ' + (on ? '사용' : '제외')}
          onPress={() => setPlates(current => on ? current.filter(item => item !== plate) : [...current, plate])}
          style={[styles.chip, {backgroundColor: on ? palette.raised : 'transparent', borderColor: palette.line, opacity: on ? 1 : .5}]}>
          <FormText variant="caption">{plate}kg</FormText></Pressable>;
      })}
    </View>
    {error ? <Surface><FormText variant="caption" style={{color: palette.error}}>{error}</FormText></Surface> : result && <>
      <Surface style={{gap: 10}}>
        <FormText variant="heading">한쪽 {result.perSideCount ? result.perSideCount + '장' : '없음'}</FormText>
        <View style={styles.row}>
          {result.perSideCount === 0 ? <FormText variant="caption" secondary>바만 사용합니다.</FormText>
            : [...counts.entries()].map(([plate, count]) => <View key={plate} style={[styles.plate, {backgroundColor: palette.raised}]}>
              <FormText variant="label">{plate}kg × {count}</FormText></View>)}
        </View>
        <FormText variant="caption" secondary>양쪽 합계 {result.platesTotal}장 · 원판 {result.plateTotal}kg</FormText>
        <View style={styles.spread}>
          <FormText variant="label">실제 적재</FormText>
          <FormText variant="heading">{result.loaded} kg</FormText>
        </View>
        {!result.exact && <FormText variant="caption" style={{color: palette.error}}>
          목표 {result.target}kg과 {Math.abs(result.remainder)}kg 차이. 이 조합으로는 정확히 맞출 수 없습니다.
        </FormText>}
      </Surface>
      <FormText variant="caption" secondary>예: 100kg이면 바 20kg + 한쪽 25·15kg씩. 2.5kg 단위는 원판 1.25kg을 양쪽에 끼웁니다.</FormText>
    </>}
  </>;
}
const styles = StyleSheet.create({
  field: {gap: 6},
  row: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8},
  spread: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  input: {minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 22, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums']},
  chip: {minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  plate: {minHeight: 36, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
});
