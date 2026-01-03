#!/bin/bash
set -e

echo "Starting iOS device build..."

# First attempt with expo
if npx expo run:ios --device 2>&1 | tee /tmp/expo-ios-build.log; then
    exit 0
fi

# Check if it's a provisioning profile error
if grep -q "No profiles for" /tmp/expo-ios-build.log; then
    echo ""
    echo "Provisioning profile error detected. Running xcodebuild with automatic signing..."
    echo ""
    
    cd ios
    xcodebuild -workspace fasola.xcworkspace \
        -scheme fasola \
        -configuration Debug \
        -destination 'generic/platform=iOS' \
        -allowProvisioningUpdates
    cd ..
    
    echo ""
    echo "Build successful. Running expo to install on device..."
    echo ""
fi

# Second attempt
if npx expo run:ios --device 2>&1 | tee /tmp/expo-ios-build.log; then
    exit 0
fi

# Check for untrusted developer error
if grep -qi "untrusted" /tmp/expo-ios-build.log || grep -qi "Verify the Developer App certificate" /tmp/expo-ios-build.log; then
    echo ""
    echo "=================================================="
    echo "UNTRUSTED DEVELOPER ERROR"
    echo "=================================================="
    echo ""
    echo "To trust this developer on your device:"
    echo ""
    echo "1. On your iPhone, go to Settings"
    echo "2. Navigate to: General > VPN & Device Management"
    echo "3. Under 'Developer App', tap on your developer account"
    echo "4. Tap 'Trust' and confirm"
    echo ""
    echo "=================================================="
    echo ""
    read -p "Press Enter after you have trusted the developer..."
    
    echo ""
    echo "Retrying build..."
    npx expo run:ios --device
fi
