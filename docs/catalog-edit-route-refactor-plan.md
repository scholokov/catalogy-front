# План Рефакторингу Edit-Flow Через Route-Driven Архітектуру

## Ціль

Перебудувати flow редагування так, щоб:

- `browser/system back` закривав форму природно через App Router
- не було ручних `history.back()` / `history.forward()`
- не було ручного sync між URL і локальним `selectedView`
- відкритість edit-форми визначалася маршрутом, а не локальним state

## Поточна Проблема

Зараз реалізація тримається одразу на кількох джерелах правди:

- URL search params
- локальний `selectedView`
- службові refs на кшталт `openingRouteSyncRef`
- ручні маніпуляції browser history

Через це виникають типові симптоми:

- форма відкривається і одразу закривається
- форма закривається з другого разу
- `browser back` не закриває форму
- кілька `back/forward` можуть викидати користувача на інші екрани або взагалі до auth-flow

Це означає, що зараз edit-flow не є одним state machine, а складається з кількох паралельних механізмів, які намагаються синхронізувати одне одного постфактум.

## Ключовий Висновок

Поточний підхід не треба латати далі.

Потрібно відмовитись від моделі:

- "локальний modal state + ручна синхронізація з route/history"

І перейти на модель:

- "маршрут сам визначає, чи edit-форма відкрита"

## Рекомендована Архітектура

Для Next App Router базове рішення:

- окремий route для edit-сторінки
- intercepted route / parallel route для modal-overlay поверх каталогу

Це дасть:

- природну роботу `back/forward`
- єдине джерело правди для open/close
- однакову поведінку для desktop і mobile
- менше ручної логіки в manager-компонентах

## Бажана Структура Маршрутів

### Films

- `app/films/page.tsx` — каталог
- `app/films/view/[viewId]/page.tsx` — повноекранна сторінка редагування
- `app/films/@modal/(.)view/[viewId]/page.tsx` — modal-версія поверх каталогу

### Games

- `app/games/page.tsx` — каталог
- `app/games/view/[viewId]/page.tsx` — повноекранна сторінка редагування
- `app/games/@modal/(.)view/[viewId]/page.tsx` — modal-версія поверх каталогу

### Принцип

- якщо користувач відкрив edit із каталогу, route рендериться як intercepted modal
- якщо користувач зайшов напряму по URL, route рендериться як окрема сторінка

Тобто логіка одна, а контекст рендеру різний.

## Цільовий Контракт

### Open flow

Менеджер каталогу не відкриває модалку через `setSelectedView(...)`.

Він лише робить navigation:

- `router.push('/films/view/[viewId]')`
- `router.push('/games/view/[viewId]')`

### Close flow

Закриття edit-форми більше не керує history вручну.

Повинно бути:

- `router.back()` для intercepted modal, відкритої з каталогу
- `router.replace('/films')` або `router.replace('/games')` для direct open / deep-link

### View data

Дані edit-форми завантажуються з route param `viewId`.

Форма рендериться тільки якщо активний edit-route.

Локальний state форми використовується лише для draft / input values, а не для визначення, чи форма відкрита.

## Що Треба Прибрати З Поточної Реалізації

### `entryRouting.ts`

Після рефактору цей файл не повинен містити reconciliation-логіку modal lifecycle.

Потрібно прибрати:

- `useCollectionEntryRouteSync`
- `openingRouteSyncRef`
- будь-які `popstate`-обробники для modal lifecycle
- ручну логіку, яка вирішує, коли закривати локальний `selectedView`

У файлі можна лишити лише:

- helper-и для роботи з URL
- helper-и для побудови href
- можливо базовий parse search params, якщо ще буде потрібен для add-flow

### `FilmsManager.tsx`

Потрібно прибрати з manager-а відповідальність за open/close edit-форми.

Manager каталогу має відповідати лише за:

- список
- фільтри
- пагінацію
- screen context
- запуск navigation на edit-route

Потрібно прибрати:

- `selectedView` як джерело truth для open/close
- `openedSelectedViewFromCatalogRef`
- ручні `history.back()`
- route/history reconciliation в effects

### `GamesManager.tsx`

Те саме, що і для `FilmsManager.tsx`.

## Новий Shared Layer

Потрібно винести спільний route-driven shell для edit-форми.

Наприклад:

- `CollectionEntryEditShell`

Він має приймати:

- тип медіа
- entry data
- mode: `modal` або `page`
- callbacks save/delete/refresh/evaluate
- close action

Це дозволить не дублювати дві окремі логіки для films і games.

## Структура UI Компонентів

Можливе розділення:

- `CollectionEntryEditLayout`
- `CollectionEntryEditModal`
- `CollectionEntryEditPage`

Поточний `ExistingCollectionEntryModal` або адаптується під цей новий shell, або поступово замінюється на більш нейтральний layout-компонент.

## Дані І Завантаження

Зараз `FilmsManager` і `GamesManager` самі вантажать `selectedView` по `viewId/itemId`.

Після рефактору це треба перенести ближче до route-компонентів edit-flow.

Тобто:

- каталог не вантажить active edit-entry
- edit-route сам вантажить свій запис
- modal/page shell отримує готові дані для рендеру

## Dirty Guard

Guard незбережених змін має стати окремим navigation-blocker шаром поверх правильного route-driven flow.

Його роль:

- дозволити leave edit-route
- або заблокувати leave edit-route

Його роль не повинна бути такою:

- вручну синхронізувати state модалки
- повертати history назад-вперед
- рятувати неправильну архітектуру

### Правильна Послідовність

1. Користувач ініціює закриття або `back`
2. Система розуміє, що це leave edit-route
3. Якщо форма dirty:
   показати confirm
4. Якщо `Cancel`:
   route не змінюється
5. Якщо `Confirm`:
   route змінюється

## Screen Context

Каталог має зберігати:

- scroll
- filters
- pagination
- view mode

При закритті modal-route каталог повинен лишатися в тому самому контексті без ручного відновлення історії.

Це одна з причин, чому intercepted routes підходять краще за manual history sync.

## Покроковий План Реалізації

### Фаза 1. Очистка Архітектури

- прибрати current reconciliation-layer з `entryRouting.ts`
- прибрати route/history refs із `FilmsManager.tsx`
- прибрати route/history refs із `GamesManager.tsx`

### Фаза 2. Route-Driven Flow Для Films

- створити edit-route для `films`
- створити intercepted modal route для `films`
- винести edit-shell для фільму
- зробити open через `router.push`
- зробити close через router navigation

### Фаза 3. Dirty Guard Для Films

- додати leave-route confirm для dirty state
- перевірити `X`, overlay, `Esc`, browser back

### Фаза 4. Route-Driven Flow Для Games

- повторити ту саму архітектуру для `games`
- не копіювати тимчасові old-sync підходи

### Фаза 5. Уніфікація Shared Shell

- виділити спільний edit-shell
- прибрати дублювання modal/page логіки

### Фаза 6. Тестування

Перевірити сценарії:

- `home -> films -> edit -> back`
- `home -> games -> edit -> back`
- `deep-link -> edit page -> close`
- `edit dirty -> back -> cancel`
- `edit dirty -> back -> confirm`
- desktop
- mobile

## Що Не Робити

Не треба:

- додавати нові refs для "відкривається/закривається"
- додавати нові `popstate`-латки
- використовувати `window.history.state` як основу modal lifecycle
- вручну компенсувати browser navigation через `history.back()` / `history.forward()`
- ловити "правильний момент", коли `useSearchParams` оновився

Це все ознаки того, що архітектура лишається неправильною.

## Очікуваний Результат

Після рефактору:

- `back` стабільно закриває edit-форму
- форма не відкривається/закривається сама собою
- ручне закриття і browser back працюють однаково
- каталог не губить свій screen context
- desktop/mobile поводяться однаково
- код стає простішим і передбачуванішим

## Окрема Примітка

Помилки виду:

- `PersonHoverLink -> /api/tmdb/person/... 500/502`

це окрема проблема серверного endpoint-а і її треба дебажити окремо.

Вона не є основною причиною поломки route/modal-flow.
