import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppleSegmented } from '@/components/apple-segmented';
import { FabMenu } from '@/components/fab-menu';
import { GlassCard } from '@/components/glass-card';
import { MerchantLogo } from '@/components/merchant-logo';
import { Sheet, useSheetScroll } from '@/components/sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { APP_BUILD, BottomTabInset, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { loadLastCarService, saveLastCarService } from '@/lib/prefs';
import { onQuickAction, takeQuickAction } from '@/lib/quick-action';
import { updateQuickWidget } from '@/widgets/quick-widget';

type Debt = {
  id: string;
  counterparty: string;
  amount: string;
  direction: 'owes_me' | 'i_owe';
  settled: boolean;
  note?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
};
type ViewKind = 'period' | 'summary' | 'people';
type SpanKind = 'all' | 'month' | 'week' | 'year';
type SummaryCategoryId = 'carsharing' | 'online' | 'purchases' | 'other';

type SummaryMeta = {
  id: SummaryCategoryId;
  title: string;
  systemImage: string;
  fallback: string;
  tint: string;
};

type SummaryService = {
  name: string;
  items: Debt[];
  total: number;
};

type SummaryGroup = SummaryMeta & {
  services: SummaryService[];
  total: number;
  count: number;
};

/** Период — необязательный фильтр. По умолчанию всегда «Всё»: экран
 *  открывается на всей истории, которую можно листать, как в банке. */
const spans: { id: SpanKind; label: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'month', label: 'Месяц' },
  { id: 'week', label: 'Неделя' },
  { id: 'year', label: 'Год' },
];

const people = ['Тима', 'Даня', 'Женя'] as const;
const cars = ['Ситидрайв', 'Делимобиль', 'BelkaCar', 'Яндекс Драйв'] as const;
/** Частые назначения — чтобы не набирать руками каждый раз. */
const purposes = ['Каршеринг', 'Такси', 'Еда', 'Продукты', 'Подписка', 'Дом', 'Заправка'] as const;

const money = (n: number) => `${n.toLocaleString('ru-RU', {
  minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  maximumFractionDigits: 2,
})} ₽`;
const parseAmount = (value: string) => Number(value.replace(',', '.'));
const recipient = (d: Debt) => d.note?.match(/\[(Тима|Даня|Женя)\]/)?.[1] || 'Тима';
/** Голосовой ввод слышит «Ozon» как «зон» — приводим к нормальному виду,
 *  иначе и текст странный, и логотип магазина не подхватывается. */
const normalizeText = (value: string) => value
  .replace(/(^|[\s(])зон(?=$|[\s).,])/giu, '$1Ozon')
  .replace(/(^|[\s(])zone(?=$|[\s).,])/giu, '$1Ozon')
  .replace(/пополнение баланса озон/giu, 'Пополнение баланса Ozon');
const normalizeCounterparty = (value: string) => {
  const normalized = normalizeText(value).trim();
  if (/^(belka\s*car|белка\s*кар|белкакар)$/i.test(normalized)) return 'BelkaCar';
  return normalized;
};
const cleanNote = (d: Debt) => normalizeText((d.note || '').replace(/\[(Тима|Даня|Женя)\]\s*/g, '')).trim();
const summaryText = (d: Debt) => normalizeText(`${d.counterparty || ''} ${cleanNote(d)}`).toLowerCase();
const SUMMARY_META: Record<SummaryCategoryId, SummaryMeta> = {
  carsharing: {
    id: 'carsharing',
    title: 'Каршеринг',
    systemImage: 'car.2.fill',
    fallback: '▰',
    tint: '#4F78C8',
  },
  online: {
    id: 'online',
    title: 'Онлайн-сервисы',
    systemImage: 'network',
    fallback: '⌘',
    tint: '#6966B3',
  },
  purchases: {
    id: 'purchases',
    title: 'Покупки и материалы',
    systemImage: 'shippingbox.fill',
    fallback: '□',
    tint: '#B2763D',
  },
  other: {
    id: 'other',
    title: 'Остальное',
    systemImage: 'ellipsis',
    fallback: '•••',
    tint: '#747983',
  },
};
const SUMMARY_ORDER: SummaryCategoryId[] = ['carsharing', 'online', 'purchases', 'other'];
const carsharingPattern = /каршер|ситидрайв|city\s*drive|belka|белка|делимоб|яндекс[.\s-]*драйв/i;
const onlinePattern = /openai|chatgpt|chat gpt|claude|anthropic|proxy\s*api|proxyapi|muapi|hexfield|github|figma|notion|adobe|jetbrains|подписк|хостинг|сервер|домен|облач/i;
const purchasePattern = /ozon|озон|wildberries|вайлдбер|покуп|товар|материал|ингредиент|печат|фото|скотч|бад|витамин|курьер|достав/i;
const categoryOf = (d: Debt): SummaryCategoryId => {
  const text = summaryText(d);
  if (carsharingPattern.test(text)) return 'carsharing';
  if (onlinePattern.test(text)) return 'online';
  if (purchasePattern.test(text)) return 'purchases';
  return 'other';
};
const serviceOf = (d: Debt, category: SummaryCategoryId) => {
  const text = summaryText(d);
  if (category === 'carsharing') {
    if (/ситидрайв|city\s*drive/i.test(text)) return 'Ситидрайв';
    if (/belka|белка/i.test(text)) return 'BelkaCar';
    if (/делимоб/i.test(text)) return 'Делимобиль';
    if (/яндекс[.\s-]*драйв/i.test(text)) return 'Яндекс Драйв';
    return 'Другой каршеринг';
  }
  if (category === 'online') {
    if (/openai|chatgpt|chat gpt/i.test(text)) return 'OpenAI';
    if (/claude|anthropic/i.test(text)) return 'Anthropic';
    if (/proxy\s*api|proxyapi/i.test(text)) return 'Proxy API';
    if (/muapi/i.test(text)) return 'MuAPI';
    if (/hexfield/i.test(text)) return 'Hexfield';
  }
  const counterparty = normalizeCounterparty(d.counterparty || '');
  if (counterparty && !/компан/i.test(counterparty)) return counterparty;
  return cleanNote(d) || SUMMARY_META[category].title;
};
const dateOf = (d: Debt) => new Date(d.occurred_at || d.created_at || Date.now());
const timeOf = (d: Debt) => dateOf(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const startOfDay = (date: Date) => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const startOfWeek = (date: Date) => { const d = startOfDay(date); d.setDate(d.getDate() - ((d.getDay() || 7) - 1)); return d; };
const spanStart = (span: SpanKind) => {
  const now = new Date();
  if (span === 'week') return startOfWeek(now);
  if (span === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (span === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
};
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
const dativePerson = (person: string) => ({ Тима: 'Тиме', Даня: 'Дане', Женя: 'Жене' }[person] || person);
const dayTitle = (value: number) => {
  const date = startOfDay(new Date(value));
  const diff = Math.round((startOfDay(new Date()).getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
};

/** SF Symbols есть только на устройстве — в вебе показываем знак-заменитель. */
function Glyph({ name, fallback, color, size = 16 }: { name: string; fallback: string; color: string; size?: number }) {
  if (Platform.OS === 'web') return <ThemedText style={{ color, fontSize: size + 2, lineHeight: size + 6 }}>{fallback}</ThemedText>;
  return <SymbolView name={name as never} tintColor={color} size={size} />;
}

export default function FinanceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [mine, setMine] = useState<Debt[]>([]);
  const [view, setView] = useState<ViewKind>('period');
  const [span, setSpan] = useState<SpanKind>('all');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [expandedServices, setExpandedServices] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [edit, setEdit] = useState<Debt | 'new' | null>(null);
  const [carOpen, setCarOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api<{ debts: Debt[] }>('/debts?all=true');
      const all = r.debts || [];
      // Нулевая операция не является долгом и только засоряет ленту.
      setDebts(all.filter((d) => d.direction !== 'i_owe' && Number(d.amount) > 0));
      setMine(all.filter((d) => d.direction === 'i_owe' && !d.settled && Number(d.amount) > 0));
    } catch (e: any) { Alert.alert('Не загрузилось', e?.message || ''); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Быстрое действие из виджета: открываем форму каршеринга сразу.
  useEffect(() => {
    if (takeQuickAction('car')) setCarOpen(true);
    return onQuickAction((action) => { if (action === 'car') setCarOpen(true); });
  }, []);

  // Лента — вся история: и открытые записи, и уже закрытые. Фильтр периода
  // применяется только если его выбрали руками.
  const inSpan = useMemo(() => {
    const from = spanStart(span);
    return from ? debts.filter((d) => dateOf(d).getTime() >= from.getTime()) : debts;
  }, [debts, span]);
  const unpaid = useMemo(() => inSpan.filter((d) => !d.settled), [inSpan]);
  const feed = useMemo(() => [...inSpan].sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime()), [inSpan]);
  const total = unpaid.reduce((s, d) => s + Number(d.amount), 0);
  const closed = useMemo(() => inSpan.filter((d) => d.settled), [inSpan]);

  // Держим виджет в актуальном состоянии — он читает только то, что ему передали.
  useEffect(() => {
    updateQuickWidget({ total, count: unpaid.length });
  }, [total, unpaid.length]);
  const oldest = unpaid.length ? new Date(Math.min(...unpaid.map((d) => dateOf(d).getTime()))) : null;

  // Сверху активные записи, ниже — уже закрытые. Обе части сгруппированы по дням.
  const byDays = (list: Debt[]) => {
    const map = new Map<number, Debt[]>();
    for (const d of list) {
      const key = startOfDay(dateOf(d)).getTime();
      map.set(key, [...(map.get(key) || []), d]);
    }
    return [...map.entries()];
  };
  const days = useMemo(() => byDays(feed.filter((d) => !d.settled)), [feed]);
  const closedDays = useMemo(() => byDays(feed.filter((d) => d.settled)), [feed]);

  const byCounterparty = useMemo(() => {
    const map = new Map<string, Debt[]>();
    for (const d of unpaid) {
      const key = normalizeCounterparty(d.counterparty || '') || 'Без имени';
      map.set(key, [...(map.get(key) || []), d]);
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime()),
        total: items.reduce((s, d) => s + Number(d.amount), 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [unpaid]);

  const summaryGroups = useMemo<SummaryGroup[]>(() => {
    const categories = new Map<SummaryCategoryId, Map<string, Debt[]>>();
    for (const debt of unpaid) {
      const category = categoryOf(debt);
      const service = serviceOf(debt, category);
      const services = categories.get(category) || new Map<string, Debt[]>();
      services.set(service, [...(services.get(service) || []), debt]);
      categories.set(category, services);
    }

    return SUMMARY_ORDER.flatMap((category) => {
      const services = categories.get(category);
      if (!services) return [];
      const groupedServices = [...services.entries()]
        .map(([name, items]) => ({
          name,
          items: [...items].sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime()),
          total: items.reduce((sum, debt) => sum + Number(debt.amount), 0),
        }))
        .sort((a, b) => b.total - a.total);
      return [{
        ...SUMMARY_META[category],
        services: groupedServices,
        total: groupedServices.reduce((sum, service) => sum + service.total, 0),
        count: groupedServices.reduce((sum, service) => sum + service.items.length, 0),
      }];
    });
  }, [unpaid]);

  const toggleCategory = (category: string) => {
    haptic.select();
    setExpandedCategories((current) => ({ ...current, [category]: !current[category] }));
  };

  const toggleService = (service: string) => {
    haptic.select();
    setExpandedServices((current) => ({ ...current, [service]: !current[service] }));
  };

  // Оптимистично: сначала меняем список, потом сеть. Иначе экран «моргает».
  async function settle(d: Debt) {
    haptic.success();
    setDebts((current) => current.map((item) => item.id === d.id ? { ...item, settled: !item.settled } : item));
    try { await api(`/debts/${d.id}`, { method: 'PATCH', body: { settled: !d.settled } }); }
    catch (e: any) { Alert.alert('Не сохранилось', e?.message || ''); await load(); }
  }

  async function remove(d: Debt) {
    haptic.warning();
    setDebts((current) => current.filter((item) => item.id !== d.id));
    setMine((current) => current.filter((item) => item.id !== d.id));
    try { await api(`/debts/${d.id}`, { method: 'DELETE' }); }
    catch (e: any) { Alert.alert('Не удалилось', e?.message || ''); await load(); }
  }

  const row = (d: Debt) => {
    const purpose = cleanNote(d);
    const counterparty = normalizeCounterparty(d.counterparty || '');
    const named = !!counterparty && !/компан/i.test(counterparty);
    const title = named ? counterparty : (purpose || 'Без названия');
    const who = recipient(d);
    const relation = d.direction === 'i_owe' ? 'я должен' : `вернуть ${dativePerson(who)}`;
    return (
      <Pressable
        key={d.id}
        onPress={() => { haptic.tap(); setEdit(d); }}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.glass },
          d.settled && styles.settled,
        ]}>
        <MerchantLogo merchant={`${counterparty} ${d.note || ''}`} size={38} />
        <View style={styles.rowText}>
          <ThemedText type="smallBold" numberOfLines={1}>{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {[purpose, relation, timeOf(d)].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={d.settled ? { color: theme.textSecondary, textDecorationLine: 'line-through' } : undefined}>
          {money(Number(d.amount))}
        </ThemedText>
        <Pressable
          onPress={() => settle(d)}
          hitSlop={10}
          accessibilityLabel={d.settled ? 'Вернуть в долги' : 'Уже вернули'}
          style={({ pressed }) => [
            styles.rowCheck,
            {
              borderColor: d.settled ? theme.success : theme.separator,
              backgroundColor: d.settled ? theme.success : 'transparent',
              opacity: pressed ? 0.6 : 1,
            },
          ]}>
          <Glyph name="checkmark" fallback="✓" color={d.settled ? '#fff' : theme.separator} size={14} />
        </Pressable>
      </Pressable>
    );
  };

  const summaryDebtRow = (d: Debt) => {
    const when = dateOf(d);
    const note = cleanNote(d);
    const detail = /^каршеринг$/i.test(note) ? '' : note;
    return (
      <Pressable
        key={d.id}
        onPress={() => { haptic.tap(); setEdit(d); }}
        style={({ pressed }) => [
          styles.summaryDebtRow,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.glass },
        ]}>
        <View style={[styles.summaryTimelineDot, { backgroundColor: theme.separator }]} />
        <View style={styles.rowText}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {when.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} · {timeOf(d)}
          </ThemedText>
          {!!detail && <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{detail}</ThemedText>}
        </View>
        <ThemedText type="smallBold">{money(Number(d.amount))}</ThemedText>
        <Pressable
          onPress={() => settle(d)}
          hitSlop={10}
          accessibilityLabel="Уже вернули"
          style={({ pressed }) => [
            styles.summaryRowCheck,
            {
              borderColor: theme.separator,
              backgroundColor: 'transparent',
              opacity: pressed ? 0.55 : 1,
            },
          ]}>
          <Glyph name="checkmark" fallback="✓" color={theme.separator} size={12} />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.two }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.textSecondary} />}
        showsVerticalScrollIndicator={false}>

        <ThemedText style={styles.title} numberOfLines={1}>Финансы</ThemedText>

        <GlassCard radius={Radius.lg} style={styles.summary}>
          <ThemedText style={styles.total}>{money(total)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {unpaid.length
              ? `не вернули · ${unpaid.length} ${plural(unpaid.length, 'запись', 'записи', 'записей')}${oldest ? ` · с ${oldest.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}` : ''}`
              : 'Все долги закрыты'}
          </ThemedText>
        </GlassCard>

        <AppleSegmented
          values={['Лента', 'Сводка', 'Кто должен']}
          selectedIndex={view === 'period' ? 0 : view === 'summary' ? 1 : 2}
          onChange={(index) => setView(index === 0 ? 'period' : index === 1 ? 'summary' : 'people')}
        />

        {/* Период — необязательный: «Всё» стоит всегда, пока не выберешь другое. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.spanRow}>
          {spans.map((item) => {
            const on = span === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => { haptic.select(); setSpan(item.id); }}
                style={[styles.spanChip, {
                  borderColor: on ? theme.tint : theme.separator,
                  backgroundColor: on ? theme.tint : theme.backgroundElement,
                }]}>
                <ThemedText type="small" style={{ color: on ? '#fff' : theme.text, fontWeight: '600' }}>{item.label}</ThemedText>
              </Pressable>
            );
          })}
          <View style={styles.spanNote}>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {span === 'all'
                ? `вся история · ${feed.length} ${plural(feed.length, 'запись', 'записи', 'записей')}`
                : `${feed.length} ${plural(feed.length, 'запись', 'записи', 'записей')} за период`}
            </ThemedText>
          </View>
        </ScrollView>

        {loading ? <ActivityIndicator style={{ marginTop: 60 }} color={theme.tint} /> : view === 'summary' ? (
          <>
            {summaryGroups.length === 0 ? (
              <View style={styles.empty}><ThemedText themeColor="textSecondary">Все долги закрыты</ThemedText></View>
            ) : summaryGroups.map((category) => {
              const categoryOpen = !!expandedCategories[category.id];
              return (
                <Animated.View
                  key={category.id}
                  style={styles.group}
                  entering={FadeIn.duration(160)}
                  layout={LinearTransition.duration(220)}>
                  <GlassCard radius={Radius.lg} style={styles.summaryGroupCard}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: categoryOpen }}
                      accessibilityLabel={`${category.title}, ${money(category.total)}`}
                      onPress={() => toggleCategory(category.id)}
                      style={({ pressed }) => [
                        styles.summaryCategoryRow,
                        { backgroundColor: pressed ? theme.backgroundSelected : theme.glass },
                      ]}>
                      <View style={[styles.summaryCategoryIcon, { backgroundColor: category.tint }]}>
                        <Glyph name={category.systemImage} fallback={category.fallback} color="#fff" size={19} />
                      </View>
                      <View style={styles.rowText}>
                        <ThemedText type="smallBold" numberOfLines={1}>{category.title}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {category.services.length} {plural(category.services.length, 'сервис', 'сервиса', 'сервисов')} · {category.count} {plural(category.count, 'запись', 'записи', 'записей')}
                        </ThemedText>
                      </View>
                      <ThemedText type="smallBold">{money(category.total)}</ThemedText>
                      <View style={[styles.summaryChevron, categoryOpen && styles.summaryChevronOpen]}>
                        <Glyph name="chevron.right" fallback="›" color={theme.textSecondary} size={14} />
                      </View>
                    </Pressable>

                    {categoryOpen && (
                      <Animated.View entering={FadeIn.duration(150)} layout={LinearTransition.duration(220)}>
                        {category.services.map((service) => {
                          const serviceKey = `${category.id}:${service.name}`;
                          const serviceOpen = !!expandedServices[serviceKey];
                          return (
                            <Animated.View key={serviceKey} layout={LinearTransition.duration(200)}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ expanded: serviceOpen }}
                                accessibilityLabel={`${service.name}, ${money(service.total)}`}
                                onPress={() => toggleService(serviceKey)}
                                style={({ pressed }) => [
                                  styles.summaryServiceRow,
                                  {
                                    borderTopColor: theme.separator,
                                    backgroundColor: pressed ? theme.backgroundSelected : theme.glass,
                                  },
                                ]}>
                                {/* Только имя сервиса. С добавленным названием
                                    категории в строке оказывалось несколько
                                    брендов сразу, и логотипы рисовались стопкой. */}
                                <MerchantLogo merchant={service.name} size={34} />
                                <View style={styles.rowText}>
                                  <ThemedText type="smallBold" numberOfLines={1}>{service.name}</ThemedText>
                                  <ThemedText type="small" themeColor="textSecondary">
                                    {service.items.length} {plural(service.items.length, 'запись', 'записи', 'записей')}
                                  </ThemedText>
                                </View>
                                <ThemedText type="smallBold">{money(service.total)}</ThemedText>
                                <View style={[styles.summaryChevron, serviceOpen && styles.summaryChevronOpen]}>
                                  <Glyph name="chevron.right" fallback="›" color={theme.textSecondary} size={13} />
                                </View>
                              </Pressable>
                              {serviceOpen && (
                                <Animated.View
                                  entering={FadeIn.duration(140)}
                                  layout={LinearTransition.duration(200)}
                                  style={[styles.summaryDebtList, { borderTopColor: theme.separator }]}>
                                  {service.items.map(summaryDebtRow)}
                                </Animated.View>
                              )}
                            </Animated.View>
                          );
                        })}
                      </Animated.View>
                    )}
                  </GlassCard>
                </Animated.View>
              );
            })}
          </>
        ) : view === 'people' ? (
          <>
            {byCounterparty.length === 0 && mine.length === 0 ? (
              <View style={styles.empty}><ThemedText themeColor="textSecondary">Все долги закрыты</ThemedText></View>
            ) : byCounterparty.map((group) => (
              <GlassCard key={group.name} radius={Radius.lg} style={styles.list}>
                <View style={styles.personHead}>
                  <MerchantLogo merchant={`${group.name} ${cleanNote(group.items[0])}`} size={40} />
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold" numberOfLines={1}>{group.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{group.items.length} {plural(group.items.length, 'запись', 'записи', 'записей')}</ThemedText>
                  </View>
                  <ThemedText type="smallBold">{money(group.total)}</ThemedText>
                </View>
                {group.items.map(row)}
              </GlassCard>
            ))}
            {mine.length > 0 && (
              <View style={styles.group}>
                <ThemedText type="smallBold" style={styles.groupHead}>Я должен · {money(mine.reduce((s, d) => s + Number(d.amount), 0))}</ThemedText>
                <GlassCard radius={Radius.lg} style={styles.list}>{mine.map(row)}</GlassCard>
              </View>
            )}
          </>
        ) : days.length === 0 && closedDays.length === 0 ? (
          <View style={styles.empty}>
            <Glyph name="tray" fallback="—" color={theme.textSecondary} size={28} />
            <ThemedText themeColor="textSecondary">{span === 'all' ? 'Записей пока нет' : 'За этот период записей нет'}</ThemedText>
          </View>
        ) : (
          <>
            {days.length > 0 && (
              <ThemedText type="smallBold" style={styles.sectionHead}>
                Ждут возврата · {money(total)}
              </ThemedText>
            )}
            {days.map(([key, items]) => (
              <Animated.View
                key={key}
                style={styles.group}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(140)}
                layout={LinearTransition.duration(220)}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.groupHead}>
                  {dayTitle(key)} · {money(items.reduce((s, d) => s + Number(d.amount), 0))}
                </ThemedText>
                <GlassCard radius={Radius.lg} style={styles.list}>{items.map(row)}</GlassCard>
              </Animated.View>
            ))}

            {/* Закрытые записи никуда не исчезают — просто уходят вниз и гаснут. */}
            {closedDays.length > 0 && (
              <>
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionHead}>
                  Уже вернули · {money(closed.reduce((s, d) => s + Number(d.amount), 0))}
                </ThemedText>
                {closedDays.map(([key, items]) => (
                  <Animated.View
                    key={`closed-${key}`}
                    style={[styles.group, styles.closedGroup]}
                    entering={FadeIn.duration(180)}
                    layout={LinearTransition.duration(220)}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.groupHead}>
                      {dayTitle(key)} · {money(items.reduce((s, d) => s + Number(d.amount), 0))}
                    </ThemedText>
                    <GlassCard radius={Radius.lg} style={styles.list}>{items.map(row)}</GlassCard>
                  </Animated.View>
                ))}
              </>
            )}
          </>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.version}>v{APP_BUILD}</ThemedText>
      </ScrollView>

      <FabMenu
        label="Добавить запись"
        actions={[
          { id: 'car', label: 'Каршеринг', systemImage: 'car.fill', tint: '#34C759', onPress: () => setCarOpen(true) },
          { id: 'new', label: 'Новая запись', systemImage: 'square.and.pencil', onPress: () => setEdit('new') },
        ]}
      />

      <CarSheet visible={carOpen} onClose={() => setCarOpen(false)} onSaved={async () => { setCarOpen(false); await load(); }} />
      <DebtEditor
        key={edit === 'new' ? 'new' : edit?.id || 'closed'}
        debt={edit}
        onClose={() => setEdit(null)}
        onSaved={async () => { setEdit(null); await load(); }}
        onSettle={(d) => { setEdit(null); void settle(d); }}
        onDelete={(d) => { setEdit(null); void remove(d); }}
      />
    </ThemedView>
  );
}

/** Быстрый каршеринг: выбрал сервис, вписал сумму — остальное подставится само. */
function CarSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();
  const [picked, setPicked] = useState<string>(cars[0]);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  // Последний сервис запоминается — обычно ездят на одном и том же.
  useEffect(() => {
    if (!visible) return;
    setAmount('');
    loadLastCarService().then((last) => {
      const normalized = normalizeCounterparty(last || '');
      if (normalized && cars.includes(normalized as (typeof cars)[number])) setPicked(normalized);
    });
  }, [visible]);

  async function save() {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) { haptic.error(); Alert.alert('Впиши сумму'); return; }
    setSaving(true);
    try {
      await api('/debts', {
        method: 'POST',
        body: { counterparty: picked, note: '[Тима] Каршеринг', amount: parsedAmount, direction: 'owes_me', occurred_at: new Date().toISOString() },
      });
      await saveLastCarService(picked);
      haptic.success();
      setAmount('');
      onSaved();
    } catch (e: any) { haptic.error(); Alert.alert('Не сохранилось', e?.message || ''); }
    finally { setSaving(false); }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Каршеринг"
      rightLabel={saving ? 'Пишу…' : 'Записать'}
      onRight={save}
      rightDisabled={saving || !parseAmount(amount)}>
      <View style={styles.sheetBody}>
        <View style={styles.carGrid}>
          {cars.map((car) => {
            const on = picked === car;
            return (
              <Pressable
                key={car}
                onPress={() => { haptic.select(); setPicked(car); }}
                style={[styles.carTile, {
                  borderColor: on ? theme.tint : theme.separator,
                  backgroundColor: on ? theme.backgroundSelected : theme.backgroundElement,
                }]}>
                <MerchantLogo merchant={car} size={34} />
                <ThemedText type="small" numberOfLines={1} style={{ flex: 1 }}>{car}</ThemedText>
                {on && <Glyph name="checkmark.circle.fill" fallback="✓" color={theme.tint} size={17} />}
              </Pressable>
            );
          })}
        </View>
        <AmountField value={amount} onChange={setAmount} autoFocus />
      </View>
    </Sheet>
  );
}

function DebtEditor({
  debt,
  onClose,
  onSaved,
  onSettle,
  onDelete,
}: {
  debt: Debt | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
  onSettle: (d: Debt) => void;
  onDelete: (d: Debt) => void;
}) {
  const theme = useTheme();
  const sheetScroll = useSheetScroll();
  const item = debt && debt !== 'new' ? debt : null;
  const [counterparty, setCounterparty] = useState(item?.counterparty && !/компан/i.test(item.counterparty) ? item.counterparty : '');
  const [note, setNote] = useState(item ? cleanNote(item) : '');
  const [amount, setAmount] = useState(item?.amount ? String(Number(item.amount)).replace('.', ',') : '');
  const [person, setPerson] = useState<string>(item ? recipient(item) : 'Тима');
  const [when, setWhen] = useState<Date>(() => (item ? dateOf(item) : new Date()));
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsedAmount = parseAmount(amount);
    if (!parsedAmount) { haptic.error(); Alert.alert('Впиши сумму'); return; }
    setSaving(true);
    const body = {
      counterparty: counterparty.trim() || note.trim() || 'Компания',
      amount: parsedAmount,
      direction: item?.direction || 'owes_me',
      note: `[${person}] ${note.trim()}`.trim(),
      occurred_at: when.toISOString(),
    };
    try {
      await api(item ? `/debts/${item.id}` : '/debts', { method: item ? 'PATCH' : 'POST', body });
      haptic.success();
      onSaved();
    } catch (e: any) { haptic.error(); Alert.alert('Не сохранилось', e?.message || ''); }
    finally { setSaving(false); }
  }

  return (
    <Sheet
      visible={!!debt}
      onClose={onClose}
      title={item ? 'Запись' : 'Новая запись'}
      rightLabel={saving ? 'Пишу…' : 'Сохранить'}
      onRight={save}
      rightDisabled={saving || !parseAmount(amount)}>
      <ScrollView
        {...sheetScroll}
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetBody}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>

        <AmountField value={amount} onChange={setAmount} autoFocus={!item} />

        <Field label="Сервис или человек">
          <TextInput
            value={counterparty}
            onChangeText={setCounterparty}
            placeholder="Ситидрайв, Пятёрочка, Женя…"
            placeholderTextColor={theme.textSecondary}
            maxFontSizeMultiplier={1.18}
            style={[styles.input, { color: theme.text, borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}
          />
        </Field>

        <Field label="За что">
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Каршеринг"
            placeholderTextColor={theme.textSecondary}
            maxFontSizeMultiplier={1.18}
            style={[styles.input, { color: theme.text, borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
            {purposes.map((value) => {
              const on = note.trim().toLowerCase() === value.toLowerCase();
              return (
                <Pressable
                  key={value}
                  onPress={() => { haptic.select(); setNote(on ? '' : value); }}
                  style={[styles.chip, {
                    borderColor: on ? theme.tint : theme.separator,
                    backgroundColor: on ? theme.tint : theme.backgroundElement,
                  }]}>
                  <ThemedText type="small" style={{ color: on ? '#fff' : theme.text, fontWeight: '600' }}>{value}</ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        <Field label="Кому вернуть">
          <AppleSegmented
            values={[...people]}
            selectedIndex={Math.max(0, people.indexOf(person as (typeof people)[number]))}
            onChange={(index) => { haptic.select(); setPerson(people[index]); }}
          />
        </Field>

        <View style={[styles.dateRow, { borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">Когда</ThemedText>
          <DateTimePicker
            value={when}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            locale="ru-RU"
            themeVariant="light"
            accentColor={theme.tint}
            onChange={(_, next) => { if (next) setWhen(next); }}
          />
        </View>

        {item && (
          <View style={styles.editorActions}>
            <Pressable
              onPress={() => onSettle(item)}
              style={({ pressed }) => [styles.editorAction, {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.separator,
                opacity: pressed ? 0.7 : 1,
              }]}>
              <Glyph name={item.settled ? 'arrow.uturn.backward' : 'checkmark.circle.fill'} fallback="✓" color={item.settled ? theme.warning : theme.success} size={18} />
              <ThemedText type="smallBold" style={{ color: item.settled ? theme.warning : theme.success }}>
                {item.settled ? 'Вернуть в долги' : 'Уже вернули'}
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={() => Alert.alert('Удалить запись?', '', [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: () => onDelete(item) },
              ])}
              style={({ pressed }) => [styles.editorAction, {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.separator,
                opacity: pressed ? 0.7 : 1,
              }]}>
              <Glyph name="trash.fill" fallback="✕" color={theme.danger} size={17} />
              <ThemedText type="smallBold" style={{ color: theme.danger }}>Удалить</ThemedText>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

/** Крупное поле суммы — главный элемент формы. */
function AmountField({ value, onChange, autoFocus = false }: { value: string; onChange: (next: string) => void; autoFocus?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.amountBox, { borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}>
      <TextInput
        value={value}
        onChangeText={(text) => {
          const normalized = text.replace('.', ',').replace(/[^0-9,]/g, '');
          const [rubles, ...fractionParts] = normalized.split(',');
          const fraction = fractionParts.join('').slice(0, 2);
          onChange(fractionParts.length ? `${rubles},${fraction}` : rubles);
        }}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
        placeholder="0"
        placeholderTextColor={theme.separator}
        maxFontSizeMultiplier={1.1}
        style={[styles.amountInput, { color: theme.text }]}
      />
      <ThemedText style={[styles.amountCurrency, { color: theme.textSecondary }]}>₽</ThemedText>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={{ gap: Spacing.two }}><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Снизу оставляем место под плавающую кнопку, иначе она накрывает последнюю запись.
  content: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + 82, gap: Spacing.three },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 },
  summary: { padding: Spacing.three, gap: Spacing.two },
  total: { fontSize: 38, lineHeight: 44, fontWeight: '800', letterSpacing: -1.4 },
  group: { gap: Spacing.two },
  groupHead: { paddingHorizontal: 4 },
  sectionHead: { paddingHorizontal: 4, paddingTop: Spacing.two, fontSize: 15 },
  closedGroup: { opacity: 0.62 },
  spanRow: { gap: Spacing.two, alignItems: 'center', paddingRight: Spacing.three },
  spanChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  spanNote: { paddingLeft: Spacing.one, maxWidth: 190 },
  list: { overflow: 'hidden' },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  personHead: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  rowText: { flex: 1, gap: 3 },
  summaryGroupCard: { overflow: 'hidden' },
  summaryCategoryRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  summaryCategoryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryServiceRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  summaryChevron: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '0deg' }],
  },
  summaryChevronOpen: { transform: [{ rotate: '90deg' }] },
  summaryDebtList: { borderTopWidth: StyleSheet.hairlineWidth },
  summaryDebtRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.four + 14,
    paddingRight: Spacing.three,
  },
  summaryTimelineDot: { width: 6, height: 6, borderRadius: 3 },
  summaryRowCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settled: { opacity: 0.5 },
  rowCheck: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: Spacing.three, paddingVertical: 70 },
  version: { textAlign: 'center', opacity: 0.4 },

  sheetScroll: { flexGrow: 0 },
  sheetBody: { padding: Spacing.three, gap: Spacing.three },
  editorHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  amountBox: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  amountInput: { flex: 1, minWidth: 0, fontSize: 40, lineHeight: 48, fontWeight: '800', letterSpacing: -1.4, paddingVertical: Spacing.two },
  amountCurrency: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  input: { minHeight: 48, paddingHorizontal: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, fontSize: 16 },
  chips: { gap: Spacing.two, paddingVertical: 2, paddingRight: Spacing.three },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: Spacing.three, borderRadius: Radius.pill, borderWidth: StyleSheet.hairlineWidth },
  dateRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  editorActions: { flexDirection: 'row', gap: Spacing.two },
  editorAction: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  carGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  carTile: {
    width: '48%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
});
