import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const config = await sql`SELECT key FROM business_config`;
  const users = await sql`SELECT id, email, name, role FROM users`;

  console.log('business_config rows:', config.length);
  console.log('users rows:', users.length);
  if (config.length > 0) {
    console.log('Config keys:', config.map((c: any) => c.key));
  }
  if (users.length > 0) {
    console.log('Users:', users.map((u: any) => ({ email: u.email, role: u.role })));
  }
}

main().catch(e => { console.error(e); process.exit(1); });