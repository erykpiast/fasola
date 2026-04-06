require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'PageDewarper'
  s.version        = package['version']
  s.summary        = 'Native page dewarping using page-dewarp-swift'
  s.description    = 'Expo native module wrapping page-dewarp-swift for page dewarping with color and BW output'
  s.license        = 'MIT'
  s.author         = 'fasola'
  s.homepage       = 'https://github.com/erykpiast/fasola'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.source_files = "PageDewarperModule.swift", "PageDewarp/**/*.{h,m,mm,swift,hpp,cpp,c}"
  s.libraries = 'c++'
  s.frameworks = 'UIKit', 'Accelerate'

  s.dependency 'ExpoModulesCore'
  s.dependency 'opencv-rne', '~> 4.11'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/PageDewarp/OpenCVBridge/include" "$(PODS_TARGET_SRCROOT)/PageDewarp/CLBFGSB/include"',
  }
end
