require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ICloudSync'
  s.version        = package['version']
  s.summary        = 'iCloud Documents sync for recipe data and photos'
  s.description    = 'Native module for iCloud ubiquity container access, file monitoring, and conflict resolution'
  s.license        = 'MIT'
  s.author         = 'fasola'
  s.homepage       = 'https://github.com/fasola/icloud-sync'
  s.platforms      = {
    :ios => '17.0',
  }
  s.source         = { git: 'https://github.com/fasola/icloud-sync.git', tag: "v#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
end
