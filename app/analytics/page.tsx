"use client";

// Analytics Dashboard
//
// This client component fetches analytics metrics from the /api/analytics
// endpoint and displays a few simple cards summarising the data. It can
// be extended with charts and additional visualisations. The backend
// endpoint uses Redis caching so repeated requests within five minutes
// are fast.

import { useEffect, useState } from 'react';

interface AnalyticsData {
  distribution: { backlog: number; in_progress: number; review: number; done: number };
  velocityPerSprint: Array<{ sprintId: string; velocity: number }>;
  aiUsage: { totalTokens: number };
  burndown: Array<{ date: string; remaining: number }>;
  error?: string;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await fetch('/api/analytics');
        const json = await res.json();
        setData(json);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch analytics', error);
        setData({
          distribution: { backlog: 0, in_progress: 0, review: 0, done: 0 },
          velocity: 0,
          aiUsage: { totalTokens: 0 },
          burndown: [],
          error: 'Failed to fetch analytics'
        });
      } finally {
        setLoading(false);
      }
    };
    void fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="container mx-auto py-6">
        <h1 className="text-2xl font-bold mb-4">Analytics</h1>
        <p>Loading analytics…</p>
      </div>
    );
  }
  if (!data || data.error) {
    return (
      <div className="container mx-auto py-6">
        <h1 className="text-2xl font-bold mb-4">Analytics</h1>
        <p>Failed to load analytics.</p>
      </div>
    );
  }
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-4">Analytics</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded bg-zinc-100 dark:bg-zinc-900 p-4">
          <h2 className="font-medium mb-2">Story Points Distribution</h2>
          <ul className="text-sm space-y-1">
            <li>Backlog: {data.distribution.backlog}</li>
            <li>In Progress: {data.distribution.in_progress}</li>
            <li>Review: {data.distribution.review}</li>
            <li>Done: {data.distribution.done}</li>
          </ul>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-zinc-900 p-4">
          <h2 className="font-medium mb-2">Velocity per Sprint (pts/day)</h2>
          <ul className="text-sm space-y-1">
            {data.velocityPerSprint.map((v) => (
              <li key={v.sprintId}>{v.sprintId.slice(0, 8)}…: {v.velocity.toFixed(2)}</li>
            ))}
            {data.velocityPerSprint.length === 0 && <li>No sprints in range.</li>}
          </ul>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-zinc-900 p-4">
          <h2 className="font-medium mb-2">AI Usage</h2>
          <p className="text-sm">{data.aiUsage.totalTokens} tokens consumed.</p>
        </div>
        <div className="rounded bg-zinc-100 dark:bg-zinc-900 p-4">
          <h2 className="font-medium mb-2">Burndown (points)</h2>
          <div className="w-full h-40 flex items-end gap-1">
            {data.burndown.map((item) => (
              <div key={item.date} className="flex-1 flex flex-col items-center">
                <div className="w-full bg-blue-500" style={{ height: `${Math.min(item.remaining, 100)}%` }} />
                <span className="text-[10px] mt-1">{item.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}