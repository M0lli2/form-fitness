import React from 'react';
import {Platform, Pressable, StyleSheet, Text, View, type TextProps, type ViewProps, type TextStyle} from 'react-native';
import {GlassView, isLiquidGlassAvailable} from 'expo-glass-effect';
import {BlurView} from 'expo-blur';
import {useFormTheme} from './Theme';
import {geometry, typeScale} from './tokens';
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

/** 운동표/인바디 같은 content에는 Glass를 사용하지 않는다. */
export function Surface({role='content', style, children, ...props}:ViewProps & {role?:'content'|'navigation'|'control'}) {
  const {palette,mode,glass} = useFormTheme();
  const material = resolveMaterial({enabled:glass, reduceTransparency:false, role, platform:Platform.OS, nativeAvailable:isLiquidGlassAvailable()});
  const shape = {borderRadius:role === 'content' ? geometry.cardRadius : geometry.controlRadius};
  return <View {...props} style={[styles.surface, shape, {borderColor:palette.line}, style]}>
    {material === 'native-glass'
      ? <GlassView pointerEvents="none" glassEffectStyle="regular" style={[StyleSheet.absoluteFill,shape]}/>
      : material === 'frosted'
        ? <><BlurView pointerEvents="none" tint={mode === 'dark' ? 'dark' : 'light'} intensity={48} style={StyleSheet.absoluteFill}/><View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:palette.glassFill,borderWidth:1,borderColor:palette.glassRim},shape]}/></>
        : <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:palette.surface}]}/>}
    {children}
  </View>;
}

/** Glass 부모의 opacity를 바꾸지 않고 눌림 상태를 색으로 표현한다. */
export function Action({title,onPress,disabled=false,secondary=false}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}) {
  const {palette}=useFormTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed})=>[styles.action,{backgroundColor:disabled || secondary ? palette.raised : palette.action,borderWidth:pressed?2:0,borderColor:palette.focus}]}>
    <FormText variant="label" style={{textAlign:'center',color:disabled || secondary ? palette.secondary : palette.onAction}}>{title}</FormText>
  </Pressable>;
}
const styles=StyleSheet.create({
  surface:{overflow:'hidden',borderWidth:1,padding:20,gap:12},
  action:{minHeight:52,borderRadius:16,paddingHorizontal:20,paddingVertical:14,alignItems:'center',justifyContent:'center'},
});

