const { withDangerousMod, withXcodeProject, withInfoPlist, withEntitlementsPlist } = require('expo/config-plugins');
const plist = require('@expo/plist');
const fs = require('node:fs');
const path = require('node:path');
const targetName = 'ArraNotifications';
const bundleIdentifier = 'com.arratima.aura.notifications';
const entitlement = 'com.apple.developer.usernotifications.communication';

module.exports = function withAgentNotifications(config) {
  config = withInfoPlist(config, c => {
    c.modResults.NSUserActivityTypes = [...new Set([...(c.modResults.NSUserActivityTypes || []), 'INSendMessageIntent'])];
    return c;
  });
  config = withEntitlementsPlist(config, c => { c.modResults[entitlement] = true; return c; });
  config.extra ||= {}; config.extra.eas ||= {}; config.extra.eas.build ||= {};
  config.extra.eas.build.experimental ||= {}; config.extra.eas.build.experimental.ios ||= {};
  const extensions = config.extra.eas.build.experimental.ios.appExtensions ||= [];
  if (!extensions.some(e => e.targetName === targetName)) extensions.push({ targetName, bundleIdentifier, entitlements: { [entitlement]: true } });
  config = withDangerousMod(config, ['ios', async c => {
    const dir = path.join(c.modRequest.platformProjectRoot, targetName);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(c.modRequest.projectRoot, 'plugins/native/NotificationService.swift'), path.join(dir, 'NotificationService.swift'));
    fs.writeFileSync(path.join(dir, 'Info.plist'), plist.default.build({
      CFBundleDisplayName: 'Arra Notifications', CFBundleExecutable: '$(EXECUTABLE_NAME)', CFBundleIdentifier: '$(PRODUCT_BUNDLE_IDENTIFIER)',
      CFBundleName: '$(PRODUCT_NAME)', CFBundlePackageType: 'XPC!', CFBundleShortVersionString: '$(MARKETING_VERSION)', CFBundleVersion: '$(CURRENT_PROJECT_VERSION)',
      NSUserActivityTypes: ['INSendMessageIntent'], NSExtension: { NSExtensionPointIdentifier: 'com.apple.usernotifications.service', NSExtensionPrincipalClass: '$(PRODUCT_MODULE_NAME).NotificationService' },
    }));
    fs.writeFileSync(path.join(dir, `${targetName}.entitlements`), plist.default.build({ [entitlement]: true }));
    for (const id of [0,3,4,5,6,8,11,12,13,14,15,16,19]) {
      const file = `dot-${String(id).padStart(2,'0')}.png`;
      fs.copyFileSync(path.join(c.modRequest.projectRoot, 'assets/mascots', file), path.join(dir, file));
    }
    return c;
  }]);
  return withXcodeProject(config, c => {
    const project = c.modResults;
    let target = Object.entries(project.pbxNativeTargetSection()).find(([key, value]) => !key.endsWith('_comment') && String(value.name).replaceAll('"','') === targetName);
    if (!target) {
      const added = project.addTarget(targetName, 'app_extension', targetName, bundleIdentifier);
      target = [added.uuid, added.pbxNativeTarget];
      project.addBuildPhase([`${targetName}/NotificationService.swift`], 'PBXSourcesBuildPhase', 'Sources', added.uuid);
      project.addBuildPhase([0,3,4,5,6,8,11,12,13,14,15,16,19].map(id=>`${targetName}/dot-${String(id).padStart(2,'0')}.png`), 'PBXResourcesBuildPhase', 'Resources', added.uuid);
    }
    const settings = project.pbxXCBuildConfigurationSection();
    for (const [key, value] of Object.entries(settings)) {
      if (key.endsWith('_comment') || !value.buildSettings || String(value.buildSettings.PRODUCT_NAME).replaceAll('"','') !== targetName) continue;
      Object.assign(value.buildSettings, {
        INFOPLIST_FILE: `${targetName}/Info.plist`, CODE_SIGN_ENTITLEMENTS: `${targetName}/${targetName}.entitlements`,
        IPHONEOS_DEPLOYMENT_TARGET: '16.4', SWIFT_VERSION: '5.0', TARGETED_DEVICE_FAMILY: '1',
        MARKETING_VERSION: config.version, CURRENT_PROJECT_VERSION: config.ios?.buildNumber || '1',
        APPLICATION_EXTENSION_API_ONLY: 'YES', GENERATE_INFOPLIST_FILE: 'NO',
        CLANG_ENABLE_MODULES: 'YES', CODE_SIGN_STYLE: 'Manual',
      });
    }
    return c;
  });
};
