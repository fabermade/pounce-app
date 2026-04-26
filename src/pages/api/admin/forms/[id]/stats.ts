/**
 * GET /api/admin/forms/[id]/stats — Form analytics.
 *
 * Returns view count, submission count, conversion rate,
 * and recent submissions for a form.
 */

import type { APIRoute } from 'astro';
import { db, forms, formSubmissions } from '@/lib/db/index.js';
import { eq, desc, count } from 'drizzle-orm';
import { getSessionFromRequest } from '@/lib/auth/session.js';
import { requireRole } from '@/lib/auth/roles.js';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const roleError = requireRole(session, 'viewer');
  if (roleError) return roleError;

  const formId = params.id;
  if (!formId) {
    return new Response(JSON.stringify({ error: 'Form ID is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get form details
  const [form] = await db
    .select()
    .from(forms)
    .where(eq(forms.id, formId))
    .limit(1);

  if (!form) {
    return new Response(JSON.stringify({ error: 'Form not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get submission count
  const [submissionCount] = await db
    .select({ count: count() })
    .from(formSubmissions)
    .where(eq(formSubmissions.formId, form.id));

  // Get recent submissions (last 50)
  const recentSubmissions = await db
    .select({
      id: formSubmissions.id,
      data: formSubmissions.data,
      leadId: formSubmissions.leadId,
      createdAt: formSubmissions.createdAt,
    })
    .from(formSubmissions)
    .where(eq(formSubmissions.formId, form.id))
    .orderBy(desc(formSubmissions.createdAt))
    .limit(50);

  // Calculate conversion rate
  const views = form.views ?? 0;
  const submissions = submissionCount?.count ?? 0;
  const conversionRate = views > 0 ? (submissions / views * 100).toFixed(1) : '0';

  return new Response(JSON.stringify({
    formId: form.id,
    formName: form.name,
    formSlug: form.slug,
    views,
    submissions,
    conversionRate: `${conversionRate}%`,
    recentSubmissions,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};