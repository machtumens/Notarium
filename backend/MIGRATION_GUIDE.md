# Database Migration Guide

## Critical: Admin Login Fix

The admin login was failing with error:

```
D1_ERROR: CHECK constraint failed: class IN ('10.1', '10.2', '10.3'): SQLITE_CONSTRAINT
```

This has been fixed by allowing NULL values for the `class` field (admin users don't need a class).

## How to Apply the Migration

### Option 1: Using npm script (Recommended)

```bash
cd backend

# For production database
npm run migrate

# For local development database
npm run migrate:local
```

### Option 2: Using wrangler directly

```bash
cd backend

# For production database
wrangler d1 execute notarium-db --file=migrations/0001_allow_null_class.sql

# For local development database
wrangler d1 execute notarium-db-local --local --file=migrations/0001_allow_null_class.sql
```

### Option 3: Using Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** > **D1**
3. Select your database: **notarium-db**
4. Click on **Console** tab
5. Copy the contents of `migrations/0001_allow_null_class.sql`
6. Paste and execute

## After Migration

Once the migration is applied, you can optionally run the data fix script to clean up existing users:

```bash
wrangler d1 execute notarium-db --file=fix-class-data.sql
```

This will:

- Set admin users to have NULL class
- Set student users with invalid class to '10.1'

## Verification

After migration, test the admin login at `/admin-login` with:

- Email: `admin@notarium.site` (or any email ending with @notarium.site)
- Password: `notariumanagers`

The login should now work without constraint errors.
