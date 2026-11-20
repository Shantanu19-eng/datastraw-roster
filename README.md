# RosterIQ – Workforce Roster Management System

RosterIQ is a browser-based workforce roster management application designed for operations teams. It helps manage employees, pods, brands, processes, work calendars, leave, staffing coverage, monthly rosters, and scheduling conflicts.

## Features

- Database-backed employee, brand, process, and pod management.
- Employee assignments, availability, weekly offs, leave, and comp-off records.
- Automated monthly roster generation with calendar, eligibility, and staffing constraints.
- Coverage analysis and scheduling conflict detection.
- Draft and published rosters, version snapshots, and CSV exports.
- Validated manual employee assignments.
- Database-backed authentication and secure sessions.
- A public, read-only product preview at `/demo` using fictional data and no database access.
- Role-based access control:
  - **Admin and Operations Manager:** Management access.
  - **Pod Lead:** Access restricted to their assigned pod.
  - **Employee:** Access to their own roster and leave information.
- Manager-reviewed backup recommendations with approval, rejection, and audit history.
- Fictional sample data. The seed process adds missing records without deleting or overwriting existing records.

## Technology Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Zod
- shadcn/ui components
- Lucide icons
- Recharts
- Vitest

## Architecture and Data Model

Next.js server-rendered pages and server actions use Prisma to communicate with PostgreSQL.

The application stores related information about:

- Employees
- Pods
- Brands
- Processes
- Employee assignments
- Leave and availability
- Operating rules and holidays
- Monthly rosters
- Scheduling conflicts
- Accounts and sessions
- Backup recommendations
- Audit history

The scheduling engine evaluates each date and process against the operating calendar, coverage requirements, employee assignments, weekly offs, approved leave or comp-off, and employee availability.

Scheduling decisions are deterministic. If the required coverage cannot be achieved, the application records a conflict instead of assigning an ineligible employee.

Backup recommendations do not automatically change a roster. A manager must approve a recommendation. The application then revalidates the candidate before updating the roster and audit history.

## Requirements

- Node.js 20.9 or newer (Node.js 22 LTS recommended).
- npm.
- PostgreSQL.

## Local Installation and Setup

Clone the repository:

```bash
git clone https://github.com/Shantanu19-eng/datastraw-roster.git
cd datastraw-roster
```

Install dependencies:

```bash
npm ci
```

Create your local environment file:

```powershell
Copy-Item .env.example .env
```

Open `.env` and configure your PostgreSQL connection string using `DATABASE_URL`.

**Important:** Never upload your `.env` file, database credentials, or passwords to GitHub.

### Database Setup

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply local database migrations:

```bash
npm run prisma:migrate
```

Optionally load fictional sample records:

```bash
npm run prisma:seed
```

The seed process is additive and idempotent. It creates missing sample records without deleting or updating existing records.

Review your target database before running the seed because it adds fictional operational data.

### Create the First Administrator

Create the first administrator only after migrations have been applied and only when no Admin or Operations Manager account exists.

Example using PowerShell:

```powershell
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_NAME = "RosterIQ Administrator"
$env:ADMIN_PASSWORD = "replace-with-a-unique-password-of-at-least-12-characters"

npm run auth:create-admin

Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_NAME, Env:ADMIN_PASSWORD
```

Use a unique password of at least 12 characters.

### Reset an Existing Administrator Password

If no current password is available, reset an Administrator directly from a trusted local environment with database access:

```powershell
$env:ADMIN_PASSWORD = "replace-with-a-new-unique-password-of-at-least-12-characters"
# Optional when the workspace has more than one Admin account:
$env:ADMIN_EMAIL = "admin@example.com"

npm run auth:reset-admin-password

Remove-Item Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

The command resets only an active Admin account, revokes that account's existing sessions, clears its login throttle, and does not log the password.

Never commit or share the bootstrap password.

### Start the Application

```bash
npm run dev
```

Open your browser and visit:

http://localhost:3000

The public, read-only preview is available at:

http://localhost:3000/demo

The home page and full workspace require sign-in. The demo is a separate, optional preview and does not replace the application.

## Useful Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server |
| `npm run lint` | Check code quality |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run automated tests |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run db:audit` | Run database audit |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Apply local development migrations |
| `npm run prisma:deploy` | Apply checked-in migrations to a deployment database |
| `npm run prisma:seed` | Load fictional sample data |

The production build generates the Prisma client before building Next.js.

Never use a database reset command on a database containing information you need.

## Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `ADMIN_EMAIL` | One-time input for administrator creation |
| `ADMIN_NAME` | One-time administrator name |
| `ADMIN_PASSWORD` | One-time administrator bootstrap password |

The administrator variables are used during initial account creation. Do not store them in the public repository.

There are no `NEXT_PUBLIC_*` database or authentication secrets.

Authentication uses database sessions and secure production cookies.
The `/demo` page is intentionally separate from authenticated application routes and displays only static fictional data. It does not read from the database or expose application actions.

## Database and Production Migrations

The local PostgreSQL database is not a production database and cannot be accessed by Vercel.

Before deployment:

1. Provision a managed PostgreSQL database.
2. Keep database credentials private.
3. Back up the database before applying migrations.
4. Apply the checked-in Prisma migrations.
5. Create the initial production administrator.

For production migrations, use a direct database connection when the provider's pooled URL does not support schema changes.

Example:

```powershell
$env:DATABASE_URL = "your-direct-production-connection-string"

npm run prisma:deploy

Remove-Item Env:DATABASE_URL
```

Verify the database connection target before running migrations.

Do not run the sample seed against production unless you intentionally want fictional sample records there.

## GitHub Repository

The project repository is:

**Repository:** [datastraw-roster](https://github.com/Shantanu19-eng/datastraw-roster)

**GitHub Username:** Shantanu19-eng

**Visibility:** Public

The repository contains the application source code and project documentation.

Sensitive files such as `.env`, database credentials, private keys, backups, `node_modules`, and build output must remain excluded from Git.

## Vercel Deployment

RosterIQ can be deployed using Vercel with a managed PostgreSQL database.

### Deployment Steps

1. Create a managed PostgreSQL database and keep its credentials private.
2. Apply the checked-in database migrations using the production migration procedure.
3. Create the initial administrator account.
4. Open [Vercel](https://vercel.com/).
5. Import the `datastraw-roster` GitHub repository.
6. Select the Next.js framework preset.
7. Set the project root to the repository root.
8. Use `npm ci` as the installation command.
9. Use `npm run build` as the build command.
10. Add `DATABASE_URL` in Vercel Project Settings for the Production environment.
11. Use the database provider's pooled runtime connection string.
12. Deploy the application.

After deployment, verify:

- Login and authentication.
- Role-based access permissions.
- Employee management.
- Roster generation.
- Leave management.
- Scheduling conflicts.
- API exports.

Production database provisioning, migrations, credentials, and live deployment testing must be completed before the application is used in production.

## Testing and Known Limitations

The project includes automated tests using Vitest.

Run the following commands to validate the application:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Important limitations:

- Automated tests do not provision a production database.
- Live Vercel deployment testing is not included.
- Sample seed data is fictional.
- Existing legacy sample assignments are preserved.
- Excel export is not implemented.
- Alternative-roster comparison is not implemented.
- Production operation requires database provisioning, administrator setup, migrations, and operational monitoring.

## Future Improvements

Potential future enhancements include:

- Comprehensive database-backed end-to-end testing.
- Production deployment smoke tests.
- Monitoring and operational alerts.
- Automated backup and restore procedures.
- Excel export functionality.
- Alternative-roster comparison.
- Improved scheduling performance for larger workforces.
- Pagination and workload-focused database indexes.

## DataStraw Assessment – Technical Reasoning

### 1. How are employees, brands, processes, and pods related?

Employees belong to pods and can have multiple brand and process assignments. Brands contain processes and can have operating rules. Pods may have leads.

### 2. How does the scheduler decide whether a roster is valid?

It evaluates calendars, holidays, coverage targets, employee eligibility, weekly offs, approved leave, comp-off, and availability.

Unmet coverage requirements are reported as scheduling conflicts.

### 3. How are single-employee and shared-staff brands supported?

Assignments are stored as explicit relationships, allowing one or multiple eligible employees per brand or process.

### 4. What happens when an employee becomes unavailable?

The schedule is revalidated. Eligible backups can be recommended, but a manager must approve the replacement before the roster changes.

### 5. How are conflicting constraints handled?

Hard eligibility and availability constraints prevent invalid assignments. Insufficient staffing is reported instead of being overridden.

### 6. What is automated and what remains a manager decision?

Scheduling, validation, coverage analysis, conflict calculation, and backup recommendation generation are automated.

Leave decisions, backup approval or rejection, and roster publishing remain manager-controlled.

### 7. How can the system scale to twice as many employees and brands?

Potential improvements include pagination, workload-focused database indexes, background processing for large scheduling jobs, and query optimization.

A constraint solver could also be evaluated if scheduling requirements become more complex.

### 8. What should be improved next?

The next priorities are comprehensive database-backed tests, deployment smoke tests, monitoring, and operational backup and restore procedures.

---

**RosterIQ – Workforce Roster Management System**

Developed using Next.js, TypeScript, Prisma, and PostgreSQL.