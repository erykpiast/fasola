const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Adds the PageDewarp pod (git source) to the Podfile.
 *
 * The PageDewarp library is not on CocoaPods trunk, so it must be sourced
 * from GitHub. Expo's managed Podfile is generated at prebuild time, so
 * this plugin injects the pod declaration into it.
 */
function withPageDewarpPod(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );
      let podfile = fs.readFileSync(podfilePath, "utf8");

      const podLine = `  pod 'PageDewarp', :git => 'https://github.com/erykpiast/page-dewarp-swift.git', :commit => '097d9c0d4b3288a8a50658a55885314335e34056'`;

      if (!podfile.includes("PageDewarp")) {
        // Insert after use_expo_modules!
        podfile = podfile.replace(
          "use_expo_modules!",
          `use_expo_modules!\n${podLine}`
        );
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);
}

module.exports = withPageDewarpPod;
