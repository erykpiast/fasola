# Welcome to Fasola app 🫘

This app is a playground for learning expo and an attempt to create useful mobile application for people trying to get
the most out of their cook books.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Testing on Physical Devices

This app uses custom native modules (like `expo-text-extractor` for OCR) that require a development build instead of Expo Go.

### iOS Device

1. **Build and install the development client** (first time only):

   ```bash
   npx expo run:ios --device
   ```

   This will build the app and install it on your connected iPhone.

2. **Trust the developer profile** (first time only):
   - On your iPhone: **Settings → General → VPN & Device Management**
   - Tap your developer profile and tap Trust

3. **Start the development server**:

   ```bash
   npx expo start --dev-client
   ```

4. **Open the app** on your iPhone and it will connect to the development server

**Note:** Apps signed with a free Apple Developer account expire after 7 days and need to be rebuilt.
