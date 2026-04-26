/**
 * POST /api/admin/setup/admin — Bootstrap first admin user.
 *
 * Only works when setup is complete but no users exist yet.
 * This handles the Phase 1→2 migration case where the admin
 * was configured in business_config but no user account was created.
 *
 * After creating the user, auto-logs them in.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { db, businessConfig, users } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';
import { createUser } from '@/lib/auth/users.js';
import { createSession, setSessionCookie } from '@/lib/auth/session.js';

const createAdminSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
});

export const POST: APIRoute = async ({ request }) => {
  // 1. Only allow if setup is complete
  const [setupRow] = await db
    .select()
    .from(businessConfig)
    .where(eq(businessConfig.key, 'setup_complete'))
    .limit(1);

  if (!setupRow?.value) {
    return new Response(JSON.stringify({ error: 'Setup must be completed first' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Only allow if no users exist
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    return new Response(JSON.stringify({ error: 'Admin user already exists. Use login instead.' }), {
      status: 409, headers: { 'Content-Type': 'application/json' },
    });
  }

  // 3. Parse and validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = createAdminSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 4. Create owner user
  const adminUser = await createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    name: parsed.data.name,
    role: 'owner',
  });

  // 5. Auto-login
  const sessionToken = await createSession({
    userId: adminUser.id,
    email: adminUser.email,
    role: 'owner',
  });

  const response = new Response(JSON.stringify({
    success: true,
    user: {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role,
    },
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });

  setSessionCookie(response, sessionToken);
  return response;
};