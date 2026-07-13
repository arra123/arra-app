# Дизайн-система сайта websiteglass.com

> Извлечено детерминированно из кода сайта сервисом vibe.flekk.ru. Значения — точные, без домыслов. Разделы, которые не удалось прочитать, опущены.

## 1. Общая атмосфера

Система построена на тёмной основе, с единственным акцентным цветом `#FFFFFF`, фирменные скругления 12, 13, 16, 20px, глубина задаётся тенями, заголовки набраны гарнитурой Geist.

## 2. Цветовая палитра и роли

### Роли

- **Фон** `#0A0A0A`
- **Основной текст** `#FFFFFF`
- **Акцент** `#FFFFFF`
- **Ссылки / кнопки** `#FFFFFF`

### Вся палитра

- `#0C0C12`
- `#000000`

### Готовые токены сайта (CSS-переменные)

```css
:root {
  --color-black: #000;
  --color-white: #fff;
  --color-fd-card: #f1f1f1;
  --color-fd-ring: #a3a3a3;
  --tw-ring-color: #00bcfeb3;
  --color-fd-muted: #f5f5f5;
  --color-fd-accent: #d1d1d180;
  --color-fd-border: #cccccc80;
  --color-fd-popover: #fafafa;
  --color-fd-primary: #171717;
  --color-fd-diff-add: #0eb4641a;
  --color-fd-secondary: #ededed;
  --color-fd-background: #f5f5f5;
  --color-fd-foreground: #0a0a0a;
  --color-fd-diff-remove: #c80a641f;
  --tw-ring-offset-color: #fff;
  --color-fd-card-foreground: #0a0a0a;
  --color-fd-diff-add-symbol: #0ac864;
  --color-fd-muted-foreground: #737373;
  --color-fd-accent-foreground: #171717;
  --color-fd-diff-remove-symbol: #e60a64;
  --color-fd-popover-foreground: #272727;
  --color-fd-primary-foreground: #fafafa;
  --color-fd-secondary-foreground: #171717;
}
```

## 3. Типографика

- **Заголовки:** Geist (самохостинг), веса 100, 900
- **Текст:** Geist Fallback (самохостинг), веса 400

Фоллбек-стек: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.

## 4. Размерная шкала

| Уровень | Размер |
|---|---|
| Заголовок H1 | 72px |
| Заголовок H2 | 14px |
| Текст | 12px |

Коэффициент шкалы ≈ 1.2 · интерлиньяж текста 1.63 · интерлиньяж заголовков 1.08 · плотная разрядка.

## 5. Ритм и сетка

- **Базовый шаг сетки:** 4px (все отступы кратны ему)
- **Ширина контейнера:** 1150px
- **Раскладка:** Flexbox
- **Скругления:** 12px, 13px, 16px, 20px
- **Обводки:** 1px solid

## 6. Компоненты

Стили сняты с реальных элементов страницы — значения точные.

### Поле ввода

```css
color: #FFFFFF;
border-radius: 0px;
padding: 0px;
font-size: 14px;
font-weight: 400;
```

Состояния взяты из объявленных на сайте `:hover` / `:focus` правил — самые частотные значения.

### Наведение (hover)

```css
color: rgba(255, 255, 255, 0.7);
opacity: 0.8;
border-color: rgba(255, 255, 255, 0.2);
background-color: var(--accent);
```

### Фокус (focus)

```css
color: var(--color-white);
box-shadow: var(--tw-inset-shadow),var(--tw-inset-ring-shadow),var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow);
border-color: var(--ring);
background-color: rgba(255, 255, 255, 0.1);
```

## 7. Тени и глубина

Уровней высоты: 5.

```css
box-shadow: rgba(255, 255, 255, 0.9) 0px 1px 1px 0px inset, rgba(255, 255, 255, 0.4) 0px 0px 0px 1px inset, rgba(0, 0, 0, 0.28) 0px 14px 38px -12px;
box-shadow: rgba(0, 0, 0, 0.28) 0px 2px 6px 0px, rgba(0, 0, 0, 0.04) 0px 0px 0px 0.5px;
box-shadow: rgba(255, 255, 255, 0.3) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.18) 0px 2px 10px 0px;
```

### Градиенты

```css
background: linear-gradient(nulldeg, #FFFFFF null%, #000000 null%, #FFFFFF null%, #000000 null%);
background: linear-gradient(135deg, #FFFFFF 0%, #000000 38%, #000000 62%, #FFFFFF 100%);
background: radial-gradient(#30D158 0%, #000000 70%);
background: radial-gradient(#14B8A6 0%, #000000 70%);
```

### Матовое стекло

`backdrop-filter: blur(2px)` — эффект стекла на слоях.

## 8. Движение

```css
transition: 0.15s cubic-bezier(0.4;
transition: 0.2s cubic-bezier(0.4;
transition: 0.3s cubic-bezier(0.4;
```

На сайте есть собственные `@keyframes`-анимации, а не только переходы.

## 9. Под капотом

- **Собран на:** Next.js, Tailwind

## 10. Адаптивность

Из `@media`-правил сайта: что переопределяется на каждой точке (в скобках — сколько правил).

| Точка | Условие | Что меняется |
|---|---|---|
| 1536px | от 1536px | ширина (2) |
| 1280px | от 1280px | показ/скрытие блоков (2), ширина (1) |
| 1024px | от 1024px | колонки сетки (3), показ/скрытие блоков (3), ширина (1), направление раскладки (1) |
| 768px | от 768px | показ/скрытие блоков (4), отступы (4), ширина (3), высота (2) |
| 640px | от 640px | отступы (4), колонки сетки (2), показ/скрытие блоков (2), кегль (1) |

Подход mobile-first: базовые стили — мобильные, правила расширяют вверх (`min-width`).

## 11. Можно / Нельзя

### Можно

- Использовать `#FFFFFF` как единственный акцент для всех интерактивных элементов
- Применять фирменные скругления: 12px, 13px, 16px, 20px
- Держать все отступы кратными базовому шагу 4px

### Нельзя

- Смешивать несколько акцентных цветов в одной композиции
- Добавлять разрядку основному тексту — держать плотный набор

## 12. Шпаргалка для ИИ-агента

Быстрый справочник цветов:

- **Фон:** `#0A0A0A`
- **Текст:** `#FFFFFF`
- **Акцент / hover / active:** `#FFFFFF`
- **Ссылки / кнопки:** `#FFFFFF`

При генерации UI применяй значения из этого файла как есть — они сняты с реального сайта.

---

> DESIGN.md для `websiteglass.com` сгенерирован на [vibe.flekk.ru](https://vibe.flekk.ru/?utm_source=designmd&utm_medium=referral&utm_campaign=export) — детектор дизайна по ссылке. Точные значения из кода сайта, без нейросетей.
