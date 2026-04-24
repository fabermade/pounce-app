import React from 'react';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 border-blue-200',
  contacted: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  customer_waiting: 'bg-orange-100 text-orange-800 border-orange-200',
  scheduled: 'bg-green-100 text-green-800 border-green-200',
  closed_won: 'bg-green-100 text-green-800 border-green-200',
  closed_lost: 'bg-gray-100 text-gray-600 border-gray-200',
  escalated: 'bg-red-100 text-red-800 border-red-200',
  opted_out: 'bg-gray-100 text-gray-400 border-gray-200',
};

const statusLabels: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  customer_waiting: 'Customer Waiting',
  scheduled: 'Scheduled',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
  escalated: 'Escalated',
  opted_out: 'Opted Out',
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colorClass = statusColors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  const label = statusLabels[status] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {label}
    </span>
  );
}