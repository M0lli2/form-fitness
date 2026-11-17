// Configure Gradle, rather than overriding uses-sdk in the generated manifest.
const {withAndroidManifest,withProjectBuildGradle}=require('@expo/config-plugins');
module.exports=function(config){
 config=withAndroidManifest(config,c=>{c.modResults.manifest.application[0].$['android:allowBackup']='false';return c;});
 return withProjectBuildGradle(config,c=>{
  if(!c.modResults.contents.includes('// FORM minimum SDK'))c.modResults.contents+='\n// FORM minimum SDK\next.minSdkVersion = 28\n';
  return c;
 });
};
