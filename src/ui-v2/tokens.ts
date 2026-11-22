/** 흑백 대비와 역할 기반 글자 체계. 브랜드 강조를 내용과 분리한다.
 *  0.3.6: 화면마다 흩어져 있던 색·반경·간격을 이 파일 하나로 모았습니다.
 *  `src/theme.tsx`의 팔레트도 이 값을 그대로 옮겨 쓰므로 두 계층의 색이 어긋나지 않습니다. */
export const colors = {
  light: {
    canvas: '#F4F4F5', surface: '#FFFFFF', raised: '#ECECEE',
    text: '#121214', secondary: '#56565D', line: '#DADCE5',
    action: '#171719', onAction: '#FFFFFF', focus: '#314D9F', accentSoft: '#E2E9FF',
    success: '#146B48', error: '#B42331', glassFill: 'rgba(255,255,255,0.76)',
    glassRim: 'rgba(255,255,255,0.95)',
  },
  dark: {
    canvas: '#101012', surface: '#1C1C1F', raised: '#2B2B30',
    text: '#F7F7F8', secondary: '#B8B8C1', line: '#3F424D',
    action: '#F5F5F7', onAction: '#151517', focus: '#B7C9FF', accentSoft: '#303B5C',
    success: '#8BE0B7', error: '#FFB1BB', glassFill: 'rgba(42,42,47,0.78)',
    glassRim: 'rgba(255,255,255,0.38)',
  },
} as const;

/** 글자 크기는 여섯 단계만 씁니다. 화면에서 임의의 크기를 새로 만들지 않습니다. */
export const typeScale = {
  title: {fontSize:30, lineHeight:39, letterSpacing:-0.45, fontWeight:'700'},
  heading: {fontSize:22, lineHeight:30, letterSpacing:-0.35, fontWeight:'700'},
  subheading: {fontSize:18, lineHeight:26, letterSpacing:-0.2, fontWeight:'600'},
  body: {fontSize:17, lineHeight:26, fontWeight:'400'},
  label: {fontSize:15, lineHeight:22, fontWeight:'600'},
  caption: {fontSize:13, lineHeight:20, fontWeight:'400'},
  micro: {fontSize:11, lineHeight:16, fontWeight:'500'},
  metric: {fontSize:36, lineHeight:44, fontWeight:'600', fontVariant:['tabular-nums']},
} as const;

/** 간격·반경·높이의 단일 기준.
 *  화면 20, 카드 20, 카드 안 서브카드 14~16, CTA 16, 일반 버튼 14, 칩·배지 999(필) 또는 12. */
export const geometry = {
  screenPadding: 20,
  cardRadius: 20,
  innerRadius: 14,
  buttonRadius: 16,
  controlRadius: 24,
  chipRadius: 999,
  controlMinHeight: 52,
  buttonMinHeight: 48,
  chipHeight: 36,
  gap: 12,
  sectionGap: 16,
} as const;
