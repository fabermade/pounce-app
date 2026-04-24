/**
 * GET /api/admin/setup/status — Check if initial setup has been completed.
 *
 * Returns { completed: boolean }
 * The frontend uses this to decide whether to show the setup wizard or the dashboard.
 */

import type { APIRoute } from 'astro';
import { db, businessConfig } from '../../../../lib/db/index.js';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  try {
    const [row] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.key, 'setup_complete'))
      .limit(1);

    const completed = row?.value != null;

    return new Response(JSON.stringify({ completed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error checking setup status:', err);
    // If DB isn't reachable, assume setup is not complete
    return new Response(JSON.stringify({ completed: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};