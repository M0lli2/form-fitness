# Add a UI-only test target to the generated project; never ship test code in FORM.
require 'xcodeproj'
project_path = 'ios/Form.xcodeproj'
project = Xcodeproj::Project.open(project_path)
phone = project.targets.find { |target| target.name == 'Form' }
abort 'FORM target missing' unless phone
tests = project.targets.find { |target| target.name == 'FORMUITests' }
unless tests
  tests = project.new_target(:ui_test_bundle, 'FORMUITests', :ios, '15.1')
  group = project.main_group.new_group('FORMUITests', '../tests/ios')
  tests.source_build_phase.add_file_reference(group.new_file('WorkoutJourney.swift'))
  tests.add_dependency(phone)
end
tests.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.mori.form.uitests',
    # Xcode names both the runner and the plug-in from PRODUCT_NAME.
    'PRODUCT_NAME' => 'FORMUITests',
    'SWIFT_VERSION' => '5.0', 'GENERATE_INFOPLIST_FILE' => 'YES',
    'TEST_TARGET_NAME' => 'FORM', 'TARGETED_DEVICE_FAMILY' => '1,2',
    'CODE_SIGN_STYLE' => 'Automatic'
  })
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(phone)
scheme.add_test_target(tests)
scheme.save_as(project_path, 'FORMUITests', true)
