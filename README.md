# KB Labs REST API

REST API сервис для KB Labs CLI инструментов — единый HTTP-слой поверх CLI (audit, release, devlink, mind, analytics).

## 🎯 Цели

- Предоставить Studio и внешним клиентам единый REST-слой поверх CLI инструментов
- Обеспечить стабильные контракты (DTO + error model), очереди задач и детерминируемые артефакты
- Быть расширяемым (адаптеры/плагины), безопасным (auth+RBAC), наблюдаемым (логинг/метрики), воспроизводимым (mock mode)

## 🚀 Quick Start

```bash
# Установить зависимости
pnpm install

# Собрать пакеты
pnpm build

# Запустить сервер
cd apps/rest-api
pnpm start
# или
pnpm dev  # с hot reload
```

Сервер запустится на `http://localhost:3001` (по умолчанию).

## 📁 Структура

```
kb-labs-rest-api/
├── apps/
│   └── rest-api/              # Fastify приложение
│       ├── src/
│       │   ├── server.ts       # Настройка Fastify
│       │   ├── bootstrap.ts   # Запуск сервера
│       │   ├── routes/         # Маршруты
│       │   ├── middleware/     # Middleware (envelope, request-id, mock-mode)
│       │   ├── plugins/        # Fastify plugins (CORS, rate-limit)
│       │   └── services/       # Service factory
│       └── package.json
├── packages/
│   └── rest-api-core/         # @kb-labs/rest-api-core (public)
│       └── src/
│           ├── contracts/     # Zod схемы запрос/ответ
│           ├── ports/         # Интерфейсы (CliPort, StoragePort, QueuePort, AuthPort)
│           ├── adapters/      # Реализации (CLI, FS storage, memory queue, none auth)
│           ├── services/      # Бизнес-логика (AuditService, ReleaseService, etc.)
│           ├── jobs/          # Job executors
│           ├── config/        # Конфигурация (schema + loader)
│           ├── mocks/         # Mock данные
│           └── utils/         # Утилиты
└── kb-labs.config.json         # Конфигурация (секция rest)
```

## ⚙️ Конфигурация

Конфигурация загружается из `kb-labs.config.json` и переменных окружения (KB_REST_*):

```json
{
  "rest": {
    "port": 3001,
    "basePath": "/api/v1",
    "apiVersion": "1.0.0",
    "auth": {
      "mode": "none"
    },
    "queue": {
      "driver": "memory",
      "maxConcurrent": {
        "audit": 2,
        "release": 1,
        "devlink": 2
      }
    },
    "cli": {
      "bin": "pnpm",
      "prefix": ["kb"],
      "timeoutSec": 900
    },
    "storage": {
      "driver": "fs",
      "baseDir": ".kb/rest"
    },
    "mockMode": false,
    "cors": {
      "origins": ["http://localhost:3000"]
    }
  }
}
```

### Переменные окружения

- `KB_REST_PORT` — порт сервера
- `KB_REST_BASE_PATH` — базовый путь API
- `KB_REST_AUTH_MODE` — режим аутентификации (none/jwt/apiKey)
- `KB_REST_QUEUE_DRIVER` — драйвер очереди (memory/bullmq)
- `KB_REST_STORAGE_DRIVER` — драйвер хранилища (fs/s3)
- `KB_REST_MOCK_MODE` — включить mock mode (true/1)

## 📡 API Endpoints

### Health & System

- `GET /api/v1/health/live` — проверка доступности сервера
- `GET /api/v1/health/ready` — проверка готовности (queue/FS/CLI)
- `GET /api/v1/info` — информация о сервере (cwd, profiles, plugins, apiVersion)
- `GET /api/v1/info/capabilities` — доступные команды и адаптеры
- `GET /api/v1/config` — конфигурация (redacted, маскирует секреты)
- `GET /openapi.json` — OpenAPI спецификация

### Audit

- `POST /api/v1/audit/run` — запустить аудит (асинхронно, возвращает jobId/runId)
  - Поддерживает `Idempotency-Key` header
- `GET /api/v1/audit/runs` — список запусков (cursor pagination: `?cursor&limit&status&since`)
- `GET /api/v1/audit/runs/:runId` — статус конкретного запуска
- `GET /api/v1/audit/report/latest` — последний отчет
- `GET /api/v1/audit/summary` — агрегированная сводка

### Release

- `POST /api/v1/release/preview` — предпросмотр релиза (синхронно)
- `POST /api/v1/release/run` — запустить релиз (асинхронно)
  - Поддерживает `Idempotency-Key` header
- `GET /api/v1/release/runs/:runId` — статус запуска
- `GET /api/v1/release/changelog` — changelog (поддерживает `?format=markdown|json`)

### DevLink

- `POST /api/v1/devlink/check` — проверить DevLink (асинхронно)
  - Поддерживает `Idempotency-Key` header
- `GET /api/v1/devlink/summary` — сводка (cycles, mismatches)
- `GET /api/v1/devlink/graph` — граф зависимостей

### Mind

- `GET /api/v1/mind/summary` — сводка (freshness, drift)

### Analytics

- `GET /api/v1/analytics/summary` — сводка за период (`?start&end`)

### Jobs

- `GET /api/v1/jobs/:jobId` — статус задачи
- `GET /api/v1/jobs/:jobId/logs` — логи задачи (с пагинацией `?offset`)
- `GET /api/v1/jobs/:jobId/logs/stream` — SSE поток логов
- `POST /api/v1/jobs/:jobId/cancel` — отменить задачу

## 📝 Формат ответов

Все ответы в едином envelope формате:

```json
// Успех
{
  "ok": true,
  "data": { ... },
  "meta": {
    "requestId": "01JC3N9F5H7V6Q5X9X0W4ZC3YF",
    "durationMs": 12,
    "schemaVersion": "1.0.0"
  }
}

// Ошибка
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation error",
    "details": { ... },
    "cause": "..."
  },
  "meta": {
    "requestId": "...",
    "durationMs": 3
  }
}
```

## 🔐 Безопасность (MVP)

- **Auth mode**: `none` по умолчанию (для локальной разработки)
- **RBAC**: Заготовлены роли `viewer` / `operator` / `admin` (заглушка)
- **CLI Sandbox**: Whitelist команд, запрет `cwd` вне repo root, защита от path traversal
- **Rate limiting**: 60 req/sec по умолчанию
- **CORS**: Настраивается через конфиг

## 🧪 Mock Mode

Mock mode позволяет возвращать детерминированные ответы без выполнения реальных CLI команд:

- **Глобальный**: `mockMode: true` в конфиге
- **Per-request**: Header `KB-Mock: true`

```bash
# Пример с per-request mock
curl -H "KB-Mock: true" http://localhost:3001/api/v1/audit/summary
```

## 📚 Примеры использования

### Запуск аудита

```bash
# Запустить аудит
curl -X POST http://localhost:3001/api/v1/audit/run \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-key-123" \
  -d '{"scope":"packages/*","strict":true}'

# Ответ:
# {
#   "ok": true,
#   "data": {"runId": "...", "jobId": "..."},
#   "meta": {...}
# }
```

### Проверка статуса задачи

```bash
# Получить статус
curl http://localhost:3001/api/v1/jobs/01JC3N9F5H7V6Q5X9X0W4ZC3YF

# Ответ:
# {
#   "ok": true,
#   "data": {
#     "jobId": "...",
#     "status": "completed",
#     "startedAt": "...",
#     "finishedAt": "..."
#   }
# }
```

### Просмотр логов (SSE)

```bash
# SSE stream логов
curl -N http://localhost:3001/api/v1/jobs/01JC3N9F5H7V6Q5X9X0W4ZC3YF/logs/stream
```

### Предпросмотр релиза

```bash
curl -X POST http://localhost:3001/api/v1/release/preview \
  -H "Content-Type: application/json" \
  -d '{"strategy":"independent"}'
```

## 🛠️ Разработка

```bash
# Установить зависимости
pnpm install

# Собрать все пакеты
pnpm build

# Проверить типы
pnpm type-check

# Запустить линтер
pnpm lint

# Запустить тесты
pnpm test

# Запустить в dev режиме
pnpm dev
```

## 📦 Пакеты

- **@kb-labs/rest-api-core** — Core бизнес-логика, порты, адаптеры, сервисы
- **@kb-labs/rest-api-app** — Fastify приложение (private)

## 🧩 Расширяемость

### Порты и адаптеры

- **CliPort**: Исполнение CLI команд (реализация: `ExecaCliAdapter`)
- **StoragePort**: Хранение артефактов (реализация: `FsStorageAdapter`)
- **QueuePort**: Очередь задач (реализация: `MemoryQueueAdapter`)
- **AuthPort**: Аутентификация/авторизация (реализация: `NoneAuthAdapter`)

### Плагины

Плагины загружаются через конфиг (`rest.plugins`):

```json
{
  "rest": {
    "plugins": ["@kb-labs/plugin-example"]
  }
}
```

Каждый плагин экспортирует:
```typescript
interface RestApiPlugin {
  manifest: { api: string; name: string };
  routes?: (fastify: FastifyInstance) => void;
  services?: Record<string, unknown>;
}
```

## 📋 Принятые решения (ADR)

- **ADR-0001**: Архитектура и структура репозитория
- **ADR-0002**: Плагины и расширяемость
- **ADR-0003**: Границы пакетов и модулей
- **ADR-0004**: Версионирование и политика релизов

## 🔮 Дорожная карта (после MVP)

- [ ] S3 StoragePort для артефактов
- [ ] BullMQ QueuePort + Redis (персистентные задачи)
- [ ] JWT/API Key Auth адаптеры
- [ ] Release safeguards: require audit.overall.ok=true или --force
- [ ] Streaming logs через SSE/WebSocket (реализовано частично)
- [ ] Rate limiting per-route + burst control
- [ ] Prometheus metrics + OTEL трассировка
- [ ] Плагины 1-й партии: changelog, security

## 📄 Лицензия

MIT © KB Labs
