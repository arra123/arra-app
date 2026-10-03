---
name: Arra iOS Dialog Widgets
description: Компактная нативная карточка выбранного диалога и текущей задачи.
colors:
  dark-card: "rgb(12.5% 13.7% 15.7%)"
  primary-text: "#ffffff"
  mascot-3: "#ffcf40"
  mascot-4: "#ad7bed"
  mascot-5: "#55b9f2"
  mascot-6: "#ff6379"
  mascot-8: "#8caf42"
  mascot-11: "#984feb"
  mascot-12: "#ffbd83"
  mascot-13: "#ffd13b"
  mascot-14: "#359fef"
  mascot-15: "#d76b8d"
  mascot-16: "#aaa194"
  mascot-19: "#9b93ff"
typography:
  title:
    fontFamily: "-apple-system"
    fontWeight: 600
  task:
    fontFamily: "-apple-system"
  metadata:
    fontFamily: "-apple-system"
  status:
    fontFamily: "-apple-system"
    fontWeight: 600
spacing:
  card-inset: "14pt"
  column-gap: "10pt"
  text-gap: "6pt"
  metadata-gap: "4pt"
  navigation-gap: "2pt"
components:
  dialog-card:
    backgroundColor: "{colors.dark-card}"
    textColor: "{colors.primary-text}"
    padding: "{spacing.card-inset}"
  cycle-arrow:
    width: "44pt"
    height: "44pt"
  mascot-normal:
    width: "76pt"
    height: "92pt"
  mascot-accessibility:
    width: "32pt"
    height: "32pt"
---

# Design System: Arra iOS Dialog Widgets

## Overview

**Creative North Star: «Компактный блок работы».**

Это локальная система виджетов Arra, извлечённая из
`plugins/native/ArraDialogWidgets.swift` на коммите
`dd1feb58452d9a911331d8e4325c5c36dedbe5bc` и подтверждённая финальными
Simulator-рендерами от 03.10.2026. Она не заменяет дизайн всего приложения.

Существующие маскоты и тёмная поверхность сохраняют узнаваемость Arra.
Заголовок диалога и текущая задача важнее украшения. Номер агента повторяет
цвет персонажа; вторичные сведения и статус остаются спокойными и читаемыми.
Продуктовый контекст — [TASK.md](../TASK.md), композиция и границы проверки —
[surface brief](../../../.impeccable/surfaces/ios-dialog-widgets.md).

**Key Characteristics:**

- Один выбранный диалог и его текущая задача.
- Свои маскоты, цветной номер, тёмная нативная оболочка.
- Системные текстовые стили и SF Symbols.
- Приоритет текста при accessibility-размерах Dynamic Type.

## Colors

### Primary

Акцент идентичности — цвет номера выбранного агента. Ключи `mascot-*`
соответствуют существующему `mascotId` и точной таблице `mascotColor` в Swift;
отдельный универсальный акцент здесь не вводится. Неизвестный ID получает
белый номер.

### Neutral

`dark-card` — общий тёмный фон Home Widget и Live Activity; `primary-text` —
основной текст и стрелки. Метаданные, текущая задача и счётчик используют
SwiftUI `.secondary`, поэтому их цвет задаёт нативная среда.

Статусы сохраняют системную семантику: `.yellow` для «Нужен ответ», `.red`
для «Ошибка», `.green` для «Готово», `.secondary` для остальных состояний.
Не подменять их приблизительными hex-значениями из веб-макета.

**The Identity Rule.** Цвет номера следует персонажу, а состояние всегда
выражается также текстом.

## Typography

Нативная системная гарнитура iOS (San Francisco) и семантические SwiftUI
стили — источник истины. Google Sans Flex относится к согласованному
ПК-макету; нативная карточка не объявляет и не встраивает эту гарнитуру.

- **Title:** `.subheadline.weight(.semibold)`, до двух строк.
- **Task:** `.caption`, до двух строк, вторичный цвет.
- **Metadata:** `.caption2`, одна строка; номер выделен жирным.
- **Status:** `.caption2.weight(.semibold)`, одна строка.
- **Counter:** `.caption2.monospacedDigit()` для устойчивой ширины цифр.

При accessibility-размерах заголовок использует `.caption.weight(.semibold)`
с одной строкой, задача — `.caption2` с двумя строками. Стили продолжают
масштабироваться через Dynamic Type. Полные исходные заголовок, задача,
метаданные и статус включены в accessibility label ссылки; произвольная
длина текста не гарантирует полного визуального размещения.

## Layout

Основная горизонтальная карточка состоит из маскота, расширяющейся текстовой
колонки и правой колонки навигации. Наблюдаемые отступы и размеры зафиксированы
в frontmatter в iOS points, не в CSS pixels.

При accessibility-размерах крупный маскот уступает место маленькому в строке
метаданных. Заголовок и текущая задача получают освободившуюся ширину.
Для `wait`, `error`, `done` статус занимает место метаданных; отдельная нижняя
строка статуса убирается. Это подтверждённая адаптация, а не масштабирование
обычной композиции целиком.

Home Widget семейства `.systemMedium` и Live Activity используют один
`ArraDialogCard`. Малые и accessory-семейства используют сокращённое
представление с маскотом и заголовком; интерактивную композицию среднего
виджета на них не переносить автоматически.

## Elevation & Depth

Материальность создаёт тёмная поверхность нативного контейнера:
`containerBackground` у Home Widget и `activityBackgroundTint` у Live Activity.
В самой карточке нет собственного blur, градиента, обводки или тени.
Прозрачность и окончательное оформление контейнера зависят от iOS host.
Не описывать ПК-фон или скругление Simulator-harness как production material.

## Shapes

Маскоты сохраняют собственные силуэты и пропорции через `scaledToFit()`;
production image assets происходят от существующих векторных персонажей.
Внешнюю форму виджета задаёт iOS, собственный radius в `ArraDialogCard`
не установлен. Прямоугольный `contentShape` расширяет область касания
карточки и каждой стрелки.

## Components

### Dialog card

Ведёт к выбранному диалогу. Контент: цветной номер, проект и устройство,
заголовок, текущая задача, текстовое состояние. Маскот декоративный для
VoiceOver; ссылка получает полное смысловое описание. Link и `widgetURL`
используют общий URL resolver.

### Cycle arrows

Нативные `Button(intent:)` с SF Symbols `chevron.up` / `chevron.down`;
каждая область касания соответствует `cycle-arrow`. Надписи VoiceOver:
«Предыдущий диалог» и «Следующий диалог». Стрелки выключены при нуле или
одном диалоге, opacity выключенного состояния — `0.35`.

### Selection and counter

Счётчик показывает позицию и количество **всех открытых** диалогов, пустое
состояние — `0 / 0`. Выбор хранится по стабильному ключу
`arra.selected-dialog`, а не по позиции; при исчезновении выбранного ключа
используется первый диалог. Цикл замыкается в обоих направлениях.

### Empty state

«Нет открытых диалогов», «Откройте агента в Arra», нейтральный маскот и
выключенные стрелки. Тап ведёт к `arra://`, без вымышленного agent key.

## Do's and Don'ts

### Do

- **Do** сохранять существующих персонажей и соответствие номера их цвету.
- **Do** проверять обычный и accessibility-размер текста на production SwiftUI.
- **Do** давать заголовку и текущей задаче приоритет над крупным маскотом.
- **Do** сохранять общий renderer и resolver выбранного диалога для Home и Live Activity.

### Don't

- **Don't** превращать компактный блок в список агентов или большую панель.
- **Don't** заменять согласованные стрелки обязательными свайпами.
- **Don't** обещать произвольный scroll, непрерывную анимацию или вечное закрепление Live Activity.
- **Don't** выдавать Simulator-harness за проверку настоящего WidgetKit host,
  AppIntent dispatch или уведомления на физическом iPhone.
