# Database Migrations

This directory contains database migration files for the Notarium backend.

## Running Migrations

### For Production (Cloudflare D1)

Run migrations using the Cloudflare dashboard or wrangler CLI:

```bash
# Using wrangler
wrangler d1 execute notarium-db --file=migrations/0001_allow_null_class.sql

# Or apply directly from Cloudflare dashboard
# Go to Workers & Pages > D1 > notarium-db > Console
# Copy and paste the migration SQL
```

### For Local Development

```bash
# Using wrangler with local database
wrangler d1 execute notarium-db-local --local --file=migrations/0001_allow_null_class.sql
```

## Migration History

- **0001_allow_null_class.sql** - Allow NULL values for class field to support admin users who don't need a class assignment
