import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STK } from '../assets';
import { listPingMatches, savePingMatch, type PingMatch } from '../api';
import { U, UG, UR, US } from '../theme';
import { celebrate, Gradient, Sticker, T, pop, tap, yay } from '../ui';

type Side = 'a' | 'b';
type State = {
  a: number; // очки в текущем сете
  b: number;
  setsA: number;
  setsB: number;
  sets: { a: number; b: number }[]; // завершённые сеты
  serveStart: Side; // кто подавал первым в текущем сете
  winner: Side | null;
};

const fresh = (serveStart: Side = 'a'): State => ({
  a: 0, b: 0, setsA: 0, setsB: 0, sets: [], serveStart, winner: null,
});

// Кто подаёт сейчас: смена каждые 2 очка, при 10:10 — каждое очко
function server(s: State): Side {
  const total = s.a + s.b;
  const rotations = s.a >= 10 && s.b >= 10 ? 10 + (total - 20) : Math.floor(total / 2);
  const startIsA = s.serveStart === 'a';
  const aServes = rotations % 2 === 0 ? startIsA : !startIsA;
  return aServes ? 'a' : 'b';
}

const wonSet = (x: number, y: number) => x >= 11 && x - y >= 2;

export function PingPongScreen() {
  const insets = useSafeAreaInsets();
  const [nameA, setNameA] = useState('Я');
  const [nameB, setNameB] = useState('Соперник');
  const [target, setTarget] = useState(12); // матч до N побеждённых партий
  const [st, setSt] = useState<State>(fresh());
  const [hist, setHist] = useState<State[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [matches, setMatches] = useState<PingMatch[]>([]);

  const loadHistory = useCallback(async () => {
    try { setMatches(await listPingMatches()); } catch { /* молча */ }
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const setsToWin = target;
  const matchStarted = st.sets.length > 0 || st.a > 0 || st.b > 0;

  function push(next: State) {
    setHist((h) => [...h.slice(-50), st]);
    setSt(next);
  }

  function addPoint(side: Side) {
    if (st.winner) return;
    pop();
    const next: State = { ...st };
    if (side === 'a') next.a += 1; else next.b += 1;

    if (wonSet(next.a, next.b) || wonSet(next.b, next.a)) {
      const aWon = next.a > next.b;
      next.sets = [...next.sets, { a: next.a, b: next.b }];
      if (aWon) next.setsA += 1; else next.setsB += 1;
      if (next.setsA >= setsToWin || next.setsB >= setsToWin) {
        next.winner = next.setsA > next.setsB ? 'a' : 'b';
        celebrate();
      } else {
        yay();
        // новый сет: счёт обнуляется, первый подающий меняется
        next.a = 0;
        next.b = 0;
        next.serveStart = st.serveStart === 'a' ? 'b' : 'a';
      }
    }
    push(next);
  }

  function undo() {
    if (!hist.length) return;
    tap();
    setSt(hist[hist.length - 1]);
    setHist((h) => h.slice(0, -1));
  }

  function resetMatch() {
    Alert.alert('Новый матч?', 'Текущий счёт обнулится.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Сброс', style: 'destructive', onPress: () => { tap(); setSt(fresh()); setHist([]); setSaved(false); } },
    ]);
  }

  async function save() {
    if (!st.winner || saved) return;
    setSaving(true);
    try {
      await savePingMatch({
        player_a: nameA, player_b: nameB,
        sets_a: st.setsA, sets_b: st.setsB,
        sets: st.sets, winner: st.winner, best_of: target,
      });
      setSaved(true);
      yay();
      loadHistory();
    } catch (e: any) {
      Alert.alert('Не сохранилось', e?.message || '');
    } finally {
      setSaving(false);
    }
  }

  const srv = server(st);
  const winnerName = st.winner === 'a' ? nameA : nameB;

  return (
    <View style={{ flex: 1, paddingTop: insets.top + US.sm }}>
      {/* Верхняя плашка: цель матча (до N побеждённых партий) */}
      <View style={styles.topBar}>
        <Sticker src={STK.pingpong} size={30} />
        <T kind="h3" color={U.text} style={{ flex: 1 }}>Матч до {target} побед</T>
        <Pressable
          onPress={() => { if (matchStarted || target <= 1) return; tap(); setTarget((n) => n - 1); }}
          hitSlop={8}
          style={[styles.tgtBtn, (matchStarted || target <= 1) && { opacity: 0.35 }]}>
          <T kind="h3" color={U.text}>−</T>
        </Pressable>
        <T kind="h2" color={U.pink} style={{ minWidth: 34, textAlign: 'center' }}>{target}</T>
        <Pressable
          onPress={() => { if (matchStarted || target >= 21) return; tap(); setTarget((n) => n + 1); }}
          hitSlop={8}
          style={[styles.tgtBtn, (matchStarted || target >= 21) && { opacity: 0.35 }]}>
          <T kind="h3" color={U.text}>+</T>
        </Pressable>
      </View>

      {/* Две зоны-тапа */}
      <View style={styles.zones}>
        <PlayerZone
          g={UG.pingA} name={nameA} onName={setNameA} score={st.a} sets={st.setsA}
          serving={srv === 'a' && !st.winner} onTap={() => addPoint('a')}
        />
        <PlayerZone
          g={UG.pingB} name={nameB} onName={setNameB} score={st.b} sets={st.setsB}
          serving={srv === 'b' && !st.winner} onTap={() => addPoint('b')}
        />
      </View>

      {/* Завершённые сеты */}
      {st.sets.length > 0 && (
        <View style={styles.setsRow}>
          {st.sets.map((s, i) => (
            <View key={i} style={styles.setChip}>
              <T kind="tiny" color={s.a > s.b ? U.pink : U.textDim}>{s.a}</T>
              <T kind="tiny" color={U.textFaint}>:</T>
              <T kind="tiny" color={s.b > s.a ? U.blue : U.textDim}>{s.b}</T>
            </View>
          ))}
        </View>
      )}

      {/* Победа */}
      {st.winner && (
        <Gradient g={UG.sun} radius={UR.lg} style={styles.winBanner}>
          <Sticker src={STK.trophy} size={48} />
          <View style={{ flex: 1 }}>
            <T kind="h2" color="#1B1030">🎉 Поздравляем!</T>
            <T kind="body" color="#3A2257" style={{ fontWeight: '700' }}>
              {winnerName} — победа {st.setsA}:{st.setsB} за {st.sets.length} парт.
            </T>
          </View>
          {!saved ? (
            <Pressable onPress={save} disabled={saving}>
              <View style={styles.saveBtn}><T kind="label" color="#fff">{saving ? '…' : 'В архив'}</T></View>
            </Pressable>
          ) : (
            <T kind="label" color="#1B1030">✓ сохранено</T>
          )}
        </Gradient>
      )}

      {/* Нижняя панель управления */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 90 }]}>
        <CtrlBtn label="Отменить" icon={STK.droplet} onPress={undo} dim={!hist.length} />
        <CtrlBtn label="История" icon={STK.scroll} onPress={() => { tap(); setShowHistory(true); }} />
        <CtrlBtn label="Новый матч" icon={STK.fire} onPress={resetMatch} />
      </View>

      <HistoryModal visible={showHistory} matches={matches} onClose={() => setShowHistory(false)} />
    </View>
  );
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function HistoryModal({ visible, matches, onClose }: { visible: boolean; matches: PingMatch[]; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.histBackdrop} onPress={onClose}>
        <Pressable style={[styles.histSheet, { paddingBottom: insets.bottom + US.md }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.histHandle} />
          <View style={styles.histHead}>
            <Sticker src={STK.trophy} size={28} />
            <T kind="h2" style={{ flex: 1 }}>История партий</T>
            <Pressable onPress={() => { tap(); onClose(); }} hitSlop={10}>
              <T kind="label" color={U.textDim}>закрыть</T>
            </Pressable>
          </View>
          {matches.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: US.xl, gap: US.sm }}>
              <Sticker src={STK.pingpong} size={56} />
              <T kind="body" color={U.textFaint}>Пока нет сыгранных партий.</T>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {matches.map((m) => {
                const aWon = m.winner === 'a';
                return (
                  <View key={m.id} style={styles.histRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.histScore}>
                        <T kind="h3" color={aWon ? U.pink : U.text}>{m.player_a}</T>
                        <T kind="h3" color={U.textDim}>{m.sets_a}:{m.sets_b}</T>
                        <T kind="h3" color={!aWon ? U.blue : U.text}>{m.player_b}</T>
                      </View>
                      <T kind="tiny" color={U.textFaint} style={{ marginTop: 2 }}>
                        {fmtDate(m.created_at)} · до {m.best_of}
                      </T>
                      {(m.sets || []).length > 0 && (
                        <T kind="tiny" color={U.textDim} style={{ marginTop: 2 }}>
                          {(m.sets || []).map((s) => `${s.a}:${s.b}`).join('  ')}
                        </T>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PlayerZone({
  g, name, onName, score, sets, serving, onTap,
}: {
  g: string; name: string; onName: (s: string) => void; score: number; sets: number; serving: boolean; onTap: () => void;
}) {
  return (
    <Pressable onPress={onTap} style={{ flex: 1 }}>
      <Gradient g={g} radius={UR.lg} style={styles.zone}>
        <View style={styles.zoneTop}>
          <TextInput
            value={name}
            onChangeText={onName}
            style={styles.zoneName}
            maxLength={14}
            selectTextOnFocus
          />
          {serving && <Sticker src={STK.pingpong} size={26} />}
        </View>
        <T kind="huge" color="#fff" style={styles.bigScore}>{score}</T>
        <View style={styles.pips}>
          {Array.from({ length: Math.max(sets, 0) }).map((_, i) => (
            <View key={i} style={styles.pip} />
          ))}
          <T kind="label" color="rgba(255,255,255,0.85)">{sets} парт.</T>
        </View>
        <T kind="tiny" color="rgba(255,255,255,0.7)">тапни, чтобы +1</T>
      </Gradient>
    </Pressable>
  );
}

function CtrlBtn({ label, icon, onPress, dim }: { label: string; icon: string; onPress: () => void; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1, opacity: dim ? 0.4 : pressed ? 0.8 : 1 }]}>
      <View style={styles.ctrl}>
        <Sticker src={icon} size={22} />
        <T kind="label" color={U.text}>{label}</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: US.md, paddingBottom: US.sm },
  tgtBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: U.card, borderColor: U.border, borderWidth: StyleSheet.hairlineWidth,
  },
  zones: { flex: 1, flexDirection: 'row', gap: US.sm, paddingHorizontal: US.md },
  zone: { flex: 1, padding: US.md, alignItems: 'center', justifyContent: 'space-between' },
  zoneTop: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 34 },
  zoneName: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', minWidth: 80 },
  bigScore: { fontSize: 110, lineHeight: 118 },
  pips: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  pip: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff' },
  setsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', paddingHorizontal: US.md, paddingTop: US.sm },
  setChip: { flexDirection: 'row', gap: 3, backgroundColor: U.card, borderRadius: UR.pill, paddingHorizontal: 10, paddingVertical: 5 },
  winBanner: { flexDirection: 'row', alignItems: 'center', gap: US.sm, marginHorizontal: US.md, marginTop: US.sm, padding: US.md },
  saveBtn: { backgroundColor: U.pink, borderRadius: UR.pill, paddingHorizontal: 16, paddingVertical: 8 },
  controls: { flexDirection: 'row', gap: US.sm, paddingHorizontal: US.md, paddingTop: US.md },
  ctrl: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: U.card, borderColor: U.border, borderWidth: StyleSheet.hairlineWidth,
    borderRadius: UR.md, paddingVertical: US.md,
  },
  histBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  histSheet: {
    backgroundColor: U.cardSolid,
    borderTopLeftRadius: UR.xl, borderTopRightRadius: UR.xl,
    padding: US.lg, gap: US.sm,
  },
  histHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: U.border, marginBottom: US.xs },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: US.sm, marginBottom: US.xs },
  histRow: { paddingVertical: US.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: U.border },
  histScore: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
});
