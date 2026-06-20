# План Переробки Browser Back Для Edit-Форми

## Контекст

Поточна проблема не зводиться до одного невдалого `back()` виклику.

Зараз у flow edit-форми є два джерела правди:

- URL/history state
- локальний React state модалки (`selectedView`)

Через це можливий розсинхрон:

- URL уже повернувся на каталог
- edit-форма все ще лишається відкритою
- або навпаки, підлеглий screen/layout уже змінився, а модалка ще висить поверх

Саме тому симптоми різні на desktop і mobile, але клас проблеми один і той самий: modal visibility не є по-справжньому route-driven.

## Ціль

Зробити так, щоб:

- browser/system `back` завжди спершу закривав edit-форму
- каталог під формою залишався стабільним
- URL, видимий UI і внутрішній state не розходилися
- поведінка була однакова для `films` і `games`
- guard незбережених змін працював як блокер переходу, а не як латка поверх неправильного flow

## Основний принцип

Потрібно прибрати модель:

- "відкрити модалку через локальний state, а URL лише підсинхронити"

І перейти на модель:

- "URL/route state визначає, яка edit-форма відкрита"

Тобто не:

1. `setSelectedView(...)`
2. потім синхронізувати URL

А:

1. змінити route state
2. з route state обчислити, чи відкрита форма і яка саме

## Поточна архітектурна проблема

У `FilmsManager` і `GamesManager` edit-модалка рендериться з локального state:

- `selectedView`

URL-параметри (`view` / `item`) живуть паралельно і лише "примиряються" через окремий sync-effect.

Це крихка модель, бо правильність залежить від:

- моменту оновлення `useSearchParams()`
- роботи reconciliation-ефекту
- проміжного стану `pendingViewParamSyncRef`

Через це `history` уже може перейти в інший стан, а React-стан модалки ще ні.

## Цільовий контракт

Потрібен один source of truth для відкритої edit-форми.

### Route state

У URL зберігається:

- `view` або `item`, якщо відкрита форма редагування
- відсутність `view/item`, якщо користувач просто на каталозі

### Derived UI state

Manager не "тримає відкритість модалки" як незалежний локальний state.

Натомість manager:

1. читає route state
2. знаходить або підвантажує потрібний запис
3. рендерить modal тільки якщо route state цього вимагає

Тобто modal open state має бути derived, а не imperatively controlled.

## Що треба переробити

## 1. `entryRouting.ts`

Поточна роль файлу занадто широка: він не лише працює з URL, а ще й намагається reconciliation-логікою доганяти локальний modal state.

Потрібно звузити відповідальність:

- лишити helpers для читання search params
- лишити helpers для запису search params
- лишити допоміжні методи для завантаження запису по `viewId` / `itemId`
- прибрати або радикально спростити логіку, яка імперативно синхронізує локальний `selectedView`

### Після рефактору

`entryRouting.ts` має відповідати на питання:

- що є в URL
- як оновити URL
- як знайти сутність для route state

Але не:

- коли й як примусово закривати локальну модалку через reconciliation

## 2. `FilmsManager.tsx`

Потрібно перейти від локального "selected modal state" до route-derived render flow.

### Замість поточного підходу

- `selectedView` відкривається локально
- URL синхронізується окремо
- потім `useRequestedCollectionViewSync` намагається тримати все разом

### Має бути

- `requestedViewId` / `requestedItemId` є основою для відкриття edit-форми
- якщо route state порожній, edit-форма не рендериться
- якщо route state є, manager дістає відповідний `selectedViewData`
- рендерить `ExistingCollectionEntryModal` тільки на базі цього derived state

### Практично це означає

- `selectedView` або зникає як незалежний modal-state, або лишається лише як cached loaded data
- відкритість модалки більше не визначається фактом `setSelectedView(...)`
- відкритість визначається тим, що в URL є `view/item`

## 3. `GamesManager.tsx`

Той самий патерн, що й для `FilmsManager.tsx`.

Потрібно уникнути ситуації, коли:

- `films` працює по одному контракту
- `games` по іншому

Інакше баг повернеться в іншій формі.

## 4. Open flow

Відкриття edit-форми має створювати history entry саме як стан:

- "каталог + відкрита форма"

Тобто відкриття має бути справжнім route transition на поточному screen-level URL state.

### Очікувана поведінка

Сценарій:

1. `home`
2. `films`
3. open edit form

History stack має виглядати так:

1. `home`
2. `films`
3. `films?view=...` або еквівалентний локальний route state для edit-форми

Тоді browser `back` природно повертає на:

- `films`

без додаткових компенсаторних маніпуляцій.

## 5. Close flow

Усі способи закриття edit-форми мають сходитися в один контракт:

- `X`
- overlay click
- `Esc`
- кнопка `Закрити`
- browser/system `back`

Вони не повинні по-різному "впливати на state".

Вони повинні лише переводити route state з:

- "каталог + edit"

у:

- "каталог без edit"

### Важливо

Не треба, щоб close logic вручну "вгадувала", який зараз правильний React state.

Вона має працювати через єдиний navigation contract.

## 6. Unsaved changes guard

Guard незбережених змін має бути окремим шаром поверх правильної route-driven моделі.

Його роль:

- дозволити transition
- або скасувати transition

Його роль не повинна бути такою:

- вручну рятувати неправильно спроєктований modal-state flow

### Правильна послідовність

1. Користувач ініціює закриття або `back`
2. Система розуміє, що це спроба перейти з `edit` у `catalog`
3. Якщо форма dirty:
   показати confirm
4. Якщо користувач підтвердив:
   дозволити route transition
5. Якщо користувач скасував:
   route transition не відбувається

## 7. Mobile-specific перевірка

Після основного рефактору треба окремо перевірити mobile layout.

Поточний mobile-симптом:

- каталог закривається під модалкою

Ймовірно, це наслідок того самого dual-state bug.

Але треба окремо перевірити, чи:

- screen context store
- mobile layout wrappers
- overlay/container visibility

не мають свого додаткового navigation side-effect.

## Порядок виконання

### Крок 1

Описати цільовий контракт:

- `route state -> selected entity -> modal render`

### Крок 2

Спростити `entryRouting.ts`:

- URL helpers
- lookup/load helpers
- без крихкого reconciliation локального modal state

### Крок 3

Переробити `FilmsManager.tsx` на route-driven modal render.

### Крок 4

Повторити той самий патерн у `GamesManager.tsx`.

### Крок 5

Повернути unsaved-changes guard уже в правильний navigation contract.

### Крок 6

Пройти сценарії:

- `home -> films -> edit -> back`
- `home -> games -> edit -> back`
- `deep-link directly to edit -> close`
- `edit with unsaved changes -> back -> cancel`
- `edit with unsaved changes -> back -> confirm`
- desktop
- mobile

## Очікуваний результат

Після рефактору:

- `back` спершу закриває edit-форму
- URL і UI не розходяться
- каталог під модалкою не зникає
- mobile і desktop поводяться однаково
- guard незбережених змін працює передбачувано

## Чого не робити

Не варто далі підкручувати:

- `pendingViewParamSyncRef`
- `history marker`
- ручні `window.history.back()` / `forward()` як головний механізм

Це лікує симптоми, але не прибирає саму причину:

- dual ownership of modal state

## Рекомендація

Йти через повний route-driven redesign edit-flow, а не через ще одну локальну латочку.

Це дорожче за один quick fix, але саме це дасть стабільну поведінку browser/system back на desktop і mobile.
