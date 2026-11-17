// Export repository source without dependencies, personal state or generated binaries.
const fs=require('node:fs'),path=require('node:path');
const files=[];
function walk(dir='.') { for(const item of fs.readdirSync(dir,{withFileTypes:true})) {
 if(['.git','node_modules'].includes(item.name))continue;
 const p=path.join(dir,item.name);
 if(item.isDirectory())walk(p);
 else if(!/\.(png|jpg|zip|db)$/.test(p) && !/scripts[\\/](integrate-v2|finalize-source)\.cjs$/.test(p))files.push({path:p.replaceAll('\\','/'),mode:'100644',type:'blob',content:fs.readFileSync(p,'utf8')});
 }}
walk();
process.stdout.write(JSON.stringify(files.filter(f=>process.argv[2]==='src'?f.path.startsWith('src/'):!f.path.startsWith('src/'))));
