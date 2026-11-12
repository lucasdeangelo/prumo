// Signs release builds with the Prumo upload key when it is configured on the build machine.
// The key never lives in the repo: set these in ~/.gradle/gradle.properties (or as -P flags):
//   PRUMO_UPLOAD_STORE_FILE=C:/Users/me/.prumo/prumo-upload.jks
//   PRUMO_UPLOAD_STORE_PASSWORD=...
//   PRUMO_UPLOAD_KEY_ALIAS=prumo
//   PRUMO_UPLOAD_KEY_PASSWORD=...
// Without them, release builds keep Expo's default (debug key), so local builds still work.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "// prumo-release-signing";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARKER)) return cfg;

    gradle = gradle.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ${MARKER}
        if (project.hasProperty('PRUMO_UPLOAD_STORE_FILE')) {
            release {
                storeFile file(PRUMO_UPLOAD_STORE_FILE)
                storePassword PRUMO_UPLOAD_STORE_PASSWORD
                keyAlias PRUMO_UPLOAD_KEY_ALIAS
                keyPassword PRUMO_UPLOAD_KEY_PASSWORD
            }
        }`,
    );
    gradle = gradle.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig project.hasProperty('PRUMO_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
