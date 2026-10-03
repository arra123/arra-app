const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`expo-widgets changed: missing ${label}`);
  return source.replace(from, to);
}

module.exports = function withDialogWidgets(config) {
  return withDangerousMod(config, ['ios', async c => {
    const root = c.modRequest.projectRoot;
    const native = path.join(root, 'node_modules/expo-widgets/ios');
    fs.copyFileSync(path.join(root, 'plugins/native/ArraDialogWidgets.swift'), path.join(native, 'ArraDialogWidgets.swift'));
    const indexPath = path.join(c.modRequest.platformProjectRoot, 'ExpoWidgetsTarget/index.swift');
    fs.writeFileSync(indexPath, replaceRequired(fs.readFileSync(indexPath, 'utf8'), 'WidgetLiveActivity()', 'ArraLiveActivity()', 'native activity'));
    const widgetPath = path.join(c.modRequest.platformProjectRoot, 'ExpoWidgetsTarget/ArraAgents.swift');
    const widget = replaceRequired(fs.readFileSync(widgetPath, 'utf8'), 'WidgetsEntryView(entry: entry)', 'ArraWidgetEntryView(props: entry.props ?? [:])', 'native home widget');
    fs.writeFileSync(widgetPath, widget);
    return c;
  }]);
};
module.exports.replaceRequired = replaceRequired;
