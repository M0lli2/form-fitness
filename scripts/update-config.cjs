// 개발 중 스키마 변경을 한 번에 적용하는 안전한 로컬 마이그레이션 스크립트.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function edit(file, transform) { const target = path.join(root, file); fs.writeFileSync(target, transform(fs.readFileSync(target, 'utf8'))); }
edit('package.json', text => { const pkg = JSON.parse(text.replace(/^\uFEFF/, '')); pkg.dependencies['expo-crypto'] = '~15.0.0'; return JSON.stringify(pkg, null, 2) + '\n'; });
edit('src/types.ts', text => text.replace("theme:'light'|'dark'|'system'", "theme:'light'|'dark'|'system';glass:boolean"));
edit('src/storage.ts', text => text.replace("theme:'system'", "theme:'system',glass:false"));
edit('src/App.tsx', text => text.replace('contrast={state.settings.contrast}', 'contrast={state.settings.contrast||!state.settings.glass}').replace('<View style={s.spread}><Label>투명도 줄이기</Label>', '<View style={s.spread}><Label>Liquid Glass</Label><Switch accessibilityLabel="Liquid Glass 효과" value={state.settings.glass} onValueChange={glass=>change(x=>({...x,settings:{...x.settings,glass}}))}/></View><View style={s.spread}><Label>투명도 줄이기</Label>'));
// Expo plugin dependency is supplied by Expo; keep only imports that are used.
edit('plugins/withFormNative.cjs', text => text.replace('withAndroidManifest,withBuildProperties', 'withAndroidManifest'));
