/** Report whether audit-flagged Node build tools appear in the shipped JavaScript graph.
 * Absence does not clear npm audit or validate native libraries; retain the full audit separately.
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const packages = ['glob','minimatch','picomatch','postcss','image-size'];
export function auditedRuntimeModules(sources) {
    return packages.filter(name => sources.some(source =>
        ('/' + source.replaceAll('\\','/')).includes('/node_modules/' + name + '/')));
}
function mapsIn(directory) {
    return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => {
        const file = path.join(directory,entry.name);
        return entry.isDirectory() ? mapsIn(file) : file.endsWith('.map') ? [file] : [];
    });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const files = mapsIn(process.argv[2]);
    if (!files.length) throw Error('Release source maps are required for this report');
    const sources = files.flatMap(file => JSON.parse(fs.readFileSync(file,'utf8')).sources ?? []);
    if (!sources.length) throw Error('Release source graph is empty');
    const runtimePackages = auditedRuntimeModules(sources);
    const report = {scope:'JavaScript source graph only',checkedPackages:packages,
        sourceMaps:files.length,sourceCount:sources.length,runtimePackages,
        remaining:'Full npm audit and native dependency review remain separate release checks'};
    fs.writeFileSync('bundle-security-report.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
    if (runtimePackages.length) throw Error('Audit-flagged package found in release JavaScript');
}
