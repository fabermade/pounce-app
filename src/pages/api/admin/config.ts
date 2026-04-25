/**
 * GET /api/admin/config — Return all business config as a single object.
 * PATCH /api/admin/config — Update config sections by key.
 *
 * Business config is stored as key→JSONB rows in the business_config table.
 * Keys: business, tone, knowledge, services, faq, escalation, booking, providers, agent
 *
 * GET returns: { business: {...}, tone: {...}, services: [...], ... }
 * PATCH body: { tone: { style: "casual" } } — merges the provided section
 */

import type { APIRoute } from 'astro';
import { db, businessConfig } from '../../../lib/db/index.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// All valid config section keys
const CONFIG_KEYS = [
  'business', 'tone', 'knowledge', 'services', 'faq',
  'escalation', 'booking', 'providers', 'agent',
] as const;

// Type for values stored in business_config — objects or arrays
type ConfigValue = Record<string, unknown> | unknown[];

/**
 * GET — Return all config as a flat object keyed by section
 */
export const GET: APIRoute = async () => {
  try {
    const rows = await db
      .select()
      .from(businessConfig);

    // Convert rows to a keyed object
    const config: Record<string, unknown> = {};
    for (const row of rows) {
      config[row.key] = row.value;
    }

    // Ensure all keys exist (with defaults for missing ones)
    const defaults: Record<string, unknown> = {
      business: { name: '', tagline: '', website: '', description: '' },
      tone: { style: 'professional', instructions: '', dos: [], donts: [] },
      knowledge: { links: [], texts: [] },
      services: [],
      faq: [],
      escalation: { triggerPhrases: [], notifyEmail: '' },
      booking: { url: '', cta: '', timing: 'after_second_exchange' },
      providers: { llm: 'openai', llmApiKey: 'env:LLM_API_KEY', llmModel: '', email: 'resend', emailApiKey: 'env:EMAIL_API_KEY', fromEmail: 'hello@pouncefirst.com', inbox: '' },
      agent: { enabled: false, webhookUrl: '' },
    };

    for (const key of CONFIG_KEYS) {
      if (!config[key]) {
        config[key] = defaults[key];
      }
    }

    // Mask API keys in response — never expose raw secrets over the wire
    const safeConfig = { ...config };
    if (safeConfig.providers && typeof safeConfig.providers === 'object') {
      const prov = safeConfig.providers as Record<string, unknown>;
      if (prov.llmApiKey) prov.llmApiKeySet = true;
      if (prov.emailApiKey) prov.emailKeySet = true;
      prov.llmApiKey = prov.llmApiKey ? '••••••••' : '';
      prov.emailApiKey = prov.emailApiKey ? '••••••••' : '';
    }

    return new Response(JSON.stringify({ config: safeConfig }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error fetching config:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch config' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * PATCH — Update one or more config sections.
 * Body: { tone: { style: "casual" }, booking: { url: "https://..." } }
 * Each provided key is deep-merged with existing config for that section.
 * Arrays are replaced entirely (not merged).
 */
const patchSchema = z.object({
  business: z.record(z.unknown()).optional(),
  tone: z.record(z.unknown()).optional(),
  knowledge: z.record(z.unknown()).optional(),
  services: z.array(z.unknown()).optional(),
  faq: z.array(z.unknown()).optional(),
  escalation: z.record(z.unknown()).optional(),
  booking: z.record(z.unknown()).optional(),
  providers: z.record(z.unknown()).optional(),
  agent: z.record(z.unknown()).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one config section must be provided',
});

export const PATCH: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const updated: Record<string, unknown> = {};

    for (const [key, newValue] of Object.entries(parsed.data)) {
      // Fetch existing value for this key
      const [existing] = await db
        .select()
        .from(businessConfig)
        .where(eq(businessConfig.key, key));

      let mergedValue: ConfigValue;

      // Deep merge objects, but preserve API keys if new value is empty
      // (user left the field blank to keep existing key)
      if (existing) {
        const existingVal = existing.value as ConfigValue;
        // Deep merge for objects, replace for arrays
        if (Array.isArray(newValue)) {
          mergedValue = newValue;
        } else if (
          typeof newValue === 'object' && newValue !== null &&
          !Array.isArray(existingVal) && typeof existingVal === 'object' && existingVal !== null
        ) {
          mergedValue = { ...(existingVal as Record<string, unknown>), ...(newValue as Record<string, unknown>) };

          // Preserve existing API keys when new value is empty or masked placeholder
          const secretFields = ['llmApiKey', 'emailApiKey'];
          for (const field of secretFields) {
            if (field in (mergedValue as Record<string, unknown>)) {
              const newVal = (mergedValue as Record<string, unknown>)[field];
              const oldVal = (existingVal as Record<string, unknown>)[field];
              if ((newVal === '' || newVal === '••••••••') && oldVal && String(oldVal).length > 0) {
                (mergedValue as Record<string, unknown>)[field] = oldVal;
              }
            }
          }
        } else {
          mergedValue = newValue as ConfigValue;
        }

        // Update existing row
        await db
          .update(businessConfig)
          .set({ value: mergedValue, updatedAt: new Date() })
          .where(eq(businessConfig.key, key));
      } else {
        // Insert new row
        mergedValue = newValue as ConfigValue;
        await db
          .insert(businessConfig)
          .values({ key, value: mergedValue });
      }

      updated[key] = mergedValue;
    }

    return new Response(JSON.stringify({ config: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error updating config:', err);
    return new Response(JSON.stringify({ error: 'Failed to update config' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};