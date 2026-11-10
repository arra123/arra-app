const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function withMascotWidgetAssets(config) {
  config = withDangerousMod(config, ['ios', async (c) => {
    const source = path.join(c.modRequest.projectRoot, 'assets/mascots');
    const catalog = path.join(c.modRequest.platformProjectRoot, 'ExpoWidgetsTarget/Mascots.xcassets');
    fs.mkdirSync(catalog, { recursive: true });
    fs.writeFileSync(path.join(catalog, 'Contents.json'), JSON.stringify({ info: { version: 1, author: 'xcode' } }));
    for (const id of [0,3,4,5,6,8,11,12,13,14,15,16,19]) {
      const name = `dot-${String(id).padStart(2, '0')}.png`;
      const folder = path.join(catalog, `mascot-${id}.imageset`);
      fs.mkdirSync(folder, { recursive: true });
      fs.copyFileSync(path.join(source, name), path.join(folder, name));
      fs.writeFileSync(path.join(folder, 'Contents.json'), JSON.stringify({
        images: [{ idiom: 'universal', filename: name }], info: { version: 1, author: 'xcode' },
      }));
    }
    return c;
  }]);
  return withXcodeProject(config, (c) => {
    const project = c.modResults;
    const target = Object.entries(project.pbxNativeTargetSection()).find(([key, value]) =>
      !key.endsWith('_comment') && String(value.name).replaceAll('"', '') === 'ExpoWidgetsTarget');
    if (!target) throw new Error('ExpoWidgetsTarget is missing; put mascot plugin before expo-widgets');
    const resource = 'ExpoWidgetsTarget/Mascots.xcassets';
    if (!project.hasFile(resource)) project.addBuildPhase([resource], 'PBXResourcesBuildPhase', 'Resources', target[0]);
    return c;
  });
};
