import React from 'react';
import {StyleSheet, View} from 'react-native';
import {useFormTheme} from './Theme';

/** 컬러 이모지 대신 쓰는 모노크롬 탭 아이콘.
 *  SVG·이미지 의존성 없이 View 도형만으로 22px 상자 안에 같은 선 굵기(1.8)로 그립니다.
 *  활성 탭은 본문색, 비활성 탭은 보조색이라 라이트·다크 모두에서 대비가 유지됩니다. */
export type TabIconName = 'home' | 'workout' | 'library' | 'progress' | 'settings';

const BOX = 22;
const STROKE = 1.8;

export function TabIcon({name, active}: {name: TabIconName; active: boolean}) {
  const {palette} = useFormTheme();
  const color = active ? palette.text : palette.secondary;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={styles.box}>
    {name === 'home' ? <>
      {/* 지붕 두 변 + 아래가 열린 몸체 + 문 */}
      <View style={[styles.bar, {left: 3.1, top: 6.5, width: 9.4, backgroundColor: color, transform: [{rotate: '-45deg'}]}]}/>
      <View style={[styles.bar, {left: 9.5, top: 6.5, width: 9.4, backgroundColor: color, transform: [{rotate: '45deg'}]}]}/>
      <View style={[styles.frame, {left: 5.2, top: 10.4, width: 11.6, height: 9.4, borderColor: color,
        borderTopWidth: 0, borderBottomLeftRadius: 2.5, borderBottomRightRadius: 2.5}]}/>
      <View style={[styles.frame, {left: 9.6, top: 14.4, width: 2.8, height: 5.4, borderColor: color, borderRadius: 1.2}]}/>
    </> : name === 'workout' ? <>
      {/* 루틴: 점과 줄 세 개 */}
      {[4.9, 10.1, 15.3].map(top => <React.Fragment key={top}>
        <View style={[styles.dot, {left: 3, top, backgroundColor: color}]}/>
        <View style={[styles.bar, {left: 8, top: top + 0.4, width: 11, backgroundColor: color}]}/>
      </React.Fragment>)}
    </> : name === 'library' ? <>
      {/* 운동도감: 돋보기 */}
      <View style={[styles.frame, {left: 3.6, top: 2.8, width: 12.4, height: 12.4, borderRadius: 6.2, borderColor: color}]}/>
      <View style={[styles.bar, {left: 14.2, top: 14.2, width: 6.2, backgroundColor: color, transform: [{rotate: '45deg'}]}]}/>
    </> : name === 'progress' ? <>
      {/* 기록: 기준선과 세 개의 막대 */}
      <View style={[styles.bar, {left: 3.4, top: 18.2, width: 15.4, backgroundColor: color}]}/>
      {[[5.4, 5.5], [9.5, 9.5], [13.6, 13.4]].map(([left, height]) =>
        <View key={left} style={[styles.bar, {left, top: 18.2 - height, width: 3.2, height, borderRadius: 1.6, backgroundColor: color}]}/>)}
    </> : <>
      {/* 내 정보: 머리와 어깨 */}
      <View style={[styles.frame, {left: 7.3, top: 3.2, width: 7.4, height: 7.4, borderRadius: 3.7, borderColor: color}]}/>
      <View style={[styles.frame, {left: 4.6, top: 12.4, width: 12.8, height: 7, borderColor: color, borderBottomWidth: 0,
        borderTopLeftRadius: 6.4, borderTopRightRadius: 6.4}]}/>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  box: {width: BOX, height: BOX},
  bar: {position: 'absolute', height: STROKE, borderRadius: STROKE / 2},
  dot: {position: 'absolute', width: 2.6, height: 2.6, borderRadius: 1.3},
  frame: {position: 'absolute', borderWidth: STROKE},
});
