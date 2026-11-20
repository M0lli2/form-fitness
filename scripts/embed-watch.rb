# Create the companion target in Expo's generated project and embed its product.
# Run after expo prebuild on macOS. Idempotent; does not add signing identities or certificates.
require 'xcodeproj'
require 'pathname'
require 'json'
app = JSON.parse(File.read(File.expand_path('../app.json', __dir__))).fetch('expo')

path = ARGV.fetch(0, 'ios/Form.xcodeproj')
project = Xcodeproj::Project.open(path)
phone = project.targets.find { |target| target.name == 'Form' }
abort 'FORM iOS target was not generated' unless phone
watch = project.targets.find { |target| target.name == 'FORMWatch' }
unless watch
  watch = project.new_target(:application, 'FORMWatch', :watchos, '10.0')
  group = project.main_group.new_group('FORMWatch', '../watchos')
  Dir.glob('watchos/Sources/**/*.swift').sort.each do |source|
    reference = group.new_file(source.delete_prefix('watchos/'))
    watch.source_build_phase.add_file_reference(reference)
  end
end
# Reuse the editable Icon Composer package for the watch target.
icon_path = app.fetch('ios').fetch('icon').delete_prefix('./')
icon_name = File.basename(icon_path, '.icon')
icon_reference = project.files.find { |file| file.path == "../#{icon_path}" }
icon_reference ||= project.main_group.new_file("../#{icon_path}")
icon_reference.last_known_file_type = 'folder.iconcomposer.icon'
unless watch.resources_build_phase.files.any? { |file| file.file_ref == icon_reference }
  watch.resources_build_phase.add_file_reference(icon_reference)
end
watch.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.mori.form.watchkitapp',
    'PRODUCT_NAME' => 'FORMWatch',
    'ASSETCATALOG_COMPILER_APPICON_NAME' => icon_name,
    'SWIFT_VERSION' => '5.0',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'INFOPLIST_KEY_CFBundleDisplayName' => app.fetch('name'),
    'INFOPLIST_KEY_WKCompanionAppBundleIdentifier' => 'com.mori.form',
    'INFOPLIST_KEY_WKApplication' => 'YES',
    'INFOPLIST_KEY_WKRunsIndependentlyOfCompanionApp' => 'YES',
    'INFOPLIST_KEY_WKBackgroundModes' => ['workout-processing'],
    'INFOPLIST_KEY_NSHealthShareUsageDescription' => '운동 중 심박수와 활동 에너지를 표시합니다.',
    'INFOPLIST_KEY_NSHealthUpdateUsageDescription' => '완료한 운동을 Apple 건강과 피트니스에 저장합니다.',
    'CODE_SIGN_ENTITLEMENTS' => '../watchos/FORMWatch.entitlements',
    'TARGETED_DEVICE_FAMILY' => '4',
    'SDKROOT' => 'watchos',
    'SUPPORTED_PLATFORMS' => 'watchos watchsimulator',
    'WATCHOS_DEPLOYMENT_TARGET' => '10.0',
    'MARKETING_VERSION' => app.fetch('version'),
    'CURRENT_PROJECT_VERSION' => app.fetch('ios').fetch('buildNumber'),
    'SKIP_INSTALL' => 'YES'
  })
end
phone.add_dependency(watch) unless phone.dependencies.any? { |dependency| dependency.target == watch }
phase = phone.copy_files_build_phases.find { |item| item.name == 'Embed Watch Content' }
phase ||= phone.new_copy_files_build_phase('Embed Watch Content')
phase.dst_subfolder_spec = '16'
phase.dst_path = '$(CONTENTS_FOLDER_PATH)/Watch'
unless phase.files.any? { |file| file.file_ref == watch.product_reference }
  file = phase.add_file_reference(watch.product_reference)
  file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end
project.save
# Reopen saved output to verify the target dependency and embed phase survived serialization.
saved = Xcodeproj::Project.open(path)
abort 'Watch embed verification failed' unless saved.targets.find { |target| target.name == 'Form' }
  .copy_files_build_phases.any? { |item| item.name == 'Embed Watch Content' && !item.files.empty? }
puts 'FORMWatch companion target and Embed Watch Content configured'
