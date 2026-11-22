/** 두 테마의 의미 기반 색상. 투명도를 줄여도 정보 대비와 버튼 계층을 유지합니다.
 *  0.3.6: 색의 출처를 `ui-v2/tokens.ts` 하나로 모으고, 카드·버튼 반경도 디자인 시스템 값과 맞췄습니다. */
import React, { createContext, useContext } from 'react';
import { useColorScheme, Platform, View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { colors as designColors, geometry, squircle, typeScale } from './ui-v2/tokens';

/** tokens의 역할 기반 색을 기존 화면이 쓰는 이름으로 옮깁니다. */
function paletteOf(mode: 'light' | 'dark') {
    const c = designColors[mode];
    return {
        bg: c.canvas, ink: c.text, muted: c.secondary, glass: c.glassFill, solid: c.surface,
        line: c.line, accent: c.focus, accentBase: c.accentSoft, hero: mode === 'dark' ? '#303036' : '#242428',
        lime: mode === 'dark' ? '#EEEEF2' : '#E3E3E8', soft: c.raised, danger: c.error,
    };
}
export const palettes = { light: paletteOf('light'), dark: paletteOf('dark') };
type ThemeValue = {
    colors: ReturnType<typeof paletteOf>;
    dark: boolean;
    contrast: boolean;
};
const Theme = createContext<ThemeValue>({ colors: palettes.light, dark: false, contrast: false });
export function ThemeProvider({ mode, contrast, children }: {
    mode: string;
    contrast: boolean;
    children: React.ReactNode;
}) { const system = useColorScheme(), dark = mode === 'dark' || (mode === 'system' && system === 'dark'); return <Theme.Provider value={{ colors: palettes[dark ? 'dark' : 'light'], dark, contrast }}>{children}</Theme.Provider>; }
export const useTheme = () => useContext(Theme);
export function Glass({ children, style }: {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) { const { colors } = useTheme(); return <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.solid }, style]}>{children}</View>; }
export function Label({ children, size = 15, muted = false, bold = false, heading = false, numberOfLines, style }: {
    children: React.ReactNode;
    size?: number;
    muted?: boolean;
    bold?: boolean;
    heading?: boolean;
    /** 긴 루틴 이름처럼 한 줄로 잘라야 하는 곳에서만 씁니다. */
    numberOfLines?: number;
    style?: any;
}) {
    const { colors } = useTheme();
    // Keep the platform's Korean system typeface and scalable text settings.
    return <Text accessibilityRole={heading ? 'header' : undefined} numberOfLines={numberOfLines} style={[{ fontFamily: Platform.OS === 'android' ? 'sans-serif' : undefined, fontSize: size,
        letterSpacing: size >= 20 ? -0.35 : 0, lineHeight: Math.ceil(size * (size >= 20 ? 1.3 : 1.47)),
        color: muted ? colors.muted : colors.ink, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>;
}
export function Button({ title, onPress, secondary = false, disabled = false, danger = false, tone = 'default' }: {
    title: string;
    onPress: () => void;
    secondary?: boolean;
    disabled?: boolean;
    danger?: boolean;
    /** 어두운 히어로·이미지 위에서는 밝은 버튼을 씁니다. */
    tone?: 'default' | 'onDark';
}) { const { colors } = useTheme(); const onDark = tone === 'onDark'; return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: onDark ? '#FFFFFF' : secondary ? colors.soft : colors.ink, opacity: disabled ? .4 : pressed ? .75 : 1 }]}><Text style={{ color: onDark ? '#121214' : danger ? colors.danger : secondary ? colors.ink : colors.bg, fontSize: typeScale.label.fontSize, lineHeight: typeScale.label.lineHeight, fontWeight: '700', textAlign: 'center' }}>{title}</Text></Pressable>; }
const styles = StyleSheet.create({ card: { borderRadius: geometry.cardRadius, borderWidth: 1, padding: geometry.cardPadding, overflow: 'hidden', gap: geometry.cardGap, ...squircle }, button: { minHeight: geometry.controlMinHeight, borderRadius: geometry.buttonRadius, paddingHorizontal: geometry.xl, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', ...squircle } });
