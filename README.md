# RosterIQ

RosterIQ is a browser-based workforce roster management application for operations teams. It manages employees, pods, brands, processes, work calendars, leave, coverage requirements, monthly rosters, and scheduling conflicts.

## Features

- Database-backed employee, brand, process, and pod management
- Employee assignments, availability, weekly offs, leave, and comp-off records
- Deterministic monthly roster generation with calendar, eligibility, and staffing constraints
- Coverage analysis and conflicts derived from roster and staffing data
- Draft and published rosters, version snapshots, validated manual assignments, and CSV exports
- Sign-in with database-backed sessions and server-side role checks:
  - Admin and Operations Manager: management access
  - Pod Lead: access scoped to their pod
  - Employee: access to their own roster and leave information
- Manager-reviewed backup recommendations with approval/rejection and audit history
- Fictional sample data; the seed adds missing records without deleting or overwriting existing records

## Technology

- Next.js App Router, React, TypeScript, and Tailwind CSS
- Prisma ORM and PostgreSQL
- Zod, shadcn/ui components, Lucide icons, and Recharts
- Vitest

## Architecture and data model

Next.js server-rendered pages and server actions use Prisma to access PostgreSQL. Employee, pod, brand, process, assignment, leave, availability, operating-rule, holiday, roster, conflict, account, session, recommendation, and audit data are persisted in related tables.

The scheduling engine evaluates each date and process against the operating calendar, coverage requirements, employee assignments, weekly offs, approved leave/comp-off, and availability. Selection is deterministic. If required coverage cannot be met, the roster records a conflict instead of assigning an ineligible employee.

Backup recommendations do not change a roster automatically. A manager must approve a recommendation; approval revalidates the candidate and then updates the roster and audit history.

## Requirements

- Node.js 20.9 or newer (Node.js 22 LTS is recommended)
- npm
- PostgreSQL

## Local setup

From the project directory:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` and set `DATABASE_URL` to your PostgreSQL connection string. Keep `.env` private; it is ignored by Git.

Create/update the local database schema and optionally load fictional sample records:

```powershell
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

The seed is additive and idempotent: it creates missing sample records and does not delete or update existing records. Review the target database before running it because it adds fictional operational data.

Create the first administrator only after migrations are applied and only when no Admin or Operations Manager account exists:

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_NAME = "RosterIQ Administrator"
$env:ADMIN_PASSWORD = "replace-with-a-unique-password-of-at-least-12-characters"
npm run auth:create-admin
Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:ADMIN_PASSWORD
```

Do not commit or share the bootstrap password. After the first administrator is created, manage accounts through the application.

Start the development server:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Useful commands

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run start
npm run db:audit
```

`npm run build` generates the Prisma client before building Next.js. `npm run prisma:migrate` is for local development; use `npm run prisma:deploy` to apply checked-in migrations to a deployment database. Never use a database reset command on a database containing data you need.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. Use a serverless-compatible pooled URL for the deployed application. |
| `ADMIN_EMAIL` | One-time input to `npm run auth:create-admin`; do not store it in the public repository. |
| `ADMIN_NAME` | One-time input to `npm run auth:create-admin`; do not store it in the public repository. |
| `ADMIN_PASSWORD` | One-time bootstrap password, at least 12 characters; do not store it in the public repository. |

There are no `NEXT_PUBLIC_*` database or authentication secrets. Authentication uses database sessions and secure production cookies; no OAuth callback URL or separate session secret is required by the current implementation.

## Database and production migrations

The local PostgreSQL database is not a production database and cannot be reached by Vercel. Before deployment, provision a managed PostgreSQL database reachable from Vercel. Configure the provider's pooled connection string as the Vercel `DATABASE_URL` for serverless runtime connections.

Apply migrations separately, before sending production traffic. Prisma migrations should use a direct database connection when the provider's pooled URL does not support schema changes. The Prisma schema uses `DATABASE_URL`, so set it temporarily to the provider's direct connection string in a trusted PowerShell session:

```powershell
$env:DATABASE_URL = "your-direct-production-connection-string"
npm run prisma:deploy
Remove-Item Env:DATABASE_URL
```

Take a database backup first and verify the connection target before running the migration. `prisma migrate deploy` applies pending checked-in migrations; it does not reset the database. Do not run the sample seed against production unless you intentionally want fictional sample records there.

Create the initial production administrator only after the production migrations finish. Run `npm run auth:create-admin` from a trusted environment configured for the production database, using temporary `ADMIN_EMAIL`, `ADMIN_NAME`, and `ADMIN_PASSWORD` environment variables. Remove those variables immediately afterward.

## GitHub

The intended repository name is **`rosteriq`**, with **Public** visibility. No external repository has been created and no code has been pushed. Before publishing, verify that only project files are in the repository and that `.env`, database dumps, private keys, backups, `node_modules`, and build output are ignored.

The project must be the repository root in GitHub; do not stage files from a broader personal/home-directory repository. Replace `YOUR_GITHUB_USERNAME` in the following URL with your GitHub username when connecting the remote:

```text
https://github.com/YOUR_GITHUB_USERNAME/rosteriq.git
```

## Vercel deployment

1. Create a managed PostgreSQL database and keep its credentials private.
2. Apply the checked-in migrations to that database using the direct-connection procedure above. Back up the database first.
3. Create the initial administrator using the bootstrap procedure above.
4. Import the `rosteriq` GitHub repository in Vercel and select the Next.js framework preset.
5. Set the project root to the repository root. Use `npm ci` for installation and `npm run build` for the build command; leave the output directory at its default.
6. Add `DATABASE_URL` in Vercel's Project Settings for the Production environment (and Preview only if Preview should use its own database). Use the provider's pooled runtime URL. Do not add secrets with a `NEXT_PUBLIC_` prefix.
7. Deploy from the Vercel dashboard. After deployment, verify login, role-scoped access, roster pages, and API exports over HTTPS.

There is no `vercel.json` because the standard Next.js Vercel integration is sufficient. This repository has not been deployed; production database provisioning, migration, credentials, and live smoke tests remain owner actions.

## Testing and known limitations

- `npm test` runs the automated Vitest suite; `npm run lint`, `npm run typecheck`, and `npm run build` validate code and the production build.
- These commands do not provision a production database or verify a live Vercel deployment.
- The included seed data is fictional. Existing legacy sample assignments are preserved, so the seed does not promise a fixed percentage of single-employee brands.
- Excel export and alternative-roster comparison are not implemented.
- Real production operation requires a managed database, an initial administrator account, production migrations, and operational monitoring.

## DataStraw assessment: technical reasoning

1. **How are employees, brands, processes, and pods related?** Employees belong to pods and may have multiple brand and process assignments. Brands contain processes and can have operating rules; pods may have leads.
2. **How does the scheduler decide if a roster is valid?** It applies calendars, holidays, coverage targets, eligibility, weekly offs, approved leave/comp-off, and availability. Unmet required coverage is reported as a conflict.
3. **How are single-employee and shared-staff brands supported?** Assignments are explicit relationships, allowing one or multiple eligible employees per brand/process. Existing sample assignments are preserved.
4. **What happens when an employee becomes unavailable?** The affected schedule is revalidated. Eligible backups can be recommended, but a manager must approve a replacement before the roster changes.
5. **How are conflicting constraints handled?** Hard eligibility and availability constraints prevent invalid assignments. Insufficient eligible staffing is reported rather than overridden.
6. **What is automated and what remains a manager decision?** Scheduling, validation, coverage/conflict calculation, and recommendation generation are automated. Leave decisions, backup approval/rejection, and roster publishing remain manager-controlled.
7. **How would the system scale to twice as many employees and brands?** Add pagination and workload-focused indexes, move large roster/revalidation jobs to a queue, and profile database query plans. Evaluate a constraint solver if scheduling requirements outgrow the deterministic engine.
8. **What should be improved next?** Add comprehensive database-backed end-to-end tests, deployment smoke tests, monitoring, and an operational backup/restore procedure before production use.
