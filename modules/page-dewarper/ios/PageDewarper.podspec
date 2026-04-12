require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'PageDewarper'
  s.version        = package['version']
  s.summary        = 'Native page dewarping using page-dewarp-swift'
  s.description    = 'Expo native module wrapping page-dewarp-swift for page dewarping with BW output for OCR'
  s.license        = 'MIT'
  s.author         = 'fasola'
  s.homepage       = 'https://github.com/erykpiast/fasola'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.source_files = "PageDewarperModule.swift"
  s.frameworks = 'UIKit'

  s.dependency 'ExpoModulesCore'
  s.dependency 'PageDewarp', '~> 2.0'
end
