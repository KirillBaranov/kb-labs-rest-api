# HTTP/2 Setup Guide

## Проблема

HTTP/1.1 имеет лимит **6 одновременных соединений** на домен. Когда открыто несколько вкладок с SSE (EventSource), соединения исчерпываются и новые HTTP запросы (XHR/fetch) висят в состоянии "pending".

**Пример:**
- 3 вкладки × 2 SSE соединения = 6 соединений
- HTTP/1.1 лимит = 6 соединений
- Новые запросы → ждут освобождения слотов → pending

## Решение: HTTP/2

HTTP/2 убирает лимит 6 соединений через **multiplexing** - много запросов идут через одно TCP соединение.

## Быстрый старт (Development)

### 1. Генерация самоподписанного сертификата

```bash
# Из корня kb-labs-rest-api
mkdir -p ssl

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout ssl/server.key \
  -out ssl/server.cert \
  -days 365 \
  -subj "/CN=localhost"
```

### 2. Обновление конфига

Добавь в `kb-labs.config.json`:

```json
{
  "restApi": {
    "http2": {
      "enabled": true,
      "allowHTTP1": true
    },
    "ssl": {
      "keyPath": "ssl/server.key",
      "certPath": "ssl/server.cert"
    }
  }
}
```

### 3. Запуск сервера

```bash
pnpm kb rest-api start
```

Увидишь в логах:
```
HTTP/2 enabled with HTTPS { allowHTTP1Fallback: true }
```

### 4. Обновление frontend URL

Измени URL в frontend с `http://localhost:5050` на `https://localhost:5050`.

Chrome покажет предупреждение о самоподписанном сертификате - нажми "Advanced" → "Proceed to localhost (unsafe)".

## Production Setup (Let's Encrypt)

### 1. Установка Certbot

```bash
sudo apt update
sudo apt install certbot
```

### 2. Генерация сертификата

```bash
# Останови сервер (certbot использует порт 80/443)
sudo certbot certonly --standalone -d your-domain.com
```

Сертификаты будут в:
- Key: `/etc/letsencrypt/live/your-domain.com/privkey.pem`
- Cert: `/etc/letsencrypt/live/your-domain.com/fullchain.pem`

### 3. Конфигурация

```json
{
  "restApi": {
    "http2": {
      "enabled": true,
      "allowHTTP1": true
    },
    "ssl": {
      "keyPath": "/etc/letsencrypt/live/your-domain.com/privkey.pem",
      "certPath": "/etc/letsencrypt/live/your-domain.com/fullchain.pem"
    }
  }
}
```

### 4. Автообновление сертификатов

```bash
# Certbot автоматически настраивает cron для обновления
sudo certbot renew --dry-run
```

## Альтернативные решения

Если не хочешь возиться с HTTPS/HTTP2, есть другие варианты:

### 1. Закрывать лишние вкладки (самое простое)

Просто держи 1-2 вкладки открытыми во время разработки.

### 2. SharedWorker для SSE (без HTTPS)

Все вкладки используют одно SSE соединение через SharedWorker.

### 3. Backend: лимит SSE на клиента

Автоматически закрывать старые SSE соединения при превышении лимита.

## Проверка HTTP/2

### В Chrome DevTools

1. Открой DevTools → Network
2. Правый клик на заголовки → показать "Protocol"
3. Должно быть: `h2` (HTTP/2) или `http/1.1`

### Curl

```bash
# HTTP/2
curl -I --http2 -k https://localhost:5050/api/v1/health

# Должно быть: HTTP/2 200
```

## Troubleshooting

### Сертификат не найден

```
HTTP/2 enabled but SSL certificates not found, falling back to HTTP/1.1
```

**Решение:** Проверь пути в конфиге:
```bash
ls -la ssl/server.key ssl/server.cert
```

### Chrome блокирует самоподписанный сертификат

**Решение:** Нажми "Advanced" → "Proceed to localhost (unsafe)".

Или запусти Chrome с флагом:
```bash
chrome --ignore-certificate-errors
```

### SSE не работает через HTTP/2

**Решение:** Убедись что `allowHTTP1: true` в конфиге - некоторые старые EventSource реализации могут требовать HTTP/1.1 fallback.

## Польза HTTP/2

- ✅ Убирает лимит 6 соединений
- ✅ Multiplexing - много запросов через 1 TCP соединение
- ✅ Header compression (меньше трафика)
- ✅ Server push
- ✅ 95%+ поддержка браузерами
- ✅ Индустриальный стандарт (все топовые сайты используют)

## Когда использовать

**Development:**
- Если много вкладок с SSE
- Если тестируешь production-like окружение

**Production:**
- Всегда (это best practice 2024 года)
