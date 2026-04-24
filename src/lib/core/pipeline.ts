/**
 * Pipeline — Lead status transitions and event logging.
 * 
 * Every status change creates an event record. Status transitions
 * are explicit and validated.
 */

import { db, leads, events } from '../db/index.js';
import { eq } from 'drizzle-orm';

// ─── Lead Status Type ───────────────────────────────────────────────

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'customer_waiting'
  | 'scheduled'
  | 'closed_won'
  | 'closed_lost'
  | 'escalated'
  | 'opted_out';

// ─── Status Machine ───────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['contacted', 'escalated', 'opted_out'],
  contacted: ['customer_waiting', 'scheduled', 'closed_lost', 'escalated', 'opted_out'],
  customer_waiting: ['contacted', 'scheduled', 'closed_won', 'closed_lost', 'escalated', 'opted_out'],
  scheduled: ['closed_won', 'closed_lost', 'escalated', 'opted_out'],
  closed_won: [],
  closed_lost: ['new'], // re-open a lost lead
  escalated: ['customer_waiting', 'new', 'closed_won', 'closed_lost'],
  opted_out: [],
};

/** Check if a status transition is valid */
export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

/** Transition a lead to a new status, logging the event */
export async function transitionLeadStatus(
  leadId: string,
  newStatus: LeadStatus,
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Fetch current lead
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const currentStatus = lead.status;

  // Allow re-transitioning to same status (idempotent)
  if (currentStatus === newStatus) return;

  // Validate transition
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid status transition: ${currentStatus} → ${newStatus} for lead ${leadId}`,
    );
  }

  // Update lead status
  await db
    .update(leads)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  // Log the event
  await db.insert(events).values({
    leadId,
    eventType: 'status_change',
    metadata: {
      from: currentStatus,
      to: newStatus,
      ...metadata,
    },
  });
}

/** Log a generic event (email_sent, email_received, booking, etc.) */
export async function logEvent(
  leadId: string,
  eventType: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(events).values({
    leadId,
    eventType,
    metadata,
  });
}