"use client";

import { useEffect, useState } from 'react';
import { DistributionBar, BurndownLine, VelocityCombo } from '@/components/analytics/Charts';
import { toast } from '@/components/ui/Toasts/use-toast';

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
        const json = (await res.json()) as AnalyticsData;
        if (!res.ok || (json as any).error) {
          throw new Error((json as any).error || 'Request failed');
        }
        setData(json);
      } catch (error) {
        toast({ title: 'Analytics error', description: 'Failed to load analytics' });
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    void fetchAnalytics();
  }, []);

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-1">Analytics</h1>
      <p className="text-sm text-zinc-600 mb-4">See cross-project insights on the <a href="/dashboard" className="text-blue-600 underline">Dashboard</a>.</p>
      {loading && <p>Loading analytics…</p>}
      {!loading && !data && <p>Failed to load analytics.</p>}
      {!loading && data && (
        <div className="grid grid-cols-1 gap-6">
          <section className="rounded border p-4 bg-white dark:bg-zinc-900">
            <h2 className="font-semibold mb-2">Story Points Distribution</h2>
            <DistributionBar data={data.distribution} />
          </section>
          <section className="rounded border p-4 bg-white dark:bg-zinc-900">
            <h2 className="font-semibold mb-2">Sprint Burndown</h2>
            <BurndownLine data={data.burndown} />
          </section>
          <section className="rounded border p-4 bg-white dark:bg-zinc-900">
            <h2 className="font-semibold mb-2">Velocity per Sprint (pts/day)</h2>
            <VelocityCombo data={data.velocityPerSprint} />
          </section>
          <section className="rounded border p-4 bg-white dark:bg-zinc-900">
            <h2 className="font-semibold mb-2">AI Usage</h2>
            <p className="text-sm">{data.aiUsage.totalTokens} tokens consumed.</p>
          </section>
        </div>
      )}
    </div>
  );
}