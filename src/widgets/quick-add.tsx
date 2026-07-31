import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { QuickAddProps } from './quick-add.types';

export type { QuickAddProps };

const ACCENT = '#007AFF';
const GREEN = '#34C759';

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

/**
 * Виджет «Быстрый ввод».
 *
 * Сумма долгов + два ярлыка: каршеринг и заметка. Нажатие открывает приложение
 * сразу на нужной форме — записать поездку получается за одно касание.
 *
 * Кнопки сделаны ссылками, а не интерактивными Button: расширение виджета не
 * ходит в сеть, а форма в приложении всё равно нужна, чтобы вписать сумму.
 */
const QuickAdd = (props: QuickAddProps, environment: WidgetEnvironment) => {
  'widget';

  const family = environment.widgetFamily;

  // Экран блокировки: место на одну строку, цвет системный.
  if (family === 'accessoryInline') {
    return <Text>{`Noda · ${money(props.total)}`}</Text>;
  }

  if (family === 'accessoryCircular') {
    return (
      <Link destination="noda://quick/car">
        <VStack spacing={0}>
          <Image systemName="car.fill" modifiers={[font({ size: 15 })]} />
          <Text modifiers={[font({ size: 11, weight: 'semibold' })]}>Поездка</Text>
        </VStack>
      </Link>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <Link destination="noda://quick/car">
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' })]}>Не вернули</Text>
          <Text modifiers={[font({ size: 17, weight: 'bold' })]}>{money(props.total)}</Text>
          <Text modifiers={[font({ size: 11 })]}>Нажми — записать каршеринг</Text>
        </VStack>
      </Link>
    );
  }

  const compact = family === 'systemSmall';

  return (
    <VStack alignment="leading" spacing={compact ? 6 : 10} modifiers={[padding({ all: compact ? 2 : 4 })]}>
      <HStack spacing={6}>
        <Image systemName="wallet.bifold.fill" modifiers={[font({ size: 13 }), foregroundStyle(ACCENT)]} />
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>Не вернули</Text>
        <Spacer />
      </HStack>

      <Text modifiers={[font({ size: compact ? 26 : 32, weight: 'bold' })]}>{money(props.total)}</Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
        {props.count ? `${props.count} записей` : 'всё закрыто'}
      </Text>

      <Spacer />

      {compact ? (
        <Link destination="noda://quick/car">
          <HStack spacing={6} modifiers={[frame({ maxWidth: 1000 }), padding({ vertical: 7 })]}>
            <Image systemName="car.fill" modifiers={[font({ size: 13 }), foregroundStyle(GREEN)]} />
            <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(GREEN)]}>Каршеринг</Text>
          </HStack>
        </Link>
      ) : (
        <HStack spacing={8} modifiers={[frame({ maxWidth: 1000 })]}>
          <Link destination="noda://quick/car">
            <HStack spacing={6} modifiers={[padding({ vertical: 7, horizontal: 10 })]}>
              <Image systemName="car.fill" modifiers={[font({ size: 13 }), foregroundStyle(GREEN)]} />
              <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(GREEN)]}>Каршеринг</Text>
            </HStack>
          </Link>
          <Link destination="noda://quick/note">
            <HStack spacing={6} modifiers={[padding({ vertical: 7, horizontal: 10 })]}>
              <Image systemName="square.and.pencil" modifiers={[font({ size: 13 }), foregroundStyle(ACCENT)]} />
              <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(ACCENT)]}>Заметка</Text>
            </HStack>
          </Link>
        </HStack>
      )}
    </VStack>
  );
};

/**
 * Пока в сборке нет нативного таргета виджета (нужен App Group в аккаунте Apple),
 * createWidget бросает исключение. Не роняем из-за этого всё приложение.
 */
function safeCreate() {
  try {
    return createWidget<QuickAddProps>('QuickAdd', QuickAdd);
  } catch {
    return { updateSnapshot: () => {}, updateTimeline: () => {}, reload: () => {} } as unknown as ReturnType<typeof createWidget<QuickAddProps>>;
  }
}

export const QuickAddWidget = safeCreate();
export default QuickAddWidget;
