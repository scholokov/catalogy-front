# Implementation Design: Route-Driven Edit Flow For Films And Games

## Призначення

Цей документ описує цільову технічну реалізацію нового edit-flow для `films` і `games`, де:

- відкритість edit-форми визначається маршрутом
- modal-overlay працює через App Router
- `browser/system back` закриває форму природно
- локальні state/ref-механізми більше не керують lifecycle edit-модалки

Документ є технічним дизайном для поетапної реалізації після відмови від поточного history-sync підходу.

## Основна Ідея

Потрібно перейти від моделі:

- `catalog manager -> setSelectedView -> sync URL -> ловимо close/open effects`

до моделі:

- `catalog manager -> router.push(edit route) -> router сам керує lifecycle`

Тобто edit-flow має бути route-native, а не route-synchronized.

## Цільова Route Model

### Films

- `app/films/page.tsx`
- `app/films/view/[viewId]/page.tsx`
- `app/films/@modal/(.)view/[viewId]/page.tsx`
- `app/films/@modal/default.tsx`

### Games

- `app/games/page.tsx`
- `app/games/view/[viewId]/page.tsx`
- `app/games/@modal/(.)view/[viewId]/page.tsx`
- `app/games/@modal/default.tsx`

### Поведінка

- якщо користувач натискає edit із каталогу, відкривається intercepted modal route
- якщо користувач заходить напряму по `view/[viewId]`, відкривається окрема page-версія edit view
- у двох сценаріях використовується один і той самий edit content, але з різним route context

## Route Responsibilities

### `app/films/page.tsx`

Відповідає лише за каталог:

- рендер manager-а
- screen context списку
- фільтри, пагінацію, сортування
- підготовку до відкриття edit-route через navigation

Не відповідає за:

- lifecycle edit-модалки
- завантаження активного edit-entry по route
- manual history sync

### `app/films/view/[viewId]/page.tsx`

Відповідає за standalone page mode:

- отримує `viewId`
- вантажить edit data
- рендерить page-layout edit-форми
- визначає close navigation для direct route

### `app/films/@modal/(.)view/[viewId]/page.tsx`

Відповідає за modal mode:

- отримує `viewId`
- вантажить ті самі edit data
- рендерить modal-layout поверх каталогу
- визначає close navigation для intercepted route

### `app/films/@modal/default.tsx`

Повертає `null`, коли modal route не активний.

### Games

Той самий розподіл відповідальностей, що і для films.

## Нові Shared Компоненти

Рекомендована структура:

- `src/components/catalog/edit/CollectionEntryEditShell.tsx`
- `src/components/catalog/edit/CollectionEntryEditLayout.tsx`
- `src/components/catalog/edit/CollectionEntryEditModal.tsx`
- `src/components/catalog/edit/CollectionEntryEditPage.tsx`

### `CollectionEntryEditShell`

Головний orchestration-компонент.

Відповідальність:

- прийняти entry data
- обрати mode: `modal` або `page`
- прокинути callbacks save/delete/refresh
- зібрати єдиний edit UI

Основні пропси:

- `mode: "modal" | "page"`
- `entry`
- `mediaType: "films" | "games"`
- `readOnly`
- `onClose`
- `onSave`
- `onDelete`
- `onDirtyChange`

### `CollectionEntryEditLayout`

Спільний UI/layout без route-specific логіки.

Відповідальність:

- заголовок
- секції форми
- дії збереження/видалення
- preview actions
- dirty state callbacks

Не повинен знати:

- чи це modal route
- чи це full page route
- як саме працює browser history

### `CollectionEntryEditModal`

Обгортка над `CollectionEntryEditLayout` для modal-mode.

Відповідальність:

- modal chrome
- overlay
- close trigger
- `Esc`
- інтеграція з confirm leave flow

### `CollectionEntryEditPage`

Обгортка над `CollectionEntryEditLayout` для page-mode.

Відповідальність:

- page container
- back/close button
- інтеграція з confirm leave flow

## Data Layer

Потрібно винести завантаження active edit-entry із manager-компонентів.

### Поточна проблема

Зараз manager-и каталогів змішують:

- логіку списку
- логіку screen context
- логіку завантаження active edit-entry
- логіку modal lifecycle

Це треба розділити.

### Нова модель

Потрібен окремий data-access layer для edit route.

Рекомендована структура:

- `src/lib/catalog/edit/loadFilmEditEntry.ts`
- `src/lib/catalog/edit/loadGameEditEntry.ts`
- `src/lib/catalog/edit/types.ts`

### Відповідальність data loaders

- прийняти `viewId`
- завантажити запис із усіма потрібними пов’язаними даними
- повернути normalized model для edit shell

### Перевага

Route сам завантажує свій entry, без участі catalog manager-а.

## Navigation Contract

### Open

У catalog manager натискання на edit має робити тільки:

- `router.push("/films/view/[viewId]")`
- `router.push("/games/view/[viewId]")`

Без:

- `setSelectedView(...)`
- `replaceSelectedItemSearchParam(...)`
- refs типу `openingRouteSyncRef`

### Close In Modal Mode

Закриття modal route має працювати через router navigation:

- пріоритетно `router.back()`, якщо modal відкритий із каталогу

### Close In Page Mode

Для direct route або reload:

- `router.replace("/films")`
- `router.replace("/games")`

### Важливий принцип

Рішення про close behavior повинно жити на route boundary, а не в catalog manager-і.

## Leave / Dirty Guard Design

Dirty guard не повинен керувати modal lifecycle напряму.

Він повинен лише вирішувати:

- дозволити leave route
- заблокувати leave route

### Рекомендований контракт

Потрібен єдиний hook рівня:

- `useEditRouteLeaveGuard()`

Можлива структура:

- `src/lib/catalog/edit/useEditRouteLeaveGuard.ts`

### Відповідальність hook-а

- приймати `isDirty`
- надавати `requestClose()`
- показувати confirm, якщо є незбережені зміни
- при confirm виконувати переданий navigation action

### Використання

І в modal mode, і в page mode:

- натискання на `X`
- overlay click
- `Esc`
- browser back
- переходи на інші route

мають проходити через один і той самий leave contract.

### Важливий нюанс

Не треба реалізовувати guard через manual `history.forward()` або через відкат already-failed navigation.

Спершу має бути коректна route-native архітектура, а вже потім guard поверх неї.

## Catalog Managers After Refactor

### `FilmsManager.tsx`

Після рефактору в manager-і має залишитись:

- список фільмів
- фільтрація
- сортування
- пагінація
- screen context
- `router.push()` на edit route

Повинно зникнути:

- `selectedView` як modal state
- `openSelectedView()`
- `closeSelectedView()` як state/history orchestration
- `useCollectionEntryRouteSync()`
- refs для "opening/closing in progress"

### `GamesManager.tsx`

Та сама цільова структура, що і для films.

## `entryRouting.ts` After Refactor

Файл треба максимально спростити.

### Що лишити

- helper-и побудови route URL
- helper-и побудови href для `films` / `games`
- можливо shared route constants

### Що прибрати

- modal lifecycle logic
- history mutation logic
- route/local-state reconciliation
- `useCollectionEntryRouteSync`

### Можлива заміна

- `buildFilmViewHref(viewId: string)`
- `buildGameViewHref(viewId: string)`
- `buildFilmCatalogHref()`
- `buildGameCatalogHref()`

## Recommended File Structure

### Routes

- `src/app/films/page.tsx`
- `src/app/films/view/[viewId]/page.tsx`
- `src/app/films/@modal/default.tsx`
- `src/app/films/@modal/(.)view/[viewId]/page.tsx`
- `src/app/games/page.tsx`
- `src/app/games/view/[viewId]/page.tsx`
- `src/app/games/@modal/default.tsx`
- `src/app/games/@modal/(.)view/[viewId]/page.tsx`

### Edit UI

- `src/components/catalog/edit/CollectionEntryEditShell.tsx`
- `src/components/catalog/edit/CollectionEntryEditLayout.tsx`
- `src/components/catalog/edit/CollectionEntryEditModal.tsx`
- `src/components/catalog/edit/CollectionEntryEditPage.tsx`

### Data / Hooks

- `src/lib/catalog/edit/loadFilmEditEntry.ts`
- `src/lib/catalog/edit/loadGameEditEntry.ts`
- `src/lib/catalog/edit/useEditRouteLeaveGuard.ts`
- `src/lib/catalog/edit/types.ts`

### URL Helpers

- `src/lib/catalog/edit/routes.ts`

## Rollout Strategy

### Етап 1. Films First

Спочатку реалізувати повний новий flow лише для `films`.

Причина:

- менший ризик
- легше перевіряти
- після стабілізації можна повторити той самий патерн для `games`

### Етап 2. Extract Shared Pieces

Після того як `films` запрацює:

- виділити shared edit shell
- стабілізувати leave guard

### Етап 3. Migrate Games

Перенести нову архітектуру на `games` без повернення до старих sync-mechanism підходів.

### Етап 4. Cleanup

Після стабільної роботи:

- прибрати стару route-sync логіку
- прибрати старі refs/state helper-и
- прибрати мертвий код у manager-ах

## Verification Matrix

### Films

- `catalog -> open edit -> back`
- `catalog -> open edit -> close button`
- `catalog -> open edit -> Esc`
- `catalog -> open edit -> overlay click`
- `deep link -> edit page -> close`
- `dirty edit -> back -> cancel`
- `dirty edit -> back -> confirm`

### Games

- ті самі сценарії

### Platforms

- desktop
- mobile

## Non-Goals

У цьому рефакторі не варто одночасно братися за:

- `PersonHoverLink -> /api/tmdb/person/... 500/502`
- сторонні API-помилки
- unrelated screen context проблеми поза edit-flow

Це окремі задачі.

## Success Criteria

Рефактор вважається успішним, якщо:

- edit-форма відкривається тільки через route
- `browser back` стабільно закриває форму
- немає ручних `history.back()/forward()` у manager-логіці
- немає reconciliation між URL і локальним `selectedView`
- modal/page режими використовують один shared edit content
- desktop і mobile поводяться однаково

## Рекомендація До Реалізації

Починати не з partial patch у поточних manager-ах, а з нової route structure для `films`, після чого:

1. запустити standalone page mode
2. додати intercepted modal mode
3. додати dirty guard
4. повторити патерн для `games`

Це безпечніше, ніж далі латати поточний dual-state flow.
