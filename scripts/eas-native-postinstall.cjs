/** EAS runs this after iOS prebuild and pod install, when the host Xcode project exists. */
const {execFileSync} = require('node:child_process');
if (process.env.EAS_BUILD_PLATFORM === 'ios') {
  execFileSync('ruby', ['scripts/embed-watch.rb'], {stdio:'inherit'});
}
