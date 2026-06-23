import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { MerchantLogo } from '@/components/merchant-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

export type Debt = {
  id: string;
  counterparty: string;
  amount: string;
  direction: 'owes_me' | 'i_owe';
  note?: string | null;
  settled: boolean;
  due_date?: string | null;
  occurred_at?: string | null;
};

const fmt = (n: number) => n.toLocaleString('ru-RU');
const whenExact = (iso?: string | null) => {
  if (!iso) return 'дата не указана';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const dueLabel = (iso?: string | null) => {
  if (!iso) return 'бессрочно';
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  if (days < 0) return `просрочен · ${date}`;
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `до ${date}`;
};

export function DebtsModal({ visible, onClose, onChanged }: { visible: boolean; onClose: () => void; onChanged: () => void }) {
  const theme = useTheme();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [open, setOpen] = useState<string | null>(null); // раскрытый должник
  const [edit, setEdit] = useState<Debt | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ debts: Debt[] }>('/debts?all=true');
      setDebts(r.debts);
    } catch { /* тихо */ }
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const groups = useMemo(() => {
    const map = new Map<string, Debt[]>();
    for (const d of debts) {
      const k = d.counterparty || 'Без имени';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(d);
    }
    // активные группы вперёд
    return Array.from(map.entries())
      .map(([name, items]) => {
        const active = items.filter((i) => !i.settled);
        const net = active.reduce((s, i) => s + (i.direction === 'owes_me' ? 1 : -1) * Number(i.amount), 0);
        return { name, items, net, hasActive: active.length > 0 };
      })
      .sort((a, b) => Number(b.hasActive) - Number(a.hasActive));
  }, [debts]);

  const owedToMe = debts.filter((d) => !d.settled && d.direction === 'owes_me').reduce((s, d) => s + Number(d.amount), 0);
  const iOwe = debts.filter((d) => !d.settled && d.direction === 'i_owe').reduce((s, d) => s + Number(d.amount), 0);

  async function patch(id: string, body: any) {
    try { await api(`/debts/${id}`, { method: 'PATCH', body }); await load(); onChanged(); } catch (e: any) { Alert.alert('Не сохранилось', e?.message || ''); }
  }
  async function remove(id: string) {
    setEdit(null);
    try { await api(`/debts/${id}`, { method: 'DELETE' }); await load(); onChanged(); } catch (e: any) { Alert.alert('Не удалилось', e?.message || ''); }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <View style={styles.head}>
          <ThemedText style={styles.h1}>Долги</ThemedText>
          <View style={{ flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setEdit({ id: '', counterparty: '', amount: '', direction: 'owes_me', settled: false, due_date: null })} hitSlop={8}>
              <SymbolView name="plus.circle.fill" tintColor={theme.tint} size={28} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <SymbolView name="xmark.circle.fill" tintColor={theme.textSecondary} size={28} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={[styles.box, { borderColor: theme.separator }]}>
            <ThemedText type="small" themeColor="textSecondary">Тебе должны</ThemedText>
            <ThemedText style={[styles.boxVal, { color: theme.success }]}>+{fmt(owedToMe)} ₽</ThemedText>
          </View>
          <View style={[styles.box, { borderColor: theme.separator }]}>
            <ThemedText type="small" themeColor="textSecondary">Ты должен</ThemedText>
            <ThemedText style={[styles.boxVal, { color: theme.warning }]}>−{fmt(iOwe)} ₽</ThemedText>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six }}>
          {groups.length === 0 && (
            <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', marginTop: Spacing.five }}>
              Пока долгов нет. Скажи помощнику «дал Егору 500» или нажми ＋.
            </ThemedText>
          )}
          {groups.map((g) => {
            const expanded = open === g.name;
            const color = g.net > 0 ? theme.success : g.net < 0 ? theme.warning : theme.textSecondary;
            return (
              <View key={g.name} style={[styles.group, { borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}>
                <Pressable style={styles.groupHead} onPress={() => setOpen(expanded ? null : g.name)}>
                  <View style={[styles.avatar, { backgroundColor: g.net >= 0 ? theme.success : theme.warning }]}>
                    <ThemedText style={styles.avatarText}>{g.name[0]?.toUpperCase()}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold">{g.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {g.items.length} {g.items.length === 1 ? 'операция' : 'операций'}{!g.hasActive ? ' · всё закрыто' : ''}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" style={{ color }}>
                    {g.net > 0 ? '+' : g.net < 0 ? '−' : ''}{fmt(Math.abs(g.net))} ₽
                  </ThemedText>
                  <SymbolView name={expanded ? 'chevron.up' : 'chevron.down'} tintColor={theme.textSecondary} size={14} />
                </Pressable>

                {[...g.items].sort((a, b) => (b.occurred_at || '').localeCompare(a.occurred_at || '')).map((d) => expanded && (
                  <TouchableOpacity key={d.id} activeOpacity={0.7} onPress={() => setEdit(d)} style={[styles.item, { borderTopColor: theme.separator }]}>
                    <MerchantLogo merchant={d.counterparty} size={32} />
                    <View style={{ flex: 1, gap: 2 }}>
                      {/* название — белым, дата — приглушённым, статус — цветом */}
                      <ThemedText type="smallBold" numberOfLines={1} style={d.settled ? { textDecorationLine: 'line-through', color: theme.textSecondary } : undefined}>
                        {d.note?.trim() || (d.direction === 'owes_me' ? 'Должен мне' : 'Я должен')}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{whenExact(d.occurred_at)}</ThemedText>
                      <ThemedText type="small" style={{ color: d.settled ? theme.success : (d.due_date ? theme.warning : theme.textSecondary) }}>
                        {d.settled ? 'вернули ✓' : (d.due_date ? `срок ${dueLabel(d.due_date)}` : 'активный')}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={{ color: d.settled ? theme.textSecondary : d.direction === 'owes_me' ? theme.success : theme.warning }}>
                      {d.direction === 'owes_me' ? '+' : '−'}{fmt(Number(d.amount))} ₽
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })}
        </ScrollView>
      </ThemedView>

      <DebtEditor
        debt={edit}
        onClose={() => setEdit(null)}
        onSaved={async () => { setEdit(null); await load(); onChanged(); }}
        onToggleSettled={async (d) => { setEdit(null); await patch(d.id, { settled: !d.settled }); }}
        onDelete={remove}
      />
    </Modal>
  );
}

function DebtEditor({
  debt, onClose, onSaved, onToggleSettled, onDelete,
}: {
  debt: Debt | null;
  onClose: () => void;
  onSaved: () => void;
  onToggleSettled: (d: Debt) => void;
  onDelete: (id: string) => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'owes_me' | 'i_owe'>('owes_me');
  const [note, setNote] = useState('');
  const [due, setDue] = useState('');
  const [when, setWhen] = useState('');

  useEffect(() => {
    if (!debt) return;
    setName(debt.counterparty || '');
    setAmount(debt.amount ? String(Math.round(Number(debt.amount))) : '');
    setDirection(debt.direction);
    setNote(debt.note || '');
    setDue(debt.due_date ? debt.due_date.slice(0, 10) : '');
    setWhen(debt.occurred_at ? debt.occurred_at.slice(0, 10) : (debt.id ? '' : new Date().toISOString().slice(0, 10)));
  }, [debt]);

  async function save() {
    if (!debt) return;
    const amt = Number(amount.replace(',', '.'));
    if (!name.trim() || !amt) { Alert.alert('Заполни имя и сумму'); return; }
    const body = { counterparty: name.trim(), amount: amt, direction, note: note.trim() || null, due_date: due.trim() || '', occurred_at: when.trim() || undefined };
    try {
      if (debt.id) await api(`/debts/${debt.id}`, { method: 'PATCH', body });
      else await api('/debts', { body });
      onSaved();
    } catch (e: any) { Alert.alert('Не сохранилось', e?.message || ''); }
  }

  return (
    <Modal visible={!!debt} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <ThemedView style={{ flex: 1 }}>
        <View style={styles.head}>
          <TouchableOpacity onPress={onClose}><ThemedText style={{ color: theme.tint }}>Отмена</ThemedText></TouchableOpacity>
          <ThemedText type="smallBold">{debt?.id ? 'Долг' : 'Новый долг'}</ThemedText>
          <TouchableOpacity onPress={save}><ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Готово</ThemedText></TouchableOpacity>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: Spacing.three, gap: Spacing.three }}>
            {/* направление */}
            <View style={styles.seg}>
              <Pressable style={[styles.segBtn, direction === 'owes_me' && { backgroundColor: theme.success }]} onPress={() => setDirection('owes_me')}>
                <ThemedText type="smallBold" style={{ color: direction === 'owes_me' ? '#fff' : theme.textSecondary }}>Мне должны</ThemedText>
              </Pressable>
              <Pressable style={[styles.segBtn, direction === 'i_owe' && { backgroundColor: theme.warning }]} onPress={() => setDirection('i_owe')}>
                <ThemedText type="smallBold" style={{ color: direction === 'i_owe' ? '#fff' : theme.textSecondary }}>Я должен</ThemedText>
              </Pressable>
            </View>

            <Field label="Кто">
              <TextInput value={name} onChangeText={setName} placeholder="Имя или компания" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} />
            </Field>
            <Field label="Сумма, ₽">
              <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} />
            </Field>
            <Field label="Когда возник (ГГГГ-ММ-ДД)">
              <TextInput value={when} onChangeText={setWhen} placeholder="дата долга" placeholderTextColor={theme.textSecondary} autoCapitalize="none" style={[styles.input, { color: theme.text }]} />
            </Field>
            <Field label="Срок возврата (ГГГГ-ММ-ДД), пусто = бессрочно">
              <TextInput value={due} onChangeText={setDue} placeholder="бессрочно" placeholderTextColor={theme.textSecondary} autoCapitalize="none" style={[styles.input, { color: theme.text }]} />
            </Field>
            <Field label="Заметка">
              <TextInput value={note} onChangeText={setNote} placeholder="за что долг" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text }]} />
            </Field>

            {debt?.id ? (
              <>
                <TouchableOpacity onPress={() => debt && onToggleSettled(debt)} activeOpacity={0.85}>
                  <View style={[styles.bigBtn, { backgroundColor: debt?.settled ? theme.backgroundElement : theme.success }]}>
                    <SymbolView name={debt?.settled ? 'arrow.uturn.backward' : 'checkmark'} tintColor={debt?.settled ? theme.text : '#fff'} size={18} />
                    <ThemedText style={{ color: debt?.settled ? theme.text : '#fff', fontWeight: '700' }}>
                      {debt?.settled ? 'Вернуть в активные (не вернули)' : 'Долг вернули / закрыть'}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => debt && onDelete(debt.id)} activeOpacity={0.85}>
                  <View style={[styles.bigBtn, { backgroundColor: theme.backgroundElement }]}>
                    <SymbolView name="trash" tintColor={theme.danger} size={18} />
                    <ThemedText style={{ color: theme.danger, fontWeight: '700' }}>Удалить долг</ThemedText>
                  </View>
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <ThemedText type="small" themeColor="textSecondary" style={{ marginLeft: 4 }}>{label}</ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.two },
  h1: { fontSize: 30, fontWeight: '700', lineHeight: 36 },
  summary: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  box: { flex: 1, padding: Spacing.three, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  boxVal: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  group: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  avatar: { width: 38, height: 38, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three, paddingHorizontal: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.07)' },
  segBtn: { flex: 1, paddingVertical: Spacing.two, borderRadius: Radius.sm, alignItems: 'center' },
  input: { borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16, backgroundColor: 'rgba(255,255,255,0.07)' },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, height: 50, borderRadius: Radius.md },
});
