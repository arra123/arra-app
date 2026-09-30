// Web only (the «Arra — телефон» preview on a computer): SF Symbols do not
// exist in a browser, so every SymbolView was an empty circle. The same names
// are drawn with Material Symbols Rounded, loaded from Google Fonts once.
import { Text, type StyleProp, type TextStyle } from 'react-native';

const MAP: Record<string, string> = {
  'arrow.clockwise': 'refresh', 'arrow.triangle.2.circlepath': 'sync', 'arrow.turn.down.right': 'subdirectory_arrow_right',
  'arrow.up': 'arrow_upward', 'arrowshape.turn.up.left': 'reply', 'bell.badge': 'notifications_active', 'brain': 'psychology',
  'bubble.left': 'chat_bubble', 'character.cursor.ibeam': 'text_fields', 'chart.pie': 'pie_chart', 'checkmark': 'check',
  'checkmark.circle.fill': 'check_circle', 'chevron.down': 'expand_more', 'chevron.left': 'chevron_left', 'chevron.right': 'chevron_right',
  'circle': 'radio_button_unchecked', 'circle.inset.filled': 'radio_button_checked', 'desktopcomputer': 'desktop_windows',
  'doc.on.doc': 'content_copy', 'ellipsis': 'more_horiz', 'exclamationmark.bubble': 'feedback', 'exclamationmark.triangle': 'warning',
  'exclamationmark.triangle.fill': 'warning', 'folder.badge.plus': 'create_new_folder', 'gearshape': 'settings', 'globe': 'language',
  'laptopcomputer': 'laptop_mac', 'laptopcomputer.and.iphone': 'devices', 'line.3.horizontal': 'menu', 'magnifyingglass': 'search',
  'mic': 'mic', 'moon.zzz': 'bedtime', 'person.crop.circle': 'account_circle', 'photo.badge.arrow.down': 'download',
  'photo.on.rectangle': 'photo_library', 'pin.fill': 'push_pin', 'play.circle.fill': 'play_circle', 'play.fill': 'play_arrow',
  'plus': 'add', 'questionmark.bubble.fill': 'contact_support', 'rectangle.portrait.and.arrow.right': 'logout',
  'square.and.pencil': 'edit_square', 'stop.circle': 'stop_circle', 'stop.fill': 'stop', 'terminal': 'terminal', 'trash': 'delete',
  'waveform': 'graphic_eq', 'wifi.exclamationmark': 'wifi_off', 'xmark': 'close', 'xmark.circle': 'cancel', 'sparkles': 'auto_awesome',
  'testtube.2': 'science', 'apple.logo': 'nutrition', 'hand.wave': 'waving_hand', 'circle.circle': 'radio_button_checked', 'rectangle.stack': 'view_agenda',
  'cpu': 'memory', 'pin': 'push_pin', 'pin.slash': 'keep_off', 'camera': 'photo_camera', 'photo': 'image', 'paperclip': 'attach_file', 'square.and.arrow.up': 'ios_share',
};

let fontAdded = false;
function addFont() {
  if (fontAdded || typeof document === 'undefined') return;
  fontAdded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block';
  document.head.appendChild(link);
}

type Name = string | { ios?: string; android?: string; web?: string };

export function SymbolView({ name, size = 24, tintColor, weight, style }: {
  name: Name; size?: number; tintColor?: string; weight?: string; style?: StyleProp<TextStyle>; [k: string]: unknown;
}) {
  addFont();
  const sf = typeof name === 'string' ? name : name.web || name.ios || name.android || '';
  // an unknown name must not be printed as text (it showed «CPU» letter by
  // letter in a menu): a neutral dot instead
  const glyph = (typeof name === 'object' && name.web) || MAP[sf] || MAP[sf.replace(/\.fill$/, '')] || 'circle';
  const filled = /\.fill$/.test(sf) || sf.includes('.fill.');
  const heavy = weight === 'semibold' || weight === 'bold' || weight === 'heavy';
  return (
    <Text
      selectable={false}
      style={[{
        fontFamily: 'Material Symbols Rounded', fontSize: Math.round(size * 1.12), lineHeight: Math.round(size * 1.2),
        width: Math.round(size * 1.2), textAlign: 'center', color: tintColor ?? '#fff',
        // @ts-expect-error web-only CSS
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${heavy ? 600 : 400}`,
      }, style]}>
      {glyph}
    </Text>
  );
}

export default SymbolView;
