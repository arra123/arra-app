const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`expo-widgets changed: missing ${label}`);
  return source.replace(from, to);
}

module.exports = function withDialogWidgets(config) {
  config = withDangerousMod(config, ['ios', async c => {
    const root = c.modRequest.projectRoot;
    const native = path.join(root, 'node_modules/expo-widgets/ios');
    fs.copyFileSync(path.join(root, 'plugins/native/ArraDialogWidgets.swift'), path.join(native, 'ArraDialogWidgets.swift'));
    const factoryPath = path.join(native, 'LiveActivityFactory.swift');
    let factory = replaceRequired(fs.readFileSync(factoryPath, 'utf8'),
      'func getInstances() throws -> [LiveActivity] {\n    guard #available(iOS 16.1, *)',
      'func getInstances() throws -> [LiveActivity] {\n    guard #available(iOS 16.2, *)', 'activity instance availability');
    factory = replaceRequired(factory,
      'return Activity<LiveActivityAttributes>.activities.map { activity in',
      'return Activity<LiveActivityAttributes>.activities.filter { $0.content.state.name == name && ($0.activityState == .active || $0.activityState == .stale) }.map { activity in', 'active activity instances');
    fs.writeFileSync(factoryPath, factory);
    const indexPath = path.join(c.modRequest.platformProjectRoot, 'ExpoWidgetsTarget/index.swift');
    let index = replaceRequired(fs.readFileSync(indexPath, 'utf8'), 'WidgetLiveActivity()', 'ArraLiveActivity()', 'native activity');
    if (!index.includes('ArraExtensionIntentsPackage')) index += '\nimport AppIntents\n@available(iOS 17.0, *)\nstruct ArraExtensionIntentsPackage: AppIntentsPackage {\n  static var includedPackages: [any AppIntentsPackage.Type] { [ArraWidgetsIntentsPackage.self] }\n}\n';
    fs.writeFileSync(indexPath, index);
    const widgetPath = path.join(c.modRequest.platformProjectRoot, 'ExpoWidgetsTarget/ArraAgents.swift');
    const widget = replaceRequired(fs.readFileSync(widgetPath, 'utf8'), 'WidgetsEntryView(entry: entry)', 'ArraWidgetEntryView(props: entry.props ?? [:])', 'native home widget');
    fs.writeFileSync(widgetPath, widget);
    fs.copyFileSync(path.join(root, 'plugins/native/ArraWidgetIntents.swift'), path.join(c.modRequest.platformProjectRoot, 'Arra/ArraWidgetIntents.swift'));
    return c;
  }]);
  return withXcodeProject(config, c => {
    const file = 'Arra/ArraWidgetIntents.swift';
    if (!c.modResults.hasFile(file)) {
      const group = c.modResults.findPBXGroupKey({ name: 'Arra' });
      if (!group) throw new Error('Arra source group is missing');
      c.modResults.addSourceFile(file, { target: c.modResults.getFirstTarget().uuid }, group);
    }
    return c;
  });
};
module.exports.replaceRequired = replaceRequired;
