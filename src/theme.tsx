/** 두 테마의 의미 기반 색상. 투명도를 줄여도 정보 대비와 버튼 계층을 유지합니다. */
import React, { createContext, useContext } from 'react';
import { useColorScheme, View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
export const palettes = { light: {bg:'#F4F4F5',ink:'#121214',muted:'#56565D',glass:'rgba(255,255,255,.64)',solid:'#FFFFFF',line:'#D0D0D5',hero:'#242428',lime:'#E3E3E8',soft:'#ECECEE',danger:'#B42331'}, dark: {bg:'#101012',ink:'#F7F7F8',muted:'#B8B8C1',glass:'rgba(35,35,40,.64)',solid:'#1C1C1F',line:'#48484F',hero:'#303036',lime:'#EEEEF2',soft:'#2B2B30',danger:'#FF9FA8'} };
type ThemeValue = {
    colors: typeof palettes.light;
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
}) { const { colors, dark, contrast } = useTheme(); return <View style={[styles.card, {borderColor:colors.line,backgroundColor:colors.solid},style]}>{children}</View>; }
export function Label({ children, size = 15, muted = false, bold = false, style }: {
    children: React.ReactNode;
    size?: number;
    muted?: boolean;
    bold?: boolean;
    style?: any;
}) {
    const { colors } = useTheme();
    // Keep the platform's Korean system typeface and scalable text settings.
    return <Text style={[{ fontSize: size, lineHeight: Math.ceil(size * (size >= 20 ? 1.24 : 1.44)),
        color: muted ? colors.muted : colors.ink, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>;
}
export function Button({ title, onPress, secondary = false, disabled = false, danger = false }: {
    title: string;
    onPress: () => void;
    secondary?: boolean;
    disabled?: boolean;
    danger?: boolean;
}) { const { colors } = useTheme(); return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? colors.soft : colors.lime, opacity: disabled ? .4 : pressed ? .75 : 1 }]}><Text style={{ color: danger ? colors.danger : secondary ? colors.ink : '#171719', fontSize: 14, fontWeight: '700' }}>{title}</Text></Pressable>; }
const styles = StyleSheet.create({ card: { borderRadius: 25, borderWidth: 1, padding: 22, overflow: 'hidden', gap: 12 }, button: { minHeight: 48, borderRadius: 15, paddingHorizontal: 17, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' } });
