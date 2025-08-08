"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  ComposedChart
} from 'recharts';
import { cn } from '@/utils/cn';

export type DistributionData = {
  backlog: number;
  in_progress: number;
  review: number;
  done: number;
};

export type BurndownPoint = { date: string; remaining: number };

export type VelocityPoint = { sprintId: string; velocity: number };

export function DistributionBar({
  data,
  className
}: {
  data?: DistributionData;
  className?: string;
}) {
  if (!data) {
    return <p className="text-sm text-zinc-500">No distribution data.</p>;
  }
  const rows = [
    { status: 'Backlog', points: data.backlog },
    { status: 'In Progress', points: data.in_progress },
    { status: 'Review', points: data.review },
    { status: 'Done', points: data.done }
  ];
  return (
    <div className={cn('w-full h-72', className)} aria-label="Story points by status" role="img">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="status" aria-label="Status" />
          <YAxis aria-label="Points" />
          <Tooltip />
          <Legend />
          <Bar dataKey="points" name="Points" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BurndownLine({
  data,
  className
}: {
  data?: BurndownPoint[];
  className?: string;
}) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-zinc-500">No burndown data.</p>;
  }
  return (
    <div className={cn('w-full h-72', className)} aria-label="Sprint burndown" role="img">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" aria-label="Date" />
          <YAxis aria-label="Remaining points" />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="remaining" name="Remaining" stroke="#ef4444" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VelocityCombo({
  data,
  className
}: {
  data?: VelocityPoint[];
  className?: string;
}) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-zinc-500">No velocity data.</p>;
  }
  const rows = data.map((v, idx) => ({ name: `S${idx + 1}`, velocity: Number(v.velocity ?? 0) }));
  return (
    <div className={cn('w-full h-72', className)} aria-label="Velocity per sprint" role="img">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" aria-label="Sprint" />
          <YAxis aria-label="Velocity (pts/day)" />
          <Tooltip />
          <Legend />
          <Bar dataKey="velocity" name="Velocity (bar)" fill="#10b981" />
          <Line type="monotone" dataKey="velocity" name="Velocity (line)" stroke="#10b981" strokeWidth={2} dot />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default { DistributionBar, BurndownLine, VelocityCombo };


