require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'TextExtractor'
  s.version        = package['version']
  s.summary        = 'Text extraction (OCR) using Apple Vision'
  s.description    = 'Native module for text recognition using Apple Vision framework'
  s.license        = 'MIT'
  s.author         = 'fasola'
  s.homepage       = 'https://github.com/fasola'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
