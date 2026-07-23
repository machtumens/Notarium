/**
 * Password Migration Script
 *
 * This script migrates plain-text passwords to bcrypt hashes.
 *
 * IMPORTANT: Run this ONCE before deploying the new authentication system.
 *
 * Usage:
 *   node scripts/migrate-passwords.js
 *
 * The script will:
 * 1. Fetch all users from the database
 * 2. Hash their plain-text passwords with bcrypt
 * 3. Update the password_hash field with the hashed version
 */

import bcrypt from 'bcryptjs';

async function migratePasswords() {
  console.log('🔐 Starting password migration...\n');

  console.log('⚠️  WARNING: This script will hash all plain-text passwords in the database.');
  console.log('⚠️  Make sure you have a backup of your database before proceeding.\n');

  console.log('To run this migration:');
  console.log('1. Install dependencies: cd backend && npm install');
  console.log('2. Use wrangler to execute the migration against your D1 database\n');

  console.log('Option 1 - Use wrangler with custom script:');
  console.log('  npx wrangler d1 execute notarium-db --command "SELECT id, email, password_hash FROM users LIMIT 5"');
  console.log('  # Review the output to see if passwords are plain text\n');

  console.log('Option 2 - Manual migration:');
  console.log('  Since D1 doesn\'t support procedural migrations, you have two options:');
  console.log('  a) Use the /api/admin/migrate-passwords endpoint (add this to your backend)');
  console.log('  b) Export users, hash passwords locally, and re-import\n');

  console.log('📝 Example bcrypt hash for password "test123":');
  const exampleHash = await bcrypt.hash('test123', 10);
  console.log(`   ${exampleHash}\n`);

  console.log('✅ Next steps:');
  console.log('1. Add JWT_SECRET to Cloudflare secrets: npx wrangler secret put JWT_SECRET');
  console.log('2. Add ADMIN_PASSWORD to Cloudflare secrets: npx wrangler secret put ADMIN_PASSWORD');
  console.log('3. Create KV namespace: npx wrangler kv:namespace create RATE_LIMIT');
  console.log('4. Update wrangler.toml with the KV namespace ID');
  console.log('5. Run database migration: npm run migrate');
  console.log('6. Deploy: npm run deploy\n');
}

migratePasswords().catch(console.error);
