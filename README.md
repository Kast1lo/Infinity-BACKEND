<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-e0234e?logo=nestjs&logoColor=white" alt="NestJS 11"/>
  <img src="https://img.shields.io/badge/PostgreSQL-Prisma%207-2d3748?logo=prisma&logoColor=white" alt="Prisma 7"/>
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5"/>
  <img src="https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white" alt="Node.js 20"/>
</p>

<h1 align="center">Infinity — Backend</h1>

<p align="center">
  REST API for the <strong>Infinity</strong> platform — cloud file storage and Kanban board in one service.
</p>

---

## Overview

**Infinity Backend** is a NestJS application that provides the full API for the Infinity platform. It covers:

- Cookie-based JWT authentication with refresh tokens and Google OAuth
- Cloud file storage backed by Selectel S3-compatible Object Storage
- Kanban board with columns, tasks, and subtasks
- Subscription plan system with storage and task quotas
- Email verification via Resend API

Part of the **Infinity** monorepo:

| Service | Stack | Port |
|---|---|---|
| **Backend** (this repo) | NestJS 11 · Prisma 7 · PostgreSQL | `4400` |
| **Frontend** | Angular 21 · PrimeNG 21 · TypeScript | `4200` |

---

## Features

### Auth
- Registration with email verification (6-digit code, 15-minute expiry)
- Login with username + password (argon2id hashing)
- Google OAuth 2.0 (auto-links to existing accounts by email)
- Silent token refresh — access token 15 min, refresh token 7 days in httpOnly cookie
- Global rate limiting (30 req/60s) with stricter limits on auth endpoints

### File Storage
- Upload up to 20 files per request (up to 100 MB each)
- Nested folder hierarchy with recursive tree
- Presigned URLs (24 h) for secure file access
- Public file sharing links (no auth required)
- Download entire folders as ZIP archives
- File proxying for inline browser previews

### Kanban (Infinity Life)
- Custom user-defined columns
- Tasks with priority (High / Medium / Low), deadline, color label, and description
- Subtasks with inline progress tracking
- Move tasks between columns

### Plans & Quotas

| Plan | Storage | Tasks | Duration |
|---|---|---|---|
| **Spark** | 5 GB | up to 30 | 7-day free trial |
| **Pulse** | 250 GB | unlimited | Monthly |
| **Horizon** | 1 TB | unlimited | Annual |
| **Eternal** | 1 TB | unlimited | Lifetime |

- Automatic freeze of expired Spark accounts (hourly cron)
- Data deletion 14 days after freeze
- Promo codes for plan activation

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- S3-compatible storage (Selectel or any other provider)
- Resend account for transactional email
- Google OAuth credentials

### Install & run

```bash
cd Infinity-backend/infinity
npm install
npx prisma generate
npm run start:dev
```

The API will be available at `http://localhost:4400`.  
Swagger UI is at `http://localhost:4400/api/docs`.

### Environment variables

Create a `.env` file in the project directory:

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
ADMIN_EMAILS=admin@example.com
```

### Database migrations

```bash
npx prisma migrate dev --name init
```

---

## API Documentation

Once the server is running, Swagger UI is available at:

```
http://localhost:4400/api/docs
```

### Endpoints overview

#### Auth `/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register a new user (5 req/min) |
| POST | `/auth/verify-email` | — | Verify email with 6-digit code (10 req/min) |
| POST | `/auth/resend-code` | — | Resend verification code (3 req/min) |
| POST | `/auth/login` | — | Login (5 req/min) |
| POST | `/auth/refresh` | Cookie | Refresh access token |
| GET | `/auth/google` | — | Initiate Google OAuth |
| GET | `/auth/google/callback` | Google | Google OAuth callback |
| POST | `/auth/logout` | Cookie | Logout and clear cookies |

#### User `/user`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/user/profile` | JWT | Get current user profile |
| PATCH | `/user/updateProfile` | JWT | Update username / email |
| PATCH | `/user/changePassword` | JWT | Change password |
| POST | `/user/createAvatar` | JWT | Upload avatar image |

#### File System `/file-system`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/file-system/uploadFile` | JWT | Upload files (up to 20) |
| POST | `/file-system/createFolder` | JWT | Create a folder |
| GET | `/file-system/tree` | JWT | Get full folder tree |
| GET | `/file-system/files` | JWT | Get root-level files |
| GET | `/file-system/files/:folderId` | JWT | Get files inside a folder |
| GET | `/file-system/download/:id` | JWT | Download a file |
| GET | `/file-system/download-folder/:folderId` | JWT | Download folder as ZIP |
| GET | `/file-system/proxy/:id` | JWT | Proxy file for inline preview |
| PATCH | `/file-system/rename/:id` | JWT | Rename a file or folder |
| PATCH | `/file-system/move/:id` | JWT | Move a file to another folder |
| DELETE | `/file-system/delete/:id` | JWT | Delete a file or folder |
| GET | `/file-system/share/:username/:filename` | — | Get public file metadata |
| GET | `/file-system/share/download/:username/:filename` | — | Download a public file |

#### Infinity Life `/infinity-life`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/infinity-life/tasks` | JWT | Get all user tasks |
| POST | `/infinity-life/tasks` | JWT | Create a task |
| PATCH | `/infinity-life/tasks/:taskId` | JWT | Update a task |
| PATCH | `/infinity-life/tasks/:taskId/toggle` | JWT | Toggle task completion |
| PATCH | `/infinity-life/tasks/:taskId/move` | JWT | Move task to a column |
| DELETE | `/infinity-life/tasks/:taskId` | JWT | Delete a task |
| POST | `/infinity-life/subtasks` | JWT | Create a subtask |
| PATCH | `/infinity-life/subtasks/:subtaskId/toggle` | JWT | Toggle subtask completion |
| DELETE | `/infinity-life/subtasks/:subtaskId` | JWT | Delete a subtask |
| GET | `/infinity-life/columns` | JWT | Get all columns |
| POST | `/infinity-life/columns` | JWT | Create a column |
| PATCH | `/infinity-life/columns/:columnId` | JWT | Rename a column |
| DELETE | `/infinity-life/columns/:columnId` | JWT | Delete a column |

#### Plan `/plan`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/plan/info` | JWT | Get plan and storage info |
| POST | `/plan/activate-promo` | JWT | Activate a promo code |
| POST | `/plan/admin/generate-promo` | JWT + Admin | Generate promo codes |

---

## Authentication

The API uses **cookie-based JWT authentication**:

- `access_token` — httpOnly cookie, expires in 15 minutes
- `refresh_token` — httpOnly cookie, expires in 7 days

The frontend must send requests with `withCredentials: true`. Both services must run on the same host (`localhost`) in development for cookies to work correctly.

---

## Project Structure

```
src/
├── auth/               # JWT + Google OAuth, email verification
│   ├── DTO/
│   ├── guards/
│   └── strategies/
├── user/               # Profile, avatar, password change
│   └── DTO/
├── file-system/        # Files, folders, S3 storage
│   └── DTO/
├── infinity-life/      # Kanban: tasks, subtasks, columns
│   └── DTO/
├── plan/               # Plans, promo codes, quotas
│   ├── DTO/
│   ├── guards/
│   └── interfaces/
├── mail/               # Email via Resend
├── services/           # StorageService (S3)
├── prisma-database/    # PrismaClient singleton
├── app.module.ts
└── main.ts

prisma/
└── schema.prisma       # Database schema
```

---

## Commands

```bash
npm run start:dev       # Run in watch mode
npm run build           # Compile to dist/
npm run start:prod      # Run production build
npm test                # Unit tests (Jest)
npm run test:e2e        # E2E tests
npm run lint            # ESLint with auto-fix
npm run format          # Prettier
npx prisma generate     # Regenerate Prisma Client
npx prisma migrate dev  # Create a new migration
```

---

## Docker

```bash
docker build -t infinity-backend .
docker run -p 4400:4400 --env-file .env infinity-backend
```

The Dockerfile performs a two-stage build (Node 20 Alpine): `prisma generate` → `nest build` → production image.

---

## Tech Stack

- **NestJS 11** — modular Node.js framework
- **Prisma 7** + **pg** — ORM with native PostgreSQL adapter
- **Passport.js** — JWT and Google OAuth strategies
- **argon2** — password hashing
- **@aws-sdk/client-s3** — S3-compatible storage (Selectel)
- **archiver** — on-the-fly ZIP generation
- **Resend** — transactional email
- **@nestjs/swagger** — Swagger / OpenAPI documentation
- **@nestjs/throttler** — rate limiting
- **@nestjs/schedule** — cron jobs
