const { withXcodeProject } = require("expo/config-plugins");

module.exports = function withAutoSigning(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key in buildConfigs) {
      const buildConfig = buildConfigs[key];
      if (
        typeof buildConfig === "object" &&
        buildConfig.buildSettings?.PRODUCT_NAME
      ) {
        buildConfig.buildSettings.CODE_SIGN_STYLE = "Automatic";
      }
    }
    return config;
  });
};
