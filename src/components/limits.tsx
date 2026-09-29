import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { limitColor, limitLeft, resetLabel } from '@/ara/format';
import type { Limit, Limits } from '@/ara/types';
import { Appear } from '@/components/glass-menu';
import { Press, T } from '@/components/ui';
import { Colors, Radius, ScreenPadding } from '@/constants/theme';

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Тонкая мини-полоска остатка. */
function Bar({ left, width = 28 }: { left: number; width?: number }) {
  return (
    <View style={[styles.track, { width }]}>
      <View style={[styles.fill, { width: `${clamp(left)}%`, backgroundColor: limitColor(left, Colors.text) }]} />
    </View>
  );
}

/** «сессия 47% ▬» — сколько осталось. percent — израсходовано. */
function Meter({ label, percent, v = 'caption' }: { label: string; percent: number; v?: 'caption' | 'tiny' | 'footnote' }) {
  const left = limitLeft(percent);
  return (
    <View style={styles.meter}>
      <T v={v} color={limitColor(left)} numberOfLines={1}>
        {label} {Math.round(left)}%
      </T>
      <Bar left={left} />
    </View>
  );
}

function hasData(limit: Limit | null | undefined): limit is Limit {
  return !!limit && (limit.session != null || limit.week != null);
}

/** Сессия и неделя в одну строку; tiny — одним текстом без полосок (узкая шапка). */
function Meters({ limit, v }: { limit: Limit; v?: 'caption' | 'tiny' | 'footnote' }) {
  if (v === 'tiny') {
    const parts: [string, number][] = [];
    if (limit.session != null) parts.push(['сессия', limit.session]);
    if (limit.week != null) parts.push(['неделя', limit.week]);
    return (
      <T v="tiny" color={Colors.textSecondary} numberOfLines={1}>
        {parts.map(([label, pct], i) => (
          <T key={label} v="tiny" color={limitColor(limitLeft(pct))}>{i ? ' · ' : ''}{label} {Math.round(limitLeft(pct))}%</T>
        ))}
      </T>
    );
  }
  return (
    <View style={styles.meters}>
      {limit.session != null ? <Meter label="сессия" percent={limit.session} v={v} /> : null}
      {limit.week != null ? <Meter label="неделя" percent={limit.week} v={v} /> : null}
    </View>
  );
}

/** Лист с подробностями: когда сброс и чей аккаунт. */
function LimitSheet({ title, limit, onClose }: { title: string; limit: Limit | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const rows: [string, string][] = [];
  if (limit?.session != null) rows.push([`Сессия: осталось ${Math.round(limitLeft(limit.session))}%`, limit.sessionReset ? `обновится ${resetLabel(limit.sessionReset)}` : '']);
  if (limit?.week != null) rows.push([`Неделя: осталось ${Math.round(limitLeft(limit.week))}%`, limit.weekReset ? `обновится ${resetLabel(limit.weekReset)}` : '']);
  if (limit?.credit?.limit) {
    rows.push([`Облако $${Math.round(limit.credit.left)} из $${Math.round(limit.credit.limit)}`, limit.credit.reset ? `пополнится ${resetLabel(limit.credit.reset)}` : '']);
  }
  const account = [limit?.email, limit?.plan].filter(Boolean).join(' · ');
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Appear from={0} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: Colors.scrim }]} onPress={onClose} accessibilityLabel="Закрыть" />
      </Appear>
      <Appear from={12} duration={180} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <T v="headline" weight="700">{title}</T>
        {rows.map(([head, sub]) => (
          <View key={head} style={styles.sheetRow}>
            <T v="callout">{head}</T>
            {sub ? <T v="footnote" color={Colors.textSecondary}>{sub}</T> : null}
          </View>
        ))}
        {account ? <T v="footnote" color={Colors.textTertiary}>{account}</T> : null}
      </Appear>
    </Modal>
  );
}

/**
 * Кольцо с процентом: дуга заполняется по значению (две половинки,
 * каждая — круг с цветной верхней и правой границей, повёрнутый и обрезанный).
 */
export function Ring({ percent, size = 30, stroke = 3, color }: { percent: number; size?: number; stroke?: number; color: string }) {
  const deg = (clamp(percent) / 100) * 360;
  const right = Math.min(deg, 180);
  const left = Math.max(0, deg - 180);
  const half = size / 2;
  const arc = { width: size, height: size, borderRadius: half, borderWidth: stroke, position: 'absolute' as const, top: 0 };
  const colored = { borderTopColor: color, borderRightColor: color, borderBottomColor: 'transparent', borderLeftColor: 'transparent' };
  return (
    <View style={{ width: size, height: size }}>
      <View style={[arc, { left: 0, borderColor: Colors.separator }]} />
      {right > 0 ? (
        <View style={[styles.clip, { left: half, width: half, height: size }]}>
          <View style={[arc, colored, { left: -half, transform: [{ rotate: `${right - 135}deg` }] }]} />
        </View>
      ) : null}
      {left > 0 ? (
        <View style={[styles.clip, { left: 0, width: half, height: size }]}>
          <View style={[arc, colored, { left: 0, transform: [{ rotate: `${left + 45}deg` }] }]} />
        </View>
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.ringLabel]}>
        <T v="tiny" weight="700" color={Colors.text} maxFontSizeMultiplier={1} style={{ fontSize: size * 0.33, lineHeight: size * 0.4, fontVariant: ['tabular-nums'] }}>
          {Math.round(clamp(percent))}
        </T>
      </View>
    </View>
  );
}

/** Остаток недельного лимита одним кольцом с процентом (шапка агента); тап — подробности. */
export function WeekRing({ title, limit, size = 30 }: { title: string; limit: Limit | null; size?: number }) {
  const [open, setOpen] = useState(false);
  if (limit?.week == null) return null;
  const left = limitLeft(limit.week);
  return (
    <>
      <Press onPress={() => setOpen(true)} feedback="select" scaleTo={0.92} hitSlop={8} accessibilityLabel={`Недельный лимит ${title}: осталось ${Math.round(left)}%`}>
        <Ring percent={left} size={size} color={limitColor(left, Colors.text)} />
      </Press>
      {open ? <LimitSheet title={title} limit={limit} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Компактные лимиты в шапке; тап — подробности. */
export function LimitsInline({ title, limit, v = 'caption' }: { title: string; limit: Limit | null; v?: 'caption' | 'tiny' }) {
  const [open, setOpen] = useState(false);
  if (!hasData(limit)) return null;
  return (
    <>
      <Press onPress={() => setOpen(true)} feedback="select" scaleTo={0.98} hitSlop={6} accessibilityLabel={`Лимиты ${title}`} style={styles.inline}>
        <Meters limit={limit} v={v} />
      </Press>
      {open ? <LimitSheet title={title} limit={limit} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function LimitRow({ title, limit }: { title: string; limit: Limit }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Press onPress={() => setOpen(true)} feedback="select" scaleTo={0.99} style={styles.row} accessibilityLabel={`Лимиты ${title}`}>
        <T v="subhead" weight="600" style={styles.rowTitle} numberOfLines={1}>{title}</T>
        <View style={{ flex: 1, gap: 2 }}>
          <Meters limit={limit} v="footnote" />
          {limit.credit?.limit ? (
            <T v="tiny" color={Colors.textTertiary}>облако ${Math.round(limit.credit.left)} из ${Math.round(limit.credit.limit)}</T>
          ) : null}
        </View>
      </Press>
      {open ? <LimitSheet title={title} limit={limit} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Секция «Подписки» внизу главного экрана. */
export function LimitsSection({ limits }: { limits: Limits | null }) {
  if (!limits) return null;
  const rows: [string, Limit | null][] = [
    ['Claude', limits.claude],
    ['Codex ноутбук', limits.codex?.laptop],
    ['Codex ПК', limits.codex?.pc],
  ];
  const shown = rows.filter((r): r is [string, Limit] => hasData(r[1]));
  if (!shown.length) return null;
  return (
    <View style={styles.section}>
      <T v="caption" weight="600" color={Colors.textSecondary} style={styles.caps}>Подписки · осталось</T>
      {shown.map(([title, limit]) => <LimitRow key={title} title={title} limit={limit} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: Colors.separator, overflow: 'hidden' },
  fill: { height: 3, borderRadius: 2 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meters: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  inline: { alignSelf: 'flex-start' },
  section: { marginTop: 26, paddingHorizontal: ScreenPadding + 4, gap: 2 },
  caps: { textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
  rowTitle: { width: 118 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 12,
  },
  sheetRow: { gap: 1 },
});
