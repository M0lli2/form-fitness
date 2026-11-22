import React from 'react';
import {Pressable, StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {FormText} from './Primitives';
import {useFormTheme} from './Theme';
import {geometry} from './tokens';

/** 보조 동작은 모두 같은 필 버튼을 씁니다. 높이 36 · 반경 999 · 1px 테두리.
 *  테두리 없는 글자 링크는 화면 안에서 눌러야 하는 것으로 보이지 않아 없앴습니다. */
export function Pill({title, onPress, accessibilityLabel, accessibilityState, active = false, disabled = false, style}: {
  title: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityState?: {selected?: boolean; expanded?: boolean; disabled?: boolean; checked?: boolean};
  active?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const {palette} = useFormTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
    accessibilityState={accessibilityState} disabled={disabled} onPress={onPress}
    style={({pressed}) => [styles.pill, {
      borderColor: active ? palette.text : palette.line,
      backgroundColor: active ? palette.raised : 'transparent',
      opacity: disabled ? .45 : pressed ? .72 : 1,
    }, style]}>
    <FormText variant="caption" secondary={!active} style={styles.pillText}>{title}</FormText>
  </Pressable>;
}

/** 같은 폭으로 나뉜 2~3개 선택지. 칩이 줄바꿈되며 2+1로 갈라지지 않게 합니다. */
export function Segmented<T extends string>({options, value, onChange, accessibilityLabelPrefix}: {
  options: readonly {key: T; label: string}[];
  value: T;
  onChange: (key: T) => void;
  accessibilityLabelPrefix?: string;
}) {
  const {palette} = useFormTheme();
  return <View accessibilityRole="tablist" style={[styles.segment, {backgroundColor: palette.raised}]}>
    {options.map(option => {
      const selected = option.key === value;
      return <Pressable key={option.key} accessibilityRole="tab" accessibilityState={{selected}}
        accessibilityLabel={accessibilityLabelPrefix ? `${accessibilityLabelPrefix} ${option.label}` : option.label}
        onPress={() => onChange(option.key)}
        style={[styles.segmentItem, {backgroundColor: selected ? palette.surface : 'transparent',
          borderColor: selected ? palette.line : 'transparent'}]}>
        <FormText variant="caption" secondary={!selected} numberOfLines={1}
          style={{fontWeight: selected ? '700' : '500'}}>{option.label}</FormText>
      </Pressable>;
    })}
  </View>;
}

/** 기록 지표는 같은 높이·같은 여백의 타일로만 표시합니다. 값이 '—'여도 높이는 그대로입니다. */
export function MetricTile({label, value, unit}: {label: string; value: string | number; unit?: string}) {
  const {palette} = useFormTheme();
  const empty = value === '—';
  return <View style={[styles.metric, {borderColor: palette.line, backgroundColor: palette.surface}]}>
    <FormText variant="micro" secondary numberOfLines={1}>{label}</FormText>
    <View style={styles.metricValue}>
      <FormText variant="heading" style={styles.figure}>{value}</FormText>
      {!empty && unit ? <FormText variant="caption" secondary>{unit}</FormText> : null}
    </View>
  </View>;
}

/** 목표 라벨과 진행 바를 한 덩어리로 묶습니다. 세션 요약과 분리해 위계를 만듭니다. */
export function GoalProgress({label, count, goal, accessibilityLabel}: {
  label: string;
  count: number;
  goal: number;
  accessibilityLabel: string;
}) {
  const {palette} = useFormTheme();
  const percent = Math.min(100, Math.round(count / Math.max(1, goal) * 100));
  return <View style={styles.goal}>
    <View style={styles.goalRow}>
      <FormText variant="caption" secondary>{label}</FormText>
      <FormText variant="caption" style={styles.figure}>{count}/{goal}회</FormText>
    </View>
    <View accessible accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}
      accessibilityValue={{min: 0, max: 100, now: percent}}
      style={[styles.track, {backgroundColor: palette.raised}]}>
      <View style={{width: `${percent}%`, height: 6, borderRadius: 3, backgroundColor: palette.focus}}/>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  pill: {minHeight: geometry.chipHeight, paddingHorizontal: 12, borderRadius: geometry.chipRadius,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  pillText: {fontWeight: '500'},
  segment: {flexDirection: 'row', padding: 3, borderRadius: geometry.innerRadius, gap: 3},
  segmentItem: {flex: 1, minWidth: 0, minHeight: 36, paddingHorizontal: 6, borderRadius: 11,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  metric: {flex: 1, minWidth: 0, minHeight: 78, borderWidth: 1, borderRadius: geometry.innerRadius,
    paddingHorizontal: 14, paddingVertical: 12, gap: 6, justifyContent: 'space-between'},
  metricValue: {flexDirection: 'row', alignItems: 'baseline', gap: 4},
  figure: {fontVariant: ['tabular-nums']},
  goal: {gap: 7},
  goalRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  track: {height: 6, borderRadius: 3, overflow: 'hidden'},
});
