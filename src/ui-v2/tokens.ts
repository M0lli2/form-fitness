/** 흑백 대비와 역할 기반 글자 체계. 브랜드 강조를 내용과 분리한다.
 *  0.3.6: 화면마다 흩어져 있던 색·반경·간격을 이 파일 하나로 모았습니다.
 *  0.3.7: 반경을 6단 사다리(pill·sheet·nav·card·inner·small)로 고정하고,
 *         중첩되는 두 사각형이 같은 곡률 중심을 쓰도록 `concentric()`으로 안쪽 값을 파생합니다.
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
  /** 홈 첫 문장처럼 두 줄로 끊어 읽는 표제. 320pt 폭에서도 한 줄에 들어가야 합니다. */
  display: {fontSize:26, lineHeight:34, letterSpacing:-0.5, fontWeight:'700'},
  heading: {fontSize:22, lineHeight:30, letterSpacing:-0.35, fontWeight:'700'},
  subheading: {fontSize:18, lineHeight:26, letterSpacing:-0.2, fontWeight:'600'},
  body: {fontSize:17, lineHeight:26, fontWeight:'400'},
  label: {fontSize:15, lineHeight:22, fontWeight:'600'},
  caption: {fontSize:13, lineHeight:20, fontWeight:'400'},
  micro: {fontSize:11, lineHeight:16, fontWeight:'500'},
  metric: {fontSize:36, lineHeight:44, fontWeight:'600', fontVariant:['tabular-nums']},
} as const;

/** 반경 사다리 — 위아래 한 단계씩만 내려갑니다.
 *  pill(999) · sheet(32) · nav(30) · card(24) · inner(16) · small(12).
 *  카드 안에 들어가는 서브카드·입력·버튼은 inner, 그 안의 작은 사각형은 small을 씁니다. */
export const radius = {
  pill: 999,
  sheet: 32,
  nav: 30,
  card: 24,
  inner: 16,
  small: 12,
} as const;

/** 동심원 곡률: 바깥 사각형에서 `inset`만큼 들어온 안쪽 사각형의 반경.
 *  R_inner = max(8, R_outer − inset) — 두 모서리의 곡률 중심이 같은 점을 가리킵니다.
 *  예: 하단 탭 바 nav(30) − 패딩 6 = 24, 세그먼트 inner(16) − 패딩 4 = 12. */
export const concentric = (outer: number, inset: number, floor = 8) => Math.max(floor, outer - inset);

/** iOS는 연속 곡률(squircle)로 그리고, Android는 같은 값의 원형 곡률을 씁니다.
 *  StyleSheet 타입에 `borderCurve`가 있으므로 그대로 펼쳐 씁니다. */
export const squircle = {borderCurve: 'continuous'} as const;

/** 4pt 그리드 간격. 화면 20 · 섹션 20 · 카드 20 · 카드 안 12/16 · 미세 조정 4/8. */
export const space = {xs:4, sm:8, md:12, lg:16, xl:20, xxl:24} as const;

/** 높이는 4pt 배수만 씁니다. 필 36, 아이콘 버튼 36, 보조 컨트롤 44, 입력·필드 48, 기본 버튼 52. */
export const height = {chip:36, icon:36, control:44, field:48, button:52} as const;

/** 간격·반경·높이의 단일 기준. 화면 코드는 이 값만 참조합니다. */
export const geometry = {
  xs: space.xs,
  sm: space.sm,
  md: space.md,
  lg: space.lg,
  xl: space.xl,
  xxl: space.xxl,
  screenPadding: space.xl,
  sectionGap: space.xl,
  cardRadius: radius.card,
  cardPadding: space.xl,
  innerRadius: radius.inner,
  buttonRadius: radius.inner,
  controlRadius: radius.card,
  navRadius: radius.nav,
  navPadding: 6,
  navItemRadius: concentric(radius.nav, 6),
  segmentRadius: radius.inner,
  segmentPadding: space.xs,
  segmentItemRadius: concentric(radius.inner, space.xs),
  sheetRadius: radius.sheet,
  chipRadius: radius.pill,
  controlMinHeight: height.button,
  buttonMinHeight: height.field,
  chipHeight: height.chip,
  iconButton: height.icon,
  gap: space.md,
  tightGap: space.sm,
  cardGap: space.md,
} as const;
