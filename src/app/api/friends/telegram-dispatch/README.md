# Telegram Dispatch

POST `/api/friends/telegram-dispatch`

## Призначення

Обробляє `pending/failed` записи з `friend_notification_deliveries` для каналу `telegram`
і відправляє повідомлення через Telegram Bot API.

## Потрібні env

- `SUPABASE_URL` або `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_DELIVERY_SECRET`

## Авторизація

Один із варіантів:

- `Authorization: Bearer <TELEGRAM_DELIVERY_SECRET>`
- `x-telegram-delivery-secret: <TELEGRAM_DELIVERY_SECRET>`

## Body

```json
{
  "limit": 20,
  "dryRun": false
}
```

## Рекомендований запуск

- найкраще для поточної архітектури: Supabase Cron викликає цей endpoint кожні 1-5 хвилин
- для перевірки можна запускати з `dryRun: true`

## Supabase Cron

### Варіант 1: через Dashboard

- у Supabase `Cron` створи `HTTP request`
- method: `POST`
- url: `https://<your-app>/api/friends/telegram-dispatch`
- header:
  - `Authorization: Bearer <TELEGRAM_DELIVERY_SECRET>`
  - `Content-Type: application/json`
- body:

```json
{
  "limit": 20,
  "dryRun": false
}
```

### Варіант 2: через SQL helper

Після міграції доступна функція `request_telegram_dispatch(...)`.

Приклад manual виклику:

```sql
select request_telegram_dispatch(
  'https://<your-app>/api/friends/telegram-dispatch',
  '<TELEGRAM_DELIVERY_SECRET>',
  20,
  false
);
```

Приклад cron job:

```sql
select cron.schedule(
  'telegram-dispatch-every-minute',
  '* * * * *',
  $$
  select request_telegram_dispatch(
    'https://<your-app>/api/friends/telegram-dispatch',
    '<TELEGRAM_DELIVERY_SECRET>',
    20,
    false
  );
  $$
);
```
