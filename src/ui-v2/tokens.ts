/** 흑백 대비와 역할 기반 글자 체계. 브랜드 강조를 내용과 분리한다. */
export const colors = {
  light: {
    canvas: '#F4F4F5', surface: '#FFFFFF', raised: '#ECECEE',
    text: '#121214', secondary: '#56565D', line: '#D0D0D5',
    action: '#171719', onAction: '#FFFFFF', focus: '#4C56D7',
    success: '#146B48', error: '#B42331', glassFill: 'rgba(255,255,255,0.76)',
    glassRim: 'rgba(255,255,255,0.95)',
  },
  dark: {
    canvas: '#101012', surface: '#1C1C1F', raised: '#2B2B30',
    text: '#F7F7F8', secondary: '#B8B8C1', line: '#48484F',
    action: '#F5F5F7', onAction: '#151517', focus: '#BEC2FF',
    success: '#8BE0B7', error: '#FFB1BB', glassFill: 'rgba(42,42,47,0.78)',
    glassRim: 'rgba(255,255,255,0.38)',
  },
} as const;
export const typeScale = {
  title: {fontSize:30, lineHeight:39, fontWeight:'700'},
  heading: {fontSize:22, lineHeight:30, fontWeight:'600'},
  body: {fontSize:17, lineHeight:26, fontWeight:'400'},
  label: {fontSize:15, lineHeight:22, fontWeight:'600'},
  caption: {fontSize:13, lineHeight:20, fontWeight:'400'},
  metric: {fontSize:36, lineHeight:44, fontWeight:'600', fontVariant:['tabular-nums']},
} as const;
export const geometry = {screenPadding:20, cardRadius:20, controlRadius:24, controlMinHeight:52, gap:12} as const;
