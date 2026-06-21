# План: збереження screen context для catalog flows

## Проблема

Зараз частина UI-стану catalog screens живе тільки в локальному React state менеджерів, а частина - у query params. Через це будь-який route-level transition на тому самому екрані може:

- перевантажити грід;
- скинути пошук і фільтри;
- повернути список до початкового стану;
- змусити користувача заново відновлювати контекст після закриття картки або переходу між пов'язаними екранами.

Найпомітніший симптом зараз: відкриття і закриття edit/view картки через `?view=` викликає URL navigation через Next router, після чого злітає контекст `games` і `films`.

## Ціль

Побудувати єдиний патерн для catalog screens:

- `view` лишається в URL, щоб були прямі лінки на картку;
- query param оновлюється без Next navigation, через History API;
- screen context екрана живе в screen-store і переживає remount, back/forward та повернення на екран;
- користувач після закриття картки або повернення на екран бачить той самий пошук, ті самі фільтри, той самий режим і той самий список, де зупинився.

## Принципи

1. Якщо дія не міняє екран у користувацькому сенсі, вона не повинна скидати screen context.
2. Deep-linkable state і ephemeral UI state треба розділити.
3. URL використовується для sharable state.
4. Screen-store використовується для runtime context, який не повинен губитися між переходами.
5. Один і той самий контракт має працювати для `games`, `films` і наступних catalog-like screens.

## Модель стану

### 1. URL state

У URL зберігається тільки те, що має сенс ділити лінком або відновлювати напряму:

- `view`
- `item`
- `addItem`

Оновлення цих параметрів виконується через `window.history.replaceState(...)`, а не через `router.replace(...)`, якщо користувач лишається на тому самому screen.

### 2. Screen context state

У screen-store зберігається весь контекст конкретного catalog screen:

- `appliedFilters`
- `pendingFilters`
- `toolbarQueryDraft`
- `hasApplied`
- `page`
- `hasMore`
- `totalCount`
- `viewMode`, якщо екран його підтримує
- локальні UI-прапори, які мають сенс відновлювати
- `scrollY` або інший scroll anchor
- службові snapshot/meta-поля для коректного restore

Список вище - цільовий контракт. На першому етапі можна відновлювати тільки те, що критично для UX, але структура store повинна одразу підтримувати повний екранний контекст.

## Архітектура

### Shared screen-store

Потрібен shared механізм на рівні `src/lib` або `src/components/catalog`, який:

- будує `screenKey`;
- віддає `load(screenKey)`;
- віддає `save(screenKey, snapshot)`;
- віддає `clear(screenKey)`, якщо це потрібно явно;
- серіалізує snapshot у `sessionStorage`;
- працює тільки на клієнті;
- має захист від битих або несумісних snapshot-ів.

### Ключ screen context

`screenKey` має враховувати не тільки маршрут, а й контекст власника/режиму, щоб не змішувати різні екрани:

- тип екрана: `games` / `films`
- `ownerUserId`, якщо екран відкритий для друга
- `readOnly`
- додаткові routing dimensions, якщо вони змінюють семантику екрана

Приклад ідеї ключа:

```text
catalog-screen:games:self
catalog-screen:games:friend:<ownerUserId>
catalog-screen:films:self
catalog-screen:films:friend:<ownerUserId>
```

### History-based URL sync

У shared routing helper треба відокремити:

- navigation між екранами;
- локальне оновлення query params на тому самому екрані.

Для modal/open-state на поточному screen:

- використовувати `history.replaceState`;
- не викликати Next router;
- не створювати route transition;
- не тригерити перевідкриття screen-level logic.

Для реальних переходів на інші екрани поточний navigation flow лишається без змін.

## Цільові зони змін

### 1. Shared routing helpers

Оновити `src/lib/collection/entryRouting.ts`:

- винести helper для safe query-param replace через History API;
- зберегти поточний контракт `view/item/addItem`;
- не використовувати `router.replace` для локального modal state;
- перевірити, що `useRequestedCollectionViewSync` коректно працює після переходу на history-based sync.

### 2. Games screen

Оновити `src/app/games/GamesManager.tsx`:

- підключити screen-store;
- відновлювати snapshot до initial fetch;
- не ініціалізувати screen через `DEFAULT_FILTERS`, якщо є валідний snapshot;
- зберігати snapshot при зміні пошуку, фільтрів, пагінації, view mode, scroll;
- не скидати screen context при open/close modal;
- перевірити інтеграцію з lazy loading і `fetchPage`.

### 3. Films screen

Оновити `src/app/films/FilmsManager.tsx`:

- зробити той самий контракт, що і для `games`;
- окремо врахувати `viewMode === "directors"`;
- не ламати direct open через `?view=`;
- відновлювати список і контекст без повторного користувацького пошуку.

### 4. Shared catalog layer

За потреби додати shared abstractions:

- `useCatalogScreenContext(...)`
- `buildCatalogScreenKey(...)`
- тип `CatalogScreenSnapshot<TFilters>`

Завдання цього шару - прибрати дублювання логіки між `GamesManager` і `FilmsManager` та зафіксувати єдиний контракт для наступних екранів.

## Порядок впровадження

### Етап 1. URL sync без route transition

- перевести `view/item/addItem` на History API;
- переконатися, що відкриття і закриття картки більше не викликає відчуття reload;
- перевірити direct open по URL після повного browser refresh.

### Етап 2. Screen-store

- реалізувати shared storage layer на `sessionStorage`;
- описати тип snapshot;
- зробити versioning snapshot-ів, щоб безпечно міняти схему;
- відновлювати snapshot під час mount екрана.

### Етап 3. Інтеграція з `games`

- зберігати search/filter/page/scroll context;
- уникнути initial reset до `DEFAULT_FILTERS`, якщо є snapshot;
- перевірити сценарії open modal, close modal, back, forward, refresh.

### Етап 4. Інтеграція з `films`

- повторити патерн;
- окремо перевірити `directors` mode;
- перевірити lazy loading і повернення до попереднього scroll position.

### Етап 5. Поширення патерну

- винести lessons learned у shared contract;
- оцінити наступні екрани, де контекст теж губиться;
- переводити їх на той самий механізм замість локальних ad-hoc рішень.

## Відновлення scroll

Для повного UX restore треба явно зберігати позицію списку:

- або через `window.scrollY`;
- або через якірний item + offset;
- або через окремий ref-based scroll container snapshot.

Базовий варіант для першого проходу:

- зберігати `window.scrollY`;
- відновлювати його після того, як екран відновив список;
- не робити restore раніше, ніж дані для грида відрендерені.

## Що не повинно потрапляти в screen-store

- transient modal internals, які не впливають на screen context;
- серверні дані, які легко перевантажити без втрати UX;
- речі, які мають бути derived від інших state-полів;
- великі масиви даних, якщо достатньо відновити лише query/filter/page і дати гріду добрати дані штатно.

## Ризики

### 1. Розсинхронізація URL і store

Потрібно чітко визначити, що є джерелом правди:

- URL для `view/item/addItem`;
- screen-store для screen context;
- manager state як runtime-проєкція відновленого snapshot.

### 2. Застарілі snapshot-и

Потрібні:

- `version` у snapshot;
- захист від parse errors;
- fallback до safe defaults.

### 3. Restore занадто рано

Якщо scroll або page restore спрацює до того, як список готовий, UX буде нестабільний. Потрібна явна фаза:

- restore state;
- hydrate collection;
- restore scroll.

### 4. Надмірне дублювання

Якщо реалізувати `games` і `films` окремо без shared contract, системна проблема повернеться на наступних екранах.

## Критерії успіху

Після реалізації користувач повинен мати такий досвід:

1. Виставив пошук і фільтри.
2. Відкрив картку на перегляд або редагування.
3. Закрив картку без змін.
4. Побачив той самий грід, той самий пошук, той самий scroll і той самий контекст.

Додатково:

- direct open по `?view=` працює;
- browser refresh з відкритою карткою працює;
- back/forward не ламає контекст;
- контекст `games` не змішується з `films`;
- контекст свого екрана не змішується з friend read-only screen.
- у search modal для `addItem`, якщо гра або фільм уже є в колекції, відповідний result item підсвічується як existing;
- клік по такому result item відкриває існуючу картку запису на перегляд/редагування, а не draft-форму повторного додавання;
- add-flow не повинен дозволяти користувачу піти в сценарій дубльованого додавання для тайтлу, який уже є в колекції;
- цей контракт має бути однаковим для `games` і `films`.

## Мінімальний технічний контракт

Потрібно додати:

- shared helper для query replace через History API;
- shared storage layer для screen snapshots;
- shared тип snapshot;
- інтеграцію в `GamesManager`;
- інтеграцію в `FilmsManager`.

## Рекомендований результат після цього етапу

Після цього етапу проблема "закрив картку - втратив усе" має зникнути не як локальний фікс, а як наслідок нового screen-state контракту.

Якщо після впровадження цього патерну залишаться окремі сценарії зі збитим контекстом, їх уже варто розбирати як точкові дефекти поверх правильної базової архітектури, а не як симптом відсутності системного підходу.
