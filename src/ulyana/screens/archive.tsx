import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';

import { STK, UL } from '../assets';
import {
  cryMediaUrl, cryStats, deleteCry, deletePingMatch, listCries, listPingMatches,
  type Cry, type CryStats, type PingMatch,
} from '../api';
import { U, UG, UR, US } from '../theme';
import { Card, Gradient, MediaViewer, Sticker, T, tap } from '../ui';

type Tab = 'tears' | 'ping';

export function ArchiveScreen() {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const [tab, setTab] = useState<Tab>('tears');
  const [stats, setStats] = useState<CryStats | null>(null);
  const [cries, setCries] = useState<Cry[]>([]);
  const [matches, setMatches] = useState<PingMatch[]>([]);
  const [token, setTokenState] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewCry, setViewCry] = useState<Cry | null>(null);
  const [detail, setDetail] = useState<PingMatch | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c, m, t] = await Promise.all([cryStats(), listCries(), listPingMatches(), getToken()]);
      setStats(s); setCries(c); setMatches(m); setTokenState(t);
    } catch { /* молча */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function removeCry(id: string) {
    Alert.alert('Удалить запись?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => { tap(); await deleteCry(id); load(); } },
    ]);
  }
  function removeMatch(id: string) {
    Alert.alert('Удалить партию?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: async () => { tap(); await deletePingMatch(id); load(); } },
    ]);
  }

  return (
    <>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: US.md, paddingTop: insets.top + US.sm, paddingBottom: 140, gap: US.md }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={U.textDim} />}
      showsVerticalScrollIndicator={false}>

      {/* Шапка */}
      <View style={styles.header}>
        <T kind="h1">Архив</T>
        <Pressable onPress={() => { tap(); logout(); }} hitSlop={10} style={styles.logout}>
          <Sticker src={STK.wave} size={20} />
          <T kind="label" color={U.textDim}>выйти</T>
        </Pressable>
      </View>

      {/* Пожизненная статистика плача */}
      <Gradient g={UG.tearHero} radius={UR.xl} style={styles.statsHero}>
        <View style={styles.statsRow}>
          <Stat big value={`${stats?.liters ?? 0} л`} label="пролито слёз" />
          <Stat big value={`${stats?.total ?? 0}`} label="рыданий" />
        </View>
        <View style={styles.statsRow}>
          <Stat value={`${stats?.avg_intensity ?? 0}`} label="ср. сила" />
          <Stat value={`${Math.round(stats?.total_minutes ?? 0)}м`} label="всего ревел(а)" />
        </View>
        {stats?.top_reason ? (
          <View style={styles.topReason}>
            <Sticker src={STK.crystal} size={20} />
            <T kind="label" color="#1B1030">Чаще всего из-за: {stats.top_reason} (×{stats.top_reason_n})</T>
          </View>
        ) : null}
      </Gradient>

      {/* Переключатель */}
      <View style={styles.segment}>
        <SegBtn label="😭 Слёзы" active={tab === 'tears'} onPress={() => { tap(); setTab('tears'); }} />
        <SegBtn label="🏓 Партии" active={tab === 'ping'} onPress={() => { tap(); setTab('ping'); }} />
      </View>

      {tab === 'tears' ? (
        cries.length === 0 ? (
          <Empty icon={STK.smileTear} text="Пока ни одной слезинки. Сходи в Слёзометр." />
        ) : (
          cries.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => { if (c.has_media) { tap(); setViewCry(c); } }}
              onLongPress={() => removeCry(c.id)}>
              <Card>
                <View style={styles.cryTop}>
                  <Sticker src={scoreSticker(c.score)} size={40} />
                  <View style={{ flex: 1 }}>
                    <T kind="h3">{c.score}/100 · {c.reason ?? '—'}</T>
                    <T kind="tiny" color={U.textFaint}>{fmtDate(c.created_at)} · сила {c.intensity}/10</T>
                  </View>
                  {c.has_media && (
                    c.media_kind === 'image' && token ? (
                      <Image
                        source={{ uri: cryMediaUrl(c.id), headers: { Authorization: `Bearer ${token}` } }}
                        style={styles.thumb}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={styles.thumbIcon}>
                        <Sticker src={c.media_kind === 'audio' ? STK.sob : STK.tv} size={26} />
                      </View>
                    )
                  )}
                </View>
                {c.verdict ? <T kind="body" color={U.textDim} style={{ marginTop: US.sm }}>{c.verdict}</T> : null}
                {c.note ? <T kind="tiny" color={U.textFaint} style={{ marginTop: 4 }}>«{c.note}»</T> : null}
              </Card>
            </Pressable>
          ))
        )
      ) : (
        matches.length === 0 ? (
          <Empty icon={STK.pingpong} text="Партий пока нет. Сыграй и сохрани счёт." />
        ) : (
          matches.map((m) => {
            const aWon = m.winner === 'a';
            return (
              <Pressable
                key={m.id}
                onPress={() => { tap(); setDetail(m); }}
                onLongPress={() => removeMatch(m.id)}>
                <Card>
                  <View style={styles.matchRow}>
                    <Sticker src={STK.trophy} size={32} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.scoreLine}>
                        <T kind="h3" color={aWon ? U.pink : U.text}>{m.player_a}</T>
                        <T kind="h3" color={U.textDim}>{m.sets_a}:{m.sets_b}</T>
                        <T kind="h3" color={!aWon ? U.blue : U.text}>{m.player_b}</T>
                      </View>
                      <T kind="tiny" color={U.textFaint} style={{ marginTop: 2 }}>
                        {fmtDate(m.created_at)} · до {m.best_of} · {(m.sets || []).length} парт.
                      </T>
                      {(m.sets || []).length > 0 && (
                        <T kind="tiny" color={U.textDim} style={{ marginTop: 2 }}>
                          {(m.sets || []).map((s) => `${s.a}:${s.b}`).join('  ')}
                        </T>
                      )}
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          })
        )
      )}

      <T kind="tiny" color={U.textFaint} style={{ textAlign: 'center', marginTop: US.sm }}>
        тап — открыть · долгий тап — удалить
      </T>
    </ScrollView>

    {/* Просмотр медиа записи (фото с зумом / аудио) */}
    <MediaViewer
      visible={!!viewCry}
      onClose={() => setViewCry(null)}
      kind={viewCry?.media_kind ?? null}
      uri={viewCry ? cryMediaUrl(viewCry.id) : null}
      headers={token ? { Authorization: `Bearer ${token}` } : undefined}
    />

    {/* Разбор партии */}
    <MatchDetail match={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function MatchDetail({ match, onClose }: { match: PingMatch | null; onClose: () => void }) {
  if (!match) return null;
  const sets = match.sets || [];
  const aWon = match.winner === 'a';
  const winnerName = aWon ? match.player_a : match.player_b;
  const loserName = aWon ? match.player_b : match.player_a;
  // Простая «оценка» партии
  const tight = sets.filter((s) => Math.abs(s.a - s.b) <= 2).length;
  const blowout = sets.some((s) => Math.abs(s.a - s.b) >= 7);
  const verdict =
    tight >= Math.ceil(sets.length / 2) ? 'Зарубa до последнего мяча 🔥'
    : blowout ? 'Был разгром 😎'
    : 'Уверенная победа 💪';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Sticker src={STK.trophy} size={40} />
            <View style={{ flex: 1 }}>
              <T kind="h2">{winnerName} победил(а)</T>
              <T kind="tiny" color={U.textFaint}>над {loserName} · {fmtDate(match.created_at)}</T>
            </View>
          </View>

          <View style={styles.scoreBig}>
            <T kind="huge" color={aWon ? U.pink : U.textDim}>{match.sets_a}</T>
            <T kind="h1" color={U.textFaint}>:</T>
            <T kind="huge" color={!aWon ? U.blue : U.textDim}>{match.sets_b}</T>
          </View>
          <T kind="tiny" color={U.textFaint} style={{ textAlign: 'center', marginTop: -6 }}>
            {match.player_a}  ·  до {match.best_of} побед  ·  {match.player_b}
          </T>

          <View style={styles.divider} />
          <T kind="h3" style={{ marginBottom: US.sm }}>По партиям</T>
          {sets.length === 0 ? (
            <T kind="body" color={U.textFaint}>Нет данных по партиям.</T>
          ) : (
            sets.map((s, i) => {
              const aw = s.a > s.b;
              return (
                <View key={i} style={styles.setLine}>
                  <T kind="body" color={U.textDim} style={{ width: 70 }}>Партия {i + 1}</T>
                  <T kind="h3" color={aw ? U.pink : U.text} style={{ flex: 1, textAlign: 'right' }}>{s.a}</T>
                  <T kind="h3" color={U.textFaint} style={{ width: 24, textAlign: 'center' }}>:</T>
                  <T kind="h3" color={!aw ? U.blue : U.text} style={{ flex: 1 }}>{s.b}</T>
                </View>
              );
            })
          )}

          <View style={styles.verdictBox}>
            <Sticker src={STK.crystal} size={22} />
            <T kind="body" color={U.text} style={{ flex: 1, fontWeight: '700' }}>{verdict}</T>
          </View>

          <Pressable onPress={() => { tap(); onClose(); }} style={styles.sheetClose}>
            <T kind="label" color={U.textDim}>закрыть</T>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ value, label, big }: { value: string; label: string; big?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <T kind={big ? 'h1' : 'h2'} color="#1B1030">{value}</T>
      <T kind="tiny" color="#3A2257">{label}</T>
    </View>
  );
}

function SegBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {active ? (
        <Gradient g={UG.candy} radius={UR.pill} style={styles.segBtn}>
          <T kind="label" color="#fff">{label}</T>
        </Gradient>
      ) : (
        <View style={[styles.segBtn, { backgroundColor: U.card }]}>
          <T kind="label" color={U.textDim}>{label}</T>
        </View>
      )}
    </Pressable>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Sticker src={icon} size={64} />
      <T kind="body" color={U.textFaint} style={{ textAlign: 'center' }}>{text}</T>
    </View>
  );
}

function scoreSticker(score: number) {
  if (score < 15) return UL.calm;
  if (score < 35) return UL.almost;
  if (score < 55) return UL.cry1;
  if (score < 75) return UL.cry2;
  if (score < 90) return UL.sob;
  return UL.flood;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  statsHero: { padding: US.lg, gap: US.md },
  statsRow: { flexDirection: 'row', gap: US.sm },
  topReason: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: UR.pill, paddingHorizontal: 14, paddingVertical: 7 },
  segment: { flexDirection: 'row', gap: US.sm },
  segBtn: { paddingVertical: 12, alignItems: 'center', borderRadius: UR.pill },
  cryTop: { flexDirection: 'row', alignItems: 'center', gap: US.sm },
  thumb: { width: 52, height: 52, borderRadius: UR.sm },
  thumbIcon: { width: 52, height: 52, borderRadius: UR.sm, backgroundColor: U.card, alignItems: 'center', justifyContent: 'center' },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: US.sm },
  scoreLine: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  empty: { alignItems: 'center', gap: US.md, paddingVertical: US.xl },
  // Разбор партии (bottom sheet)
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: U.cardSolid,
    borderTopLeftRadius: UR.xl,
    borderTopRightRadius: UR.xl,
    padding: US.lg,
    paddingBottom: US.xl,
    gap: US.xs,
  },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: U.border, marginBottom: US.sm },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: US.sm },
  scoreBig: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: US.md, marginTop: US.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: U.border, marginVertical: US.md },
  setLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  verdictBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: US.md,
    backgroundColor: U.card, borderRadius: UR.md, padding: US.md,
  },
  sheetClose: { alignSelf: 'center', marginTop: US.md, padding: US.sm },
});
