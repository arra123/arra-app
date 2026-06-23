import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

// Категория -> SF Symbol + цвет. Спокойная палитра (Linear-стиль), приглушённые тона.
const MAP: Record<string, { sf: SymbolViewProps['name']; color: string }> = {
  Продукты: { sf: 'cart.fill', color: '#4CB782' },
  'Кафе и рестораны': { sf: 'fork.knife', color: '#E0A33E' },
  Транспорт: { sf: 'bus.fill', color: '#5B8DEF' },
  Такси: { sf: 'car.fill', color: '#5FB8CF' },
  Жильё: { sf: 'house.fill', color: '#9A7BE0' },
  'Связь и интернет': { sf: 'wifi', color: '#4CB7A5' },
  Здоровье: { sf: 'cross.case.fill', color: '#E06C75' },
  Одежда: { sf: 'tshirt.fill', color: '#C98AB8' },
  Развлечения: { sf: 'gamecontroller.fill', color: '#6E79E6' },
  Подписки: { sf: 'repeat', color: '#9A7BE0' },
  Образование: { sf: 'book.fill', color: '#5B8DEF' },
  Подарки: { sf: 'gift.fill', color: '#E06C75' },
  Путешествия: { sf: 'airplane', color: '#5FB8CF' },
  'Дом и быт': { sf: 'lamp.table.fill', color: '#8A8F98' },
  Дети: { sf: 'figure.and.child.holdinghands', color: '#E0A33E' },
  Питомцы: { sf: 'pawprint.fill', color: '#4CB782' },
  Авто: { sf: 'car.fill', color: '#8A8F98' },
  Зарплата: { sf: 'banknote.fill', color: '#4CB782' },
  Перевод: { sf: 'arrow.left.arrow.right', color: '#6E79E6' },
  Прочее: { sf: 'creditcard.fill', color: '#8A8F98' },
};

export function categoryMeta(category: string) {
  return MAP[category] || MAP['Прочее'];
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
  return MAP[category || 'Прочее']?.color || MAP['Прочее'].color;
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
