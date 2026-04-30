import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const config = await sql`SELECT key, value FROM business_config`;
  for (const row of config) {
    console.log(`\n=== ${row.key} ===`);
    console.log(JSON.stringify(row.value, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });