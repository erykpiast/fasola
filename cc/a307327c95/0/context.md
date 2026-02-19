# Session Context

## User Prompts

### Prompt 1

We need to target newer iOS versions everywhere. It's totally fine, since I'm actually only running the app on v26. › Compiling react-native-executorch Pods/react-native-executorch » pfft.c
› Packaging react-native-reanimated Pods/RNReanimated » libRNReanimated.a
› Executing expo-modules-core Pods/ExpoModulesCore » Copy generated compatibility header

❌  (modules/liquid-glass/ios/LiquidGlassInputView.swift:223:64)

  221 |           }
  222 |           
> 223 |           TextField("",...

### Prompt 2

Okay, so now we changed the requirement for native modules to a higher iOS and that's good, but it means that the pods installation fails on resolving the verison requirements since somewhere we require iOS 15. We need to update that one to v17 too and reinstall pods.

### Prompt 3

When I run npx expo prebuild --clean, the deployment target property is removed from @ios/Podfile.properties.json

### Prompt 4

Please install the pods with verbose flag and verify whether the internal native modules were properly linked. Liquid Glass components are still missing in the app.

