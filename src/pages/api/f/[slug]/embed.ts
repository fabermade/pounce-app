/**
 * GET /api/f/[slug]/embed.js — Embeddable JavaScript snippet.
 *
 * Returns a small JS file that creates an iframe pointing to the form page.
 * Usage: <script src="https://www.pouncefirst.com/api/f/contact/embed.js"></script>
 */

import type { APIRoute } from 'astro';
import { db, forms } from '@/lib/db/index.js';
import { eq } from 'drizzle-orm';

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response('/* Invalid form slug */', {
      status: 400, headers: { 'Content-Type': 'application/javascript' },
    });
  }

  // Verify form exists and is active
  const [form] = await db
    .select()
    .from(forms)
    .where(eq(forms.slug, slug))
    .limit(1);

  if (!form || !form.active) {
    return new Response('/* Form not found */', {
      status: 404, headers: { 'Content-Type': 'application/javascript' },
    });
  }

  const APP_URL = import.meta.env.APP_URL || 'https://www.pouncefirst.com';
  const formUrl = `${APP_URL}/f/${slug}`;

  const script = `(function(){
  var d=document,s=d.createElement('iframe');
  s.src='${formUrl}';
  s.style.width='100%';s.style.minHeight='400px';s.style.border='none';
  s.title='${form.name.replace(/'/g, "\\'")}';
  var c=d.currentScript||d.scripts[d.scripts.length-1];
  c.parentNode.insertBefore(s,c);
})();`;

  return new Response(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=300',
    },
  });
};