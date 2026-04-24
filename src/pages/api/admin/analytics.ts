/**
 * GET /api/admin/analytics — Dashboard stats, weekly data, status breakdown.
 *
 * Returns:
 *   stats: { totalLeads, responseRate, avgResponseTime, bookingRate, leadsThisWeek, leadsLastWeek }
 *   weeklyData: [{ day, leads, responses, bookings }]
 *   statusBreakdown: [{ status, count }]
 *   recentActivity: [{ action, target, time }]
 */

import type { APIRoute } from 'astro';
import { db, leads, conversations, events } from '../../../lib/db/index.js';
import { eq, sql, desc, count, and, gte, lt } from 'drizzle-orm';

/** Safe destructuring helper for count queries that may return undefined */
function getCount(result: { value: number }[] | undefined): number {
  return Number(result?.[0]?.value ?? 0);
}

export const GET: APIRoute = async () => {
  try {
    // --- Stats ---
    const totalLeadsResult = await db
      .select({ value: count() })
      .from(leads);
    const totalLeads = getCount(totalLeadsResult);

    // Leads this week (Monday = start of week)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - mondayOffset);
    thisMonday.setHours(0, 0, 0, 0);

    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);

    const leadsThisWeekResult = await db
      .select({ value: count() })
      .from(leads)
      .where(gte(leads.createdAt, thisMonday));
    const leadsThisWeek = getCount(leadsThisWeekResult);

    const leadsLastWeekResult = await db
      .select({ value: count() })
      .from(leads)
      .where(and(gte(leads.createdAt, lastMonday), lt(leads.createdAt, thisMonday)));
    const leadsLastWeek = getCount(leadsLastWeekResult);

    // Response rate: leads with status != 'new' / total leads
    const respondedLeadsResult = await db
      .select({ value: count() })
      .from(leads)
      .where(sql`${leads.status} != 'new'`);
    const respondedLeads = getCount(respondedLeadsResult);

    const responseRate = totalLeads > 0
      ? Math.round((respondedLeads / totalLeads) * 100)
      : 0;

    // Booking rate: leads with status = 'scheduled' or 'closed_won' / total leads
    const bookedLeadsResult = await db
      .select({ value: count() })
      .from(leads)
      .where(sql`${leads.status} IN ('scheduled', 'closed_won')`);
    const bookedLeads = getCount(bookedLeadsResult);

    const bookingRate = totalLeads > 0
      ? Math.round((bookedLeads / totalLeads) * 100)
      : 0;

    // Avg response time: time between first inbound and first outbound per conversation
    const avgResponseResult = await db
      .select({
        avg: sql`COALESCE(
          EXTRACT(EPOCH FROM AVG(
            ${conversations.lastOutboundAt} - ${conversations.lastInboundAt}
          )),
          0
        )`,
      })
      .from(conversations)
      .where(sql`${conversations.lastInboundAt} IS NOT NULL AND ${conversations.lastOutboundAt} IS NOT NULL`);

    const avgResponseTime = Number(avgResponseResult[0]?.avg || 0).toFixed(1);

    // --- Status Breakdown ---
    const statusCounts = await db
      .select({
        status: leads.status,
        count: count(),
      })
      .from(leads)
      .groupBy(leads.status);

    const statusBreakdown = statusCounts.map(row => ({
      status: row.status,
      count: Number(row.count),
    }));

    // --- Weekly Data ---
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weeklyData = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(thisMonday);
      day.setDate(thisMonday.getDate() + i);
      const dayEnd = new Date(day);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const dayLeadsResult = await db
        .select({ value: count() })
        .from(leads)
        .where(and(gte(leads.createdAt, day), lt(leads.createdAt, dayEnd)));

      const dayResponsesResult = await db
        .select({ value: count() })
        .from(events)
        .where(and(
          eq(events.eventType, 'status_change'),
          sql`${events.metadata}->>'to' = 'contacted'`,
          gte(events.createdAt, day),
          lt(events.createdAt, dayEnd),
        ));

      const dayBookingsResult = await db
        .select({ value: count() })
        .from(events)
        .where(and(
          eq(events.eventType, 'status_change'),
          sql`${events.metadata}->>'to' = 'scheduled'`,
          gte(events.createdAt, day),
          lt(events.createdAt, dayEnd),
        ));

      weeklyData.push({
        day: dayNames[i],
        leads: getCount(dayLeadsResult),
        responses: getCount(dayResponsesResult),
        bookings: getCount(dayBookingsResult),
      });
    }

    // --- Recent Activity ---
    const recentEvents = await db
      .select()
      .from(events)
      .orderBy(desc(events.createdAt))
      .limit(10);

    const recentActivity = await Promise.all(
      recentEvents.map(async (event) => {
        const [lead] = await db
          .select({ name: leads.name, email: leads.email })
          .from(leads)
          .where(eq(leads.id, event.leadId));

        const meta = (event.metadata || {}) as Record<string, string>;
        const actionMap: Record<string, string> = {
          'lead_created': 'New lead',
          'status_change': `Moved to ${meta.to || 'updated'}`,
          'email_sent': 'Response sent',
          'booking_offered': 'Booking offered',
          'human_takeover': 'Human took over',
          'escalation': 'Lead escalated',
        };

        return {
          action: actionMap[event.eventType] || event.eventType,
          target: lead?.email || event.leadId,
          time: event.createdAt,
        };
      }),
    );

    return new Response(JSON.stringify({
      stats: {
        totalLeads,
        responseRate,
        avgResponseTime,
        bookingRate,
        leadsThisWeek,
        leadsLastWeek,
      },
      weeklyData,
      statusBreakdown,
      recentActivity,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error fetching analytics:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch analytics' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};