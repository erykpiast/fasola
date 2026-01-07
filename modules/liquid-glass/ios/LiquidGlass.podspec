require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'LiquidGlass'
  s.version        = package['version']
  s.summary        = 'Adaptive glass UI components with automatic content color adaptation'
  s.description    = 'Native iOS glass components that automatically adapt icon and text colors based on background brightness'
  s.license        = 'MIT'
  s.author         = 'fasola'
  s.homepage       = 'https://github.com/fasola/liquid-glass'
  s.platforms      = {
    :ios => '17.0',
  }
  s.source         = { git: 'https://github.com/fasola/liquid-glass.git', tag: "v#{s.version}" }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
end
