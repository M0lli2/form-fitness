import React from 'react';
import {Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewProps, type TextStyle, type ViewStyle} from 'react-native';
import {GlassView, isLiquidGlassAvailable} from 'expo-glass-effect';
import {BlurView} from 'expo-blur';
import {useFormTheme} from './Theme';
import {geometry, radius, squircle, typeScale} from './tokens';
import {resolveMaterial} from './policy.mjs';

/** 글자 확대를 제한하지 않는다. 한국어는 OS의 언어별 fallback을 사용한다. */
export function FormText({variant='body', secondary=false, style, ...props}:TextProps & {variant?:keyof typeof typeScale; secondary?:boolean}) {
  const {palette} = useFormTheme();
  return <Text {...props} allowFontScaling style={[
    typeScale[variant] as TextStyle,
    {color:secondary ? palette.secondary : palette.text, fontFamily:Platform.OS === 'android' ? 'sans-serif' : undefined},
    style,
  ]}/>;
}

/** 운동표/인바디 같은 content에는 Glass를 사용하지 않는다.
 *  표면은 모두 같은 동심원 곡률을 씁니다 — 콘텐츠 카드 24, 떠 있는 내비게이션 바 30. */
export function Surface({role='content', style, children, ...props}:Omit<ViewProps,'role'> & {role?:'content'|'navigation'|'control'}) {
  const {palette,mode,glass} = useFormTheme();
  const material = resolveMaterial({enabled:glass, reduceTransparency:false, role, platform:Platform.OS, nativeAvailable:isLiquidGlassAvailable()});
  const shape = {borderRadius:role === 'navigation' ? radius.nav : geometry.cardRadius, ...squircle};
  return <View {...props} style={[styles.surface, shape, {borderColor:palette.line}, style]}>
    {/* Keep the decorative native view within the surface and outside hit testing. */}
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.material,shape]}>
    {material === 'native-glass'
      ? <GlassView pointerEvents="none" glassEffectStyle="regular" style={[StyleSheet.absoluteFill,shape]}/>
      : material === 'frosted'
        ? <><BlurView pointerEvents="none" tint={mode === 'dark' ? 'dark' : 'light'} intensity={48} style={StyleSheet.absoluteFill}/><View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:palette.glassFill,borderWidth:1,borderColor:palette.glassRim},shape]}/></>
        : <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:palette.surface}]}/>}
    </View>
    {children}
  </View>;
}

/** Glass 부모의 opacity를 바꾸지 않고 눌림 상태를 색으로 표현한다.
 *  기본 버튼은 높이 52 · 반경 16(카드 24보다 한 단계 안쪽)으로 모든 화면이 같은 값을 씁니다. */
export function Action({title,onPress,disabled=false,secondary=false,style}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean;style?:StyleProp<ViewStyle>}) {
  const {palette}=useFormTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>[styles.action,squircle,{backgroundColor:disabled || secondary ? palette.raised : palette.action,borderWidth:2,borderColor:pressed?palette.focus:'transparent'},style]}>
    <FormText variant="label" numberOfLines={1} style={{textAlign:'center',color:disabled || secondary ? palette.secondary : palette.onAction}}>{title}</FormText>
  </Pressable>;
}
const styles=StyleSheet.create({
  material:{...StyleSheet.absoluteFillObject,overflow:'hidden'},
  surface:{overflow:'hidden',borderWidth:1,padding:geometry.cardPadding,gap:geometry.cardGap},
  action:{minHeight:geometry.controlMinHeight, borderRadius:geometry.buttonRadius, paddingHorizontal:geometry.cardPadding, paddingVertical:12, alignItems:'center', justifyContent:'center'},
});
