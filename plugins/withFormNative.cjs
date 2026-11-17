// Configure Gradle, rather than overriding uses-sdk in the generated manifest.
const {withAndroidManifest,withProjectBuildGradle,withAppBuildGradle}=require('@expo/config-plugins');
module.exports=function(config){
 config=withAndroidManifest(config,c=>{c.modResults.manifest.application[0].$['android:allowBackup']='false';return c;});
 // SDK 54's generated app may retain a literal minimum independent of rootProject.ext.
 config=withAppBuildGradle(config,c=>{
  if(!/minSdkVersion\s+[^\r\n]+/.test(c.modResults.contents))throw Error('Cannot locate Android app minimum SDK');
  c.modResults.contents=c.modResults.contents.replace(/minSdkVersion\s+[^\r\n]+/,'minSdkVersion 28');
  return c;
 });
 return withProjectBuildGradle(config,c=>{
  if(!c.modResults.contents.includes('// FORM minimum SDK'))c.modResults.contents+='\n// FORM minimum SDK\next.minSdkVersion = 28\n';
  return c;
 });
};
