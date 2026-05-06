<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-e0234e?logo=nestjs&logoColor=white" alt="NestJS 11"/>
  <img src="https://img.shields.io/badge/PostgreSQL-Prisma%207-2d3748?logo=prisma&logoColor=white" alt="Prisma 7"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5"/>
  <img src="https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white" alt="Node.js 20"/>
</p>

<h1 align="center">Infinity — Backend</h1>

<p align="center">
  REST API для платформы <strong>Infinity Vault</strong> — облачное хранилище файлов и Kanban-доска в одном сервисе.
</p>

---

## Overview

**Infinity Backend** — это NestJS-приложение, предоставляющее полный API для SaaS-платформы Infinity Vault. Реализует:

- Cookie-based JWT аутентификацию с refresh-токенами и Google OAuth
- Облачное хранилище файлов поверх S3-совместимого Selectel Object Storage
- Kanban-доску с колонками, задачами и подзадачами
- Систему тарифных планов с квотами на хранилище и задачи
- Email-верификацию через Resend API

Является частью монорепозитория **Infinity Vault**:

| Сервис | Стек | Порт |
|---|---|---|
| **Backend** (этот репозиторий) | NestJS 11 · Prisma 7 · PostgreSQL | `4400` |
| **Frontend** | Angular 21 · PrimeNG 21 · TypeScript | `4200` |

---

## Features

### Auth
- Регистрация с верификацией email (6-значный код, 15 мин)
- Вход по username + password (argon2id хэширование)
- Google OAuth 2.0 (автосвязывание аккаунтов по email)
- Silent refresh — access token 15 мин, refresh token 7 дней в httpOnly cookie
- Глобальный rate limiting (30 req/60s), усиленный на auth-эндпоинтах

### File Storage
- Загрузка до 20 файлов за один запрос (до 100 МБ каждый)
- Иерархия папок с рекурсивным деревом
- Presigned URLs (24 ч) для безопасного доступа к файлам
- Публичные ссылки на файлы (без авторизации)
- Скачивание папок как ZIP-архив
- Inline-проксирование файлов для предпросмотра в браузере

### Kanban (Infinity Life)
- Создание пользовательских колонок
- Задачи с приоритетом (High/Medium/Low), дедлайном, цветовой меткой и описанием
- Подзадачи с inline прогресс-баром
- Перемещение задач между колонками

### Plans & Quotas

| Тариф | Хранилище | Задачи | Срок |
|---|---|---|---|
| **Spark** | 5 ГБ | до 30 | 7 дней (пробный) |
| **Pulse** | 250 ГБ | ∞ | Ежемесячно |
| **Horizon** | 1 ТБ | ∞ | Ежегодно |
| **Eternal** | 1 ТБ | ∞ | Бессрочно |

- Автозаморозка истёкших Spark-аккаунтов (cron каждый час)
- Удаление данных через 14 дней после заморозки
- Промокоды для активации планов

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- S3-совместимое хранилище (Selectel или любое другое)
- Аккаунт Resend для отправки email
- Google OAuth credentials

### Install & run

```bash
cd Infinity-backend/infinity
npm install
npx prisma generate
npm run start:dev
```

API будет доступен на `http://localhost:4400`.  
Swagger UI — на `http://localhost:4400/api/docs`.

### Environment variables

Создайте файл `.env` в директории проекта:

```env
# App
NODE_ENV=development
APPLICATION_PORT=4400
APPLICATION_URL=http://localhost:4400
ALLOWED_ORIGIN=http://localhost:4200

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/infinity

# JWT
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# S3 / Selectel
SELECTEL_POOL=your-pool
SELECTEL_ENDPOINT=https://s3.selcdn.ru
SELECTEL_ACCESS_KEY=your-access-key
SELECTEL_SECRET_KEY=your-secret-key
SELECTEL_BUCKET=your-bucket

# Email (Resend)
RESEND_API_KEY=re_your_key
MAIL_FROM=noreply@your-domain.com

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4400/auth/google/callback

# Admin
ADMIN_EMAILS=admin@example.com,another@example.com
```

### Database migrations

```bash
npx prisma migrate dev --name init
```

---

## API Documentation

После запуска сервера Swagger UI доступен по адресу:

```
http://localhost:4400/api/docs
```

### Endpoints overview

#### Auth `/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Регистрация (5 req/min) |
| POST | `/auth/verify-email` | — | Верификация email (10 req/min) |
| POST | `/auth/resend-code` | — | Повторная отправка кода (3 req/min) |
| POST | `/auth/login` | — | Вход (5 req/min) |
| POST | `/auth/refresh` | Cookie | Обновление access-токена |
| GET | `/auth/google` | — | OAuth Google — редирект |
| GET | `/auth/google/callback` | Google | OAuth Google — callback |
| POST | `/auth/logout` | Cookie | Выход |

#### User `/user`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/user/profile` | JWT | Получить профиль |
| PATCH | `/user/updateProfile` | JWT | Обновить username/email |
| PATCH | `/user/changePassword` | JWT | Сменить пароль |
| POST | `/user/createAvatar` | JWT | Загрузить аватар |

#### File System `/file-system`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/file-system/uploadFile` | JWT | Загрузить файлы (до 20) |
| POST | `/file-system/createFolder` | JWT | Создать папку |
| GET | `/file-system/tree` | JWT | Дерево папок и файлов |
| GET | `/file-system/files` | JWT | Файлы в корне |
| GET | `/file-system/files/:folderId` | JWT | Файлы в папке |
| GET | `/file-system/download/:id` | JWT | Скачать файл |
| GET | `/file-system/download-folder/:folderId` | JWT | Скачать папку как ZIP |
| GET | `/file-system/proxy/:id` | JWT | Проксировать файл (предпросмотр) |
| PATCH | `/file-system/rename/:id` | JWT | Переименовать файл/папку |
| PATCH | `/file-system/move/:id` | JWT | Переместить файл |
| DELETE | `/file-system/delete/:id` | JWT | Удалить файл/папку |
| GET | `/file-system/share/:username/:filename` | — | Метаданные публичного файла |
| GET | `/file-system/share/download/:username/:filename` | — | Скачать публичный файл |

#### Infinity Life `/infinity-life`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/infinity-life/tasks` | JWT | Все задачи |
| POST | `/infinity-life/tasks` | JWT | Создать задачу |
| PATCH | `/infinity-life/tasks/:taskId` | JWT | Обновить задачу |
| PATCH | `/infinity-life/tasks/:taskId/toggle` | JWT | Переключить выполнение |
| PATCH | `/infinity-life/tasks/:taskId/move` | JWT | Переместить в колонку |
| DELETE | `/infinity-life/tasks/:taskId` | JWT | Удалить задачу |
| POST | `/infinity-life/subtasks` | JWT | Создать подзадачу |
| PATCH | `/infinity-life/subtasks/:subtaskId/toggle` | JWT | Переключить подзадачу |
| DELETE | `/infinity-life/subtasks/:subtaskId` | JWT | Удалить подзадачу |
| GET | `/infinity-life/columns` | JWT | Все колонки |
| POST | `/infinity-life/columns` | JWT | Создать колонку |
| PATCH | `/infinity-life/columns/:columnId` | JWT | Переименовать колонку |
| DELETE | `/infinity-life/columns/:columnId` | JWT | Удалить колонку |

#### Plan `/plan`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/plan/info` | JWT | Информация о плане и хранилище |
| POST | `/plan/activate-promo` | JWT | Активировать промокод |
| POST | `/plan/admin/generate-promo` | JWT + Admin | Сгенерировать промокоды |

---

## Authentication

API использует **cookie-based JWT аутентификацию**:

- `access_token` — httpOnly cookie, живёт 15 минут
- `refresh_token` — httpOnly cookie, живёт 7 дней

Для работы в dev-режиме фронтенд должен отправлять запросы с `withCredentials: true`, а оба сервиса должны работать на одном хосте (`localhost`).

---

## Project Structure

```
src/
├── auth/               # JWT + Google OAuth, верификация email
│   ├── DTO/
│   ├── guards/
│   └── strategies/
├── user/               # Профиль, аватар, смена пароля
│   └── DTO/
├── file-system/        # Файлы, папки, S3-хранилище
│   └── DTO/
├── infinity-life/      # Kanban: задачи, подзадачи, колонки
│   └── DTO/
├── plan/               # Тарифы, промокоды, квоты
│   ├── DTO/
│   ├── guards/
│   └── interfaces/
├── mail/               # Email через Resend
├── services/           # StorageService (S3)
├── prisma-database/    # PrismaClient singleton
├── app.module.ts
└── main.ts

prisma/
└── schema.prisma       # Схема БД
```

---

## Commands

```bash
npm run start:dev       # Запуск в watch-режиме
npm run build           # Сборка в dist/
npm run start:prod      # Запуск production-сборки
npm test                # Unit-тесты (Jest)
npm run test:e2e        # E2E-тесты
npm run lint            # ESLint с автофиксом
npm run format          # Prettier
npx prisma generate     # Регенерация Prisma Client
npx prisma migrate dev  # Создание миграции
```

---

## Docker

```bash
docker build -t infinity-backend .
docker run -p 4400:4400 --env-file .env infinity-backend
```

Dockerfile выполняет двухэтапную сборку (Node 20 Alpine): `prisma generate` → `nest build` → production-образ.

---

## Tech Stack

- **NestJS 11** — модульный фреймворк
- **Prisma 7** + **pg** — ORM с нативным PostgreSQL-адаптером
- **Passport.js** — JWT и Google OAuth стратегии
- **argon2** — хэширование паролей
- **@aws-sdk/client-s3** — S3-совместимое хранилище (Selectel)
- **archiver** — генерация ZIP-архивов на лету
- **Resend** — транзакционные email
- **@nestjs/swagger** — Swagger / OpenAPI документация
- **@nestjs/throttler** — rate limiting
- **@nestjs/schedule** — cron-задачи
