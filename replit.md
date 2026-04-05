# Nafida Biz (نافذة بيز)

## Overview

Full-stack Algerian business tax and administrative automation platform. Built with React + Vite frontend and Express backend, using Supabase for authentication.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite, Tailwind CSS, wouter routing, TanStack Query
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM (for user profiles)
- **Auth**: Supabase Auth (email/password login + signup)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle for API)
- **Language**: Arabic (RTL), Tajawal font

## Artifacts

- **nafida-biz** — Main web app (`/`) — React + Vite frontend
- **api-server** — REST API (`/api`) — Express 5

## Pages

- `/login` — Login & registration (Supabase auth)
- `/` — Protected dashboard with stats, G50 PDF button (mock)
- `/profile` — User profile update form (NIF, NIS, RC, AI, company info)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/nafida-biz run dev` — run frontend locally

## Environment Variables

- `SUPABASE_URL` — Supabase project URL (secret)
- `SUPABASE_ANON_KEY` — Supabase anonymous key (secret)
- `VITE_SUPABASE_URL` — Supabase URL exposed to frontend
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key exposed to frontend
- `DATABASE_URL` — PostgreSQL connection string (Replit managed)

## Database Schema

- `profiles` table — user profiles linked to Supabase auth users
  - id (text, primary key = Supabase user UUID)
  - email, full_name, company_name, nif, nis, rc, ai
  - created_at

## Future Phases

- Phase 2: G50 PDF generation (jsPDF or server-side PDF)
- Phase 3: Mock payment integration
- Phase 4: Social security declarations

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
