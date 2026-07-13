import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

type Meta = { sf: SymbolViewProps['name']; color: string };

// Категория -> SF Symbol + цвет. Спокойная палитра (Linear-стиль), приглушённые тона.
const MAP: Record<string, Meta> = {
  Продукты: { sf: 'cart.fill', color: '#6F9AE8' },
  'Кафе и рестораны': { sf: 'fork.knife', color: '#E0A33E' },
  Кафе: { sf: 'cup.and.saucer.fill', color: '#E0A33E' },
  Рестораны: { sf: 'fork.knife', color: '#E0A33E' },
  Кофе: { sf: 'cup.and.saucer.fill', color: '#B5835A' },
  Доставка: { sf: 'shippingbox.fill', color: '#E0A33E' },
  Алкоголь: { sf: 'wineglass.fill', color: '#C97A8A' },
  Транспорт: { sf: 'bus.fill', color: '#5B8DEF' },
  Такси: { sf: 'car.fill', color: '#5FB8CF' },
  Каршеринг: { sf: 'car.2.fill', color: '#5FB8CF' },
  Парковка: { sf: 'parkingsign', color: '#5B8DEF' },
  Топливо: { sf: 'fuelpump.fill', color: '#5B8DEF' },
  Жильё: { sf: 'house.fill', color: '#9A7BE0' },
  ЖКХ: { sf: 'bolt.fill', color: '#9A7BE0' },
  'Связь и интернет': { sf: 'wifi', color: '#4CB7A5' },
  Связь: { sf: 'phone.fill', color: '#4CB7A5' },
  Созвон: { sf: 'video.fill', color: '#4CB7A5' },
  Здоровье: { sf: 'cross.case.fill', color: '#E06C75' },
  Аптека: { sf: 'pills.fill', color: '#E06C75' },
  Спорт: { sf: 'figure.run', color: '#6F9AE8' },
  Красота: { sf: 'scissors', color: '#C98AB8' },
  Одежда: { sf: 'tshirt.fill', color: '#C98AB8' },
  Развлечения: { sf: 'gamecontroller.fill', color: '#6E79E6' },
  Кино: { sf: 'film.fill', color: '#6E79E6' },
  Музыка: { sf: 'music.note', color: '#6E79E6' },
  Игры: { sf: 'gamecontroller.fill', color: '#6E79E6' },
  Подписки: { sf: 'repeat', color: '#9A7BE0' },
  Образование: { sf: 'book.fill', color: '#5B8DEF' },
  Книги: { sf: 'books.vertical.fill', color: '#5B8DEF' },
  Подарки: { sf: 'gift.fill', color: '#E06C75' },
  Путешествия: { sf: 'airplane', color: '#5FB8CF' },
  'Дом и быт': { sf: 'lamp.table.fill', color: '#8A8F98' },
  Техника: { sf: 'desktopcomputer', color: '#8A8F98' },
  Дети: { sf: 'figure.and.child.holdinghands', color: '#E0A33E' },
  Питомцы: { sf: 'pawprint.fill', color: '#6F9AE8' },
  Авто: { sf: 'car.fill', color: '#8A8F98' },
  Маркетплейс: { sf: 'bag.fill', color: '#E0A33E' },
  Налоги: { sf: 'building.columns.fill', color: '#8A8F98' },
  Бизнес: { sf: 'briefcase.fill', color: '#6E79E6' },
  Инвестиции: { sf: 'chart.line.uptrend.xyaxis', color: '#6F9AE8' },
  Зарплата: { sf: 'banknote.fill', color: '#6F9AE8' },
  Доход: { sf: 'arrow.down.left', color: '#6F9AE8' },
  Перевод: { sf: 'arrow.left.arrow.right', color: '#6E79E6' },
  Прочее: { sf: 'creditcard.fill', color: '#8A8F98' },
};

// Ключевые слова -> метка (для категорий, которые придумал ИИ; ищем по подстроке)
const KEYWORDS: [RegExp, string][] = [
  [/созвон|звонок|видеосв|zoom|конференц/i, 'Созвон'],
  [/кофе|кофей|старбакс|coffee/i, 'Кофе'],
  [/алко|вино|пиво|бар\b/i, 'Алкоголь'],
  [/доставк|курьер/i, 'Доставка'],
  [/каршер|белка|ситидрайв|делимоб|драйв/i, 'Каршеринг'],
  [/парков/i, 'Парковка'],
  [/бензин|топлив|азс|заправ/i, 'Топливо'],
  [/аптек|лекарств|таблет/i, 'Аптека'],
  [/спорт|зал|фитнес|трениров/i, 'Спорт'],
  [/красот|салон|парикмах|маникюр|барбер/i, 'Красота'],
  [/кино|фильм|кинотеатр/i, 'Кино'],
  [/музык|spotify|яндекс\s*музык/i, 'Музыка'],
  [/игр|game|steam|playstation|xbox/i, 'Игры'],
  [/книг|literes|читай/i, 'Книги'],
  [/налог|пошлин|штраф/i, 'Налоги'],
  [/жкх|коммунал|электр|вода|газ\b/i, 'ЖКХ'],
  [/инвест|акци|облигац|брокер/i, 'Инвестиции'],
  [/маркетплейс|озон|ozon|wildberries|вайлдбер|ягодки/i, 'Маркетплейс'],
  [/еда|перекус|обед|ужин|столов|ресторан/i, 'Кафе и рестораны'],
  [/продукт|магазин|супермаркет|пятёроч|магнит|вкусвилл|перекрёст/i, 'Продукты'],
  [/такси|uber|яндекс\s*такси/i, 'Такси'],
  [/связ|интернет|мтс|билайн|мегафон|tele2/i, 'Связь и интернет'],
  [/здоров|врач|клиник|больниц|анализ/i, 'Здоровье'],
  [/одежд|обувь|zara|hm\b/i, 'Одежда'],
  [/подписк|подписка/i, 'Подписки'],
  [/перевод|перекинул|отправил\s*деньг/i, 'Перевод'],
];

export function categoryMeta(category?: string): Meta {
  if (!category) return MAP['Прочее'];
  if (MAP[category]) return MAP[category];
  for (const [re, key] of KEYWORDS) if (re.test(category)) return MAP[key];
  return MAP['Прочее'];
}

export function CategoryIcon({ category, size = 40 }: { category: string; size?: number }) {
  const { sf, color } = categoryMeta(category);
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '26' }]}>
      <SymbolView name={sf} tintColor={color} size={size * 0.5} />
    </View>
  );
}

export function categoryColor(category?: string) {
  return categoryMeta(category).color;
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
