import React, {createContext, useContext, useEffect, useState} from 'react';
import {AccessibilityInfo, Platform, useColorScheme} from 'react-native';
import {colors} from './tokens';
import {resolveMode} from './policy.mjs';

export type Preferences = {mode:'system'|'light'|'dark'; glass:boolean};
type Context = {palette: typeof colors.light | typeof colors.dark; mode:'light'|'dark'; glass:boolean; reduceMotion:boolean};
const ThemeContext = createContext<Context | null>(null);

/** OS 접근성 값이 확인되기 전에는 효과를 끈다. 초기 렌더의 잘못된 투명화를 방지한다. */
export function FormTheme({preferences, children}:{preferences:Preferences; children:React.ReactNode}) {
  const systemMode = useColorScheme();
  const [reduceTransparency, setReduceTransparency] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => {if(live) setReduceMotion(v);}).catch(() => {});
    if (Platform.OS === 'ios') {
      AccessibilityInfo.isReduceTransparencyEnabled().then(v => {if(live) setReduceTransparency(v);}).catch(() => {});
    } else setReduceTransparency(false);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const transparency = Platform.OS === 'ios'
      ? AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency) : null;
    return () => {live = false; motion.remove(); transparency?.remove();};
  }, []);
  const mode = resolveMode(preferences.mode, systemMode) as 'light'|'dark';
  return <ThemeContext.Provider value={{palette:colors[mode], mode, glass:preferences.glass && !reduceTransparency, reduceMotion}}>{children}</ThemeContext.Provider>;
}
export function useFormTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw Error('FormTheme provider가 필요합니다.');
  return value;
}

