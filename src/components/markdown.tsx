import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { memo, useMemo, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { parseMarkdown, plain, type Block, type Inline } from '@/ara/markdown';
import { Press, T } from '@/components/ui';
import { Colors, Fonts, Radius, Type } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

function openLink(href: string) {
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(href)) {
    Alert.alert('Сайт на компьютере', `${href}\n\nОн открыт на компьютере агента, с телефона напрямую недоступен.`, [
      { text: 'Скопировать', onPress: () => Clipboard.setStringAsync(href) },
      { text: 'OK', style: 'cancel' },
    ]);
    return;
  }
  // the real browser (Safari / the default one); the in-app sheet only if that fails
  if (/^https?:\/\//i.test(href)) Linking.openURL(href).catch(() => WebBrowser.openBrowserAsync(href).catch(() => {}));
  else Clipboard.setStringAsync(href).then(() => haptic.success());
}

function renderInline(nodes: Inline[], keyPrefix = ''): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}${i}`;
    switch (node.t) {
      case 'text':
        return node.v;
      case 'code':
        return <Text key={key} style={styles.inlineCode}>{node.v}</Text>;
      case 'b':
        return <Text key={key} style={styles.bold}>{renderInline(node.c, key)}</Text>;
      case 'i':
        return <Text key={key} style={styles.italic}>{renderInline(node.c, key)}</Text>;
      case 's':
        return <Text key={key} style={styles.strike}>{renderInline(node.c, key)}</Text>;
      case 'link':
        return (
          <Text key={key} style={styles.link} onPress={() => openLink(node.href)} suppressHighlighting={false}>
            {renderInline(node.c, key)}
          </Text>
        );
      default:
        return null;
    }
  });
}

function CodeBlock({ lang, value }: { lang: string; value: string }) {
  return (
    <View style={styles.code}>
      <View style={styles.codeHeader}>
        <T v="caption" color={Colors.textTertiary}>{lang || 'код'}</T>
        <Press
          feedback="none"
          accessibilityLabel="Скопировать код"
          hitSlop={10}
          onPress={() => Clipboard.setStringAsync(value).then(() => haptic.success())}>
          <SymbolView name="doc.on.doc" size={14} tintColor={Colors.textSecondary} />
        </Press>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeScroll}>
        <Text selectable style={styles.codeText} maxFontSizeMultiplier={1.4}>{value}</Text>
      </ScrollView>
    </View>
  );
}

function Table({ block }: { block: Extract<Block, { t: 'table' }> }) {
  const widths = useMemo(() => block.head.map((cell, ci) => {
    const longest = Math.max(plain(cell).length, ...block.rows.map((row) => Math.min(plain(row[ci] || []).length, 60)));
    return Math.max(72, Math.min(260, longest * 7.4 + 20));
  }), [block]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
      <View style={styles.table}>
        {[block.head, ...block.rows].map((row, ri) => (
          <View key={ri} style={[styles.tableRow, ri === 0 && styles.tableHead, ri > 0 && styles.tableRowBorder]}>
            {row.map((cell, ci) => (
              <View key={ci} style={[styles.tableCell, { width: widths[ci] }, ci > 0 && styles.tableCellBorder]}>
                <T
                  v={ri === 0 ? 'caption' : 'subhead'}
                  color={ri === 0 ? Colors.textSecondary : Colors.text}
                  weight={ri === 0 ? '600' : undefined}
                  style={{ textAlign: block.align[ci] }}
                  selectable>
                  {renderInline(cell)}
                </T>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Blocks({ blocks, depth = 0 }: { blocks: Block[]; depth?: number }) {
  return (
    <>
      {blocks.map((block, i) => {
        const first = i === 0;
        switch (block.t) {
          case 'p':
            return <T key={i} selectable style={!first && styles.gap}>{renderInline(block.c)}</T>;
          case 'h':
            return (
              <T key={i} v={block.level <= 1 ? 'title' : block.level === 2 ? 'headline' : 'body'} weight="700" style={!first && styles.headingGap}>
                {renderInline(block.c)}
              </T>
            );
          case 'code':
            return <View key={i} style={!first && styles.gap}><CodeBlock lang={block.lang} value={block.v} /></View>;
          case 'hr':
            return <View key={i} style={styles.hr} />;
          case 'quote':
            return (
              <View key={i} style={[styles.quote, !first && styles.gap]}>
                <Blocks blocks={block.c} depth={depth} />
              </View>
            );
          case 'table':
            return <View key={i} style={!first && styles.gap}><Table block={block} /></View>;
          case 'list':
            return (
              <View key={i} style={[!first && (depth ? styles.smallGap : styles.gap)]}>
                {block.items.map((item, ii) => (
                  <View key={ii} style={[styles.listItem, ii > 0 && styles.listGap]}>
                    <View style={styles.bullet}>
                      {item.checked !== undefined ? (
                        <SymbolView
                          name={item.checked ? 'checkmark.square.fill' : 'square'}
                          size={16}
                          tintColor={item.checked ? Colors.success : Colors.textSecondary}
                        />
                      ) : (
                        <T color={Colors.textSecondary} style={block.ordered ? styles.number : undefined}>
                          {block.ordered ? `${block.start + ii}.` : depth % 2 ? '◦' : '•'}
                        </T>
                      )}
                    </View>
                    <View style={styles.listBody}>
                      <T selectable style={item.checked && styles.done}>{renderInline(item.c)}</T>
                      {item.children.length ? <Blocks blocks={item.children} depth={depth + 1} /> : null}
                    </View>
                  </View>
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

/** Ответ агента / Arra в Markdown. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <View>{<Blocks blocks={blocks} />}</View>;
});

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  smallGap: { marginTop: 4 },
  headingGap: { marginTop: 16 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through', color: Colors.textSecondary },
  link: { color: Colors.link },
  done: { color: Colors.textSecondary },
  inlineCode: {
    fontFamily: Fonts.mono,
    fontSize: Type.subhead - 1,
    backgroundColor: Colors.inlineCode,
    color: Colors.text,
  },
  code: {
    backgroundColor: Colors.codeBackground,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  codeScroll: { paddingHorizontal: 12, paddingVertical: 10 },
  codeText: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 19, color: '#d7d9e0' },
  hr: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.hairline, marginVertical: 14 },
  quote: { borderLeftWidth: 3, borderLeftColor: Colors.hairline, paddingLeft: 12 },
  listItem: { flexDirection: 'row' },
  listGap: { marginTop: 5 },
  bullet: { width: 22, alignItems: 'flex-start', paddingTop: 1 },
  number: { fontVariant: ['tabular-nums'] },
  listBody: { flex: 1 },
  tableScroll: { marginHorizontal: -2 },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  tableRow: { flexDirection: 'row' },
  tableHead: { backgroundColor: 'rgba(255,255,255,0.05)' },
  tableRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.hairline },
  tableCell: { paddingHorizontal: 10, paddingVertical: 8 },
  tableCellBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: Colors.hairline },
});
