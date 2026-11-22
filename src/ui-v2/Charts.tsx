import React, {useState} from 'react';
import {StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import {FormText} from './Primitives';
import {useFormTheme} from './Theme';
import {lineGeometry} from '../workout-features.mjs';

export type LinePoint = {label: string; value: number | null; note?: string};

/** RN View로 그리는 꺾은선 그래프. SVG 의존성 없이 소수점 변화를 그대로 보여 줍니다.
 *  값이 한 개거나 모두 같으면 가운데 선으로, 빈 값은 선을 끊습니다. */
export function LineChart({points, unit, height = 132, accessibilityLabel}: {
  points: LinePoint[];
  unit: string;
  height?: number;
  accessibilityLabel?: string;
}) {
  const {palette} = useFormTheme();
  const [width, setWidth] = useState(280);
  const known = points.filter(point => point.value !== null && Number.isFinite(point.value)) as {label: string; value: number; note?: string}[];
  const geometry = lineGeometry(points.map(point => point.value), {width: Math.max(120, width - 8), height});
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0 && next !== width) setWidth(next);
  };
  if (!known.length) {
    return <View accessible accessibilityLabel={`${accessibilityLabel ?? '추이'} 기록 없음`} style={[styles.empty, {borderColor: palette.line}]}>
      <FormText variant="caption" secondary>표시할 기록이 아직 없습니다.</FormText>
    </View>;
  }
  const summary = `${accessibilityLabel ?? '추이'} ${known.length}개 기록, ${known[0].value}${unit}에서 ${known[known.length - 1].value}${unit}`;
  return <View style={{gap: 6}} onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={summary}>
    <View style={[styles.plot, {height, borderColor: palette.line}]}>
      {/* 가로 기준선: 최고·중간·최저 */}
      {[0, .5, 1].map(ratio => <View key={ratio} pointerEvents="none"
        style={[styles.grid, {top: Math.round(ratio * height), backgroundColor: palette.line, opacity: ratio === 0 ? .5 : .28}]}/>) }
      {geometry.points.map((point, index) => {
        if (point.y === null) return null;
        const next = geometry.points[index + 1];
        const segment = next && next.y !== null ? {x1: point.x, y1: point.y, x2: next.x, y2: next.y} : null;
        return <React.Fragment key={index}>
          {segment && <View pointerEvents="none" style={[styles.segment, {left: (segment.x1 + segment.x2) / 2 - Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) / 2,
            top: (segment.y1 + segment.y2) / 2 - 1, width: Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1),
            backgroundColor: palette.focus, transform: [{rotate: `${Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1)}rad`}]}]}/>}
          <View pointerEvents="none" style={[styles.dot, {left: point.x - 4, top: point.y - 4,
            backgroundColor: index === geometry.points.length - 1 ? palette.action : palette.focus}]}/>
        </React.Fragment>;
      })}
      <View pointerEvents="none" style={[styles.maxLabel, {backgroundColor: palette.surface}]}>
        <FormText variant="caption" secondary style={styles.small}>{geometry.max}{unit}</FormText>
      </View>
      <View pointerEvents="none" style={[styles.minLabel, {backgroundColor: palette.surface}]}>
        <FormText variant="caption" secondary style={styles.small}>{geometry.min}{unit}</FormText>
      </View>
    </View>
    <View style={styles.labels}>
      {points.map((point, index) => {
        const show = index === 0 || index === points.length - 1 || (points.length > 2 && index === Math.floor((points.length - 1) / 2));
        return <View key={index} style={styles.labelCell} accessible accessibilityLabel={`${point.label}, ${point.value ?? '기록 없음'} ${unit}`}>
          <FormText variant="caption" secondary={index !== points.length - 1} style={[styles.small, index === points.length - 1 && styles.current]}>
            {show ? point.label : ' '}
          </FormText>
        </View>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  plot: {position: 'relative', overflow: 'hidden', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginTop: 6},
  grid: {position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth},
  segment: {position: 'absolute', height: 2, borderRadius: 1},
  dot: {position: 'absolute', width: 8, height: 8, borderRadius: 4},
  maxLabel: {position: 'absolute', right: 4, top: 2, paddingHorizontal: 3, borderRadius: 4},
  minLabel: {position: 'absolute', right: 4, bottom: 2, paddingHorizontal: 3, borderRadius: 4},
  labels: {flexDirection: 'row'},
  labelCell: {flex: 1, minWidth: 0, alignItems: 'center'},
  small: {fontSize: 10, lineHeight: 14, fontVariant: ['tabular-nums']},
  current: {fontWeight: '700'},
  empty: {minHeight: 96, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12},
});
