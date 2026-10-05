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
    // AppIntentsPackage cannot register our actions through Expo's static pod.
    // Keep one source, compiled directly in both app and WidgetKit targets.
    fs.rmSync(path.join(native, 'ArraDialogWidgets.swift'), { force: true });
    for (const target of ['Arra', 'ExpoWidgetsTarget']) {
      for (const file of ['ArraDialogWidgets.swift', 'ArraWidgetIntents.swift']) {
        fs.copyFileSync(path.join(root, 'plugins/native', file), path.join(c.modRequest.platformProjectRoot, target, file));
      }
    }
    const attributesPath = path.join(native, 'Widgets/WidgetLiveActivity.swift');
    const attributes = replaceRequired(fs.readFileSync(attributesPath, 'utf8'),
      'struct LiveActivityAttributes: ActivityAttributes {\n  public struct ContentState: Codable, Hashable {\n    var name: String\n    var props: String\n  }\n}',
      'public struct LiveActivityAttributes: ActivityAttributes {\n  public init() {}\n  public struct ContentState: Codable, Hashable {\n    public var name: String\n    public var props: String\n    public init(name: String, props: String) { self.name = name; self.props = props }\n  }\n}', 'public ActivityKit attributes');
    fs.writeFileSync(attributesPath, attributes);
    const factoryPath = path.join(native, 'LiveActivityFactory.swift');
    let factory = replaceRequired(fs.readFileSync(factoryPath, 'utf8'),
      'func getInstances() throws -> [LiveActivity] {\n    guard #available(iOS 16.1, *)',
      'func getInstances() throws -> [LiveActivity] {\n    guard #available(iOS 16.2, *)', 'activity instance availability');
    factory = replaceRequired(factory,
      'return Activity<LiveActivityAttributes>.activities.map { activity in',
      'return Activity<LiveActivityAttributes>.activities.filter { $0.content.state.name == name && ($0.activityState == .active || $0.activityState == .stale) }.map { activity in', 'active activity instances');
    factory = replaceRequired(factory,
      '.map { activity in\n      LiveActivity(id: activity.id, name: name)\n    }',
      '.map { activity in\n      let instance = LiveActivity(id: activity.id, name: name)\n      instance.observePushTokenUpdates(for: activity, pushNotificationsEnabled: LiveActivityFactory.pushNotificationsEnabled)\n      return instance\n    }', 'restored activity token observer');
    fs.writeFileSync(factoryPath, factory);
    const indexPath = path.join(c.modRequest.platformProjectRoot, 'ExpoWidgetsTarget/index.swift');
    let index = replaceRequired(fs.readFileSync(indexPath, 'utf8'), 'WidgetLiveActivity()', 'ArraLiveActivity()', 'native activity');
    // Remove only our previous generated supplemental package.
    index = index.replace(/\nimport AppIntents\n@available\(iOS 17\.0, \*\)\nstruct ArraExtensionIntentsPackage: AppIntentsPackage \{\n  static var includedPackages: \[any AppIntentsPackage.Type\] \{ \[ArraWidgetsIntentsPackage.self\] \}\n\}\n?/g, '\n');
    fs.writeFileSync(indexPath, index);
    const widgetPath = path.join(c.modRequest.platformProjectRoot, 'ExpoWidgetsTarget/ArraAgents.swift');
    const widget = replaceRequired(fs.readFileSync(widgetPath, 'utf8'), 'WidgetsEntryView(entry: entry)', 'ArraWidgetEntryView(props: entry.props ?? [:])', 'native home widget');
    fs.writeFileSync(widgetPath, widget);
    return c;
  }]);
  return withXcodeProject(config, c => {
    registerNativeSources(c.modResults);
    return c;
  });
};
function registerNativeSources(project) {
  for (const name of ['Arra', 'ExpoWidgetsTarget']) {
    const target = project.findTargetKey(name);
    const group = project.findPBXGroupKey({ name }) || project.findPBXGroupKey({ path: name });
    if (!target || !group) throw new Error(`${name} native target/group is missing`);
    for (const filename of ['ArraDialogWidgets.swift', 'ArraWidgetIntents.swift']) {
      const file = `${name}/${filename}`;
      if (!project.hasFile(file)) project.addSourceFile(file, { target, sourceTree: 'SOURCE_ROOT' }, group);
      // Expo's extension group already has a path. Anchor these full paths at
      // the project root instead of resolving ExpoWidgetsTarget twice.
      const refs = project.hash.project.objects.PBXFileReference;
      for (const ref of Object.values(refs)) {
        if (ref.path?.replaceAll('"', '') === file) ref.sourceTree = 'SOURCE_ROOT';
      }
    }
  }
}
module.exports.replaceRequired = replaceRequired;
module.exports.registerNativeSources = registerNativeSources;
