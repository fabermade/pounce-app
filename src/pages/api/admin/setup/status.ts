/**
 * GET /api/admin/setup/status — Check if initial setup has been completed.
 *
 * Returns { completed: boolean, hasUsers: boolean }
 * The frontend uses this to decide whether to show the setup wizard,
 * the "create admin" step, or the dashboard.
 */

import type { APIRoute } from 'astro';
import { db, businessConfig, users } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  try {
    const [row] = await db
      .select()
      .from(businessConfig)
      .where(eq(businessConfig.key, 'setup_complete'))
      .limit(1);

    const completed = row?.value != null;

    // Check if any users exist (Phase 1→2 migration check)
    const existingUsers = await db.select().from(users).limit(1);
    const hasUsers = existingUsers.length > 0;

    return new Response(JSON.stringify({ completed, hasUsers }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error checking setup status:', err);
    // If DB isn't reachable, assume setup is not complete
    return new Response(JSON.stringify({ completed: false, hasUsers: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};