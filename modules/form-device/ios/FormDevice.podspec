Pod::Spec.new do |s|
  s.name = 'FormDevice'
  s.version = '0.1.0'
  s.summary = 'FORM HealthKit and WatchConnectivity bridge'
  s.description = 'Native health permissions, queries, idempotent writes and durable WatchConnectivity inbox.'
  s.license = { :type => 'MIT' }
  s.author = 'FORM'
  s.homepage = 'https://example.invalid/form'
  s.platforms = { :ios => '15.1' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.frameworks = 'HealthKit', 'WatchConnectivity'
end
