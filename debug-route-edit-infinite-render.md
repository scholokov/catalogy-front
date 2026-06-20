# Debug Session: route-edit-infinite-render

- Status: OPEN
- Symptom: після 2 циклів `open -> close` на 3 відкритті форма зависає на нескінченному `Rendering...`; симптом проявляється в різних розділах після останніх route-driven змін.
- Expected: кожне відкриття edit route стабільно монтує форму без нескінченного рендерінгу.

## Hypotheses

1. Один із route wrapper-ів (`FilmEditRoute` / `GameEditRoute` / `GameGenreEditRoute`) потрапляє в цикл `loading -> entry -> rerender -> loading`.
2. `edit-only` гілка manager-а оновлює локальний state з `prefetchedSelectedView` у `useEffect`, що повторно тригерить route shell або leave guard.
3. `useEditRouteLeaveGuard()` або `onEditDirtyChange` створює замкнений цикл між wrapper-ом і вкладеним editor-ом після кількох mount/unmount.
4. Intercepted route slot після кількох відкриттів лишає background tree у проміжному стані, і один із `useSelectedLayoutSegment`/route effects починає безкінечно ремоунтити edit UI.
5. Новий `genres`/shared shell код проявив already-hidden проблему в загальному shared edit layer, тому симптом видно в різних розділах.

## Plan

1. Додати instrumentation у shared edit shell, route wrappers, leave guard і `edit-only` hydration effects у manager-ах.
2. Відтворити сценарій `open -> close -> open -> close -> open`.
3. Зіставити логи з гіпотезами.
4. Внести мінімальний fix лише після підтвердження root cause.
