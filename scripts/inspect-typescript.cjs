/** 로컬 TypeScript 컴파일러로 구문을 검사하고 소스를 일관되게 포맷합니다. */
const fs = require('node:fs'), path = require('node:path');
const ts = require(process.env.FORM_TYPESCRIPT_PATH || 'typescript');
const root = path.resolve(__dirname, '..');
let errors = 0, count = 0;
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
function walk(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'android', 'ios', 'wearos', 'watchos'].includes(item.name) && dir === root)
        continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory())
        walk(file);
    else if (/\.(tsx?|mjs|cjs)$/.test(file)) {
        const text = fs.readFileSync(file, 'utf8');
        const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
        const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
        for (const d of source.parseDiagnostics) {
            errors++;
            console.error(path.relative(root, file) + ': ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
        }
        if (process.argv.includes('--format') && !source.parseDiagnostics.length)
            fs.writeFileSync(file, printer.printFile(source));
        count++;
    }
} }
walk(root);
console.log(`Parsed ${count} source files; syntax errors: ${errors}. Dependency-aware type checking is separate.`);
process.exitCode = errors ? 1 : 0;
