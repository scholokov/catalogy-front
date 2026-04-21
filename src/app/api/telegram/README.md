# Telegram Debug

## Debug endpoints

- `GET /api/telegram/webhook-info`
- `POST /api/telegram/set-webhook`

Обидва endpoints захищені bearer-secret:

- `TELEGRAM_ADMIN_SECRET`, якщо заданий
- інакше fallback на `TELEGRAM_DELIVERY_SECRET`

## Перевірити поточний webhook

```bash
curl -X GET "https://<your-app>/api/telegram/webhook-info" ^
  -H "Authorization: Bearer <TELEGRAM_ADMIN_SECRET_OR_DELIVERY_SECRET>"
```

Що дивитись у відповіді:

- `info.url` має дорівнювати `https://<your-app>/api/telegram/webhook`
- `info.pending_update_count` показує, чи Telegram накопичує updates
- `info.last_error_message` підкаже, чому Telegram не може достукатись

## Виставити webhook

```bash
curl -X POST "https://<your-app>/api/telegram/set-webhook" ^
  -H "Authorization: Bearer <TELEGRAM_ADMIN_SECRET_OR_DELIVERY_SECRET>" ^
  -H "Content-Type: application/json" ^
  -d "{\"webhookUrl\":\"https://<your-app>/api/telegram/webhook\",\"dropPendingUpdates\":false}"
```

## Мінімальний debug flow

1. Перевір `GET /api/telegram/webhook-info`
2. Якщо `info.url` порожній або неправильний, виклич `POST /api/telegram/set-webhook`
3. Натисни `Підключити Telegram` у `Settings`
4. У боті натисни `Start`
5. Знову перевір `webhook-info`
6. Якщо є `last_error_message`, проблема майже точно в URL / HTTPS / secret header
