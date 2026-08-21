---
trigger: always_on
---

## Tech Stack Constraints & Package Management

### 1. Core Runtime & Framework
- **Runtime:** Node.js 22 LTS (Strict: `>=22.0.0 <23.0.0`)
- **Framework:** Next.js 15 (App Router only, React 19)
- **Language:** TypeScript (Strict mode enabled, no `any`)
- **Styling:** Tailwind CSS

### 2. Package Manager Rules (STRICT: pnpm Only)
- **Exclusive Tool:** ALWAYS use `pnpm` for all dependency operations.
- **Forbidden Commands:** NEVER execute or suggest `npm`, `npx`, or `yarn`.
  - Use `pnpm add <pkg>` instead of `npm i <pkg>`
  - Use `pnpm add -D <pkg>` instead of `npm i -D <pkg>`
  - Use `pnpm dlx <pkg>` instead of `npx <pkg>`
  - Use `pnpm <script>` or `pnpm run <script>` instead of `npm run <script>`
- **Lockfile Integrity:** Maintain `pnpm-lock.yaml`. If `package-lock.json` or `yarn.lock` is accidentally generated, delete it immediately.
- **Dependency Guard:** Do not introduce new dependencies without explicit necessity. Prefer existing project packages or native Node 22 / Web APIs.

### 3. Next.js 15 & React 19 Conventions
- **Server Components:** Default to React Server Components (RSC). Only add `'use client'` when state, effects, or browser APIs are required.
- **Async Dynamic APIs:** Remember that in Next.js 15, dynamic route parameters and headers are asynchronous:
  - `const { id } = await params;`
  - `const search = await searchParams;`
  - `const cookieStore = await cookies();`
  - `const headersList = await headers();`
- **Data Fetching:** Do not rely on legacy fetch auto-caching. Explicitly define `{ cache: 'force-cache' }` or `next: { revalidate: ... }` if caching is required.