const {
  withEntitlementsPlist,
  withInfoPlist,
} = require("expo/config-plugins");

// TODO: Re-enable this plugin in app.json once you have a paid Apple Developer membership.
// Add this line back to the "plugins" array in app.json:
//   "./modules/icloud-sync/app.plugin.js"
const CONTAINER_ID = "iCloud.com.erykpiast.fasola";

function withICloudEntitlements(config) {
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.developer.icloud-container-identifiers"] = [
      CONTAINER_ID,
    ];
    config.modResults["com.apple.developer.ubiquity-container-identifiers"] = [
      CONTAINER_ID,
    ];
    config.modResults["com.apple.developer.icloud-services"] = [
      "CloudDocuments",
    ];
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.NSUbiquitousContainers = {
      [CONTAINER_ID]: {
        NSUbiquitousContainerIsDocumentScopePublic: true,
        NSUbiquitousContainerSupportedFolderLevels: "Any",
        NSUbiquitousContainerName: "fasola",
      },
    };
    return config;
  });

  return config;
}

module.exports = withICloudEntitlements;
