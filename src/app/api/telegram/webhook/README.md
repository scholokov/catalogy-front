# Telegram Webhook

POST `/api/telegram/webhook`

## Призначення

Обробляє Telegram bot updates для automatic binding через `/start <token>`.

## Потрібні env

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `SUPABASE_URL` або `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Flow

- користувач у `Settings -> Telegram` генерує одноразовий token
- відкриває бота через deep-link або шле `/start <token>`
- webhook знаходить активний `telegram_link_tokens.token`
- записує `profiles.telegram_chat_id`
- вмикає `profiles.telegram_notifications_enabled`
- позначає token як використаний

## Webhook setup

- Telegram webhook URL: `https://<your-app>/api/telegram/webhook`
- secret header: `x-telegram-bot-api-secret-token = <TELEGRAM_WEBHOOK_SECRET>`
