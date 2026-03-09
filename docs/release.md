# Releasing to TestFlight

## Prerequisites

- An Apple Developer account with the app registered
- EAS CLI installed (`eas-cli` is a devDependency)
- Logged in to EAS: `npx eas-cli login`

## Initial EAS Setup (one-time)

### 1. Configure credentials

```bash
npx eas-cli credentials
```

Select **iOS**, then **production** profile. This will:
- Create/select a Distribution Certificate
- Create/select a Provisioning Profile (App Store distribution)
- Store credentials on EAS servers

### 2. Register the app with Apple

If not already done, EAS will prompt during the first build to register the bundle identifier (`com.eryknapierala.fasola`) with App Store Connect.

### 3. App Store Connect setup

Ensure the app exists in [App Store Connect](https://appstoreconnect.apple.com/):
- Create a new app with bundle ID `com.eryknapierala.fasola`
- Fill in required metadata (app name, primary language, etc.)
- Set up a test group under **TestFlight > External Testing** and add testers

## Building for TestFlight

### Submit a production build

```bash
npx eas-cli build --platform ios --profile production
```

This uses the `production` profile from `eas.json`, which auto-increments the build number.

### Submit to App Store Connect

After the build completes:

```bash
npx eas-cli submit --platform ios
```

Or combine build + submit in one step:

```bash
npx eas-cli build --platform ios --profile production --auto-submit
```

EAS will upload the build to App Store Connect automatically.

## After Submission

1. Go to [App Store Connect](https://appstoreconnect.apple.com/) > TestFlight
2. Wait for Apple's automated review (usually a few minutes)
3. Once processed, the build appears under the app's TestFlight tab
4. For **external testing**: add the build to a test group and submit for Beta App Review (first time only, subsequent builds of the same version are usually auto-approved)
5. Testers receive a notification via the TestFlight app

## Build Profiles

| Profile       | Distribution | Use case                          |
|---------------|-------------|-----------------------------------|
| `development` | internal    | Dev client, simulator builds      |
| `preview`     | internal    | Ad-hoc testing on physical devices|
| `production`  | store       | TestFlight / App Store            |

## Version Management

- App version source is set to `remote` (`eas.json` > `cli.appVersionSource`)
- Build numbers auto-increment for all profiles
- To bump the app version: `npx eas-cli build:version:set --platform ios`

## Troubleshooting

- **Credentials issues**: Run `npx eas-cli credentials` to inspect or regenerate certificates and profiles
- **Build failures**: Check the build logs on [expo.dev](https://expo.dev)
- **Missing compliance**: The app sets `ITSAppUsesNonExemptEncryption: false` in `app.json`, so no export compliance dialog should appear
