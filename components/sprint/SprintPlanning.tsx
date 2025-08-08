"use client";

// SprintPlanning
//
// This component provides a minimal UI for generating a sprint plan using
// the `/api/ai/sprint-planning` endpoint. It allows users to specify
// capacity, historical velocity and duration. When the plan is generated
// it displays the suggested stories and a summary message.

import { useState } from 'react';

interface SuggestedStory {
  id: string;
  title: string;
  points: number;
}

interface SprintPlan {
  summary: string;
  suggestedStories: SuggestedStory[];
}

export function SprintPlanning({ projectId }: { projectId: string }) {
  const [capacity, setCapacity] = useState<number>(10);
  const [velocity, setVelocity] = useState<number>(5);
  const [duration, setDuration] = useState<number>(14);
  const [plan, setPlan] = useState<SprintPlan | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch('/api/ai/sprint-planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          teamCapacity: capacity,
          historicalVelocity: velocity,
          sprintDuration: duration
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate plan');
      } else {
        setPlan(data);
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      setError('Failed to generate plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="capacity">
          Team Capacity (total story points)
        </label>
        <input
          id="capacity"
          type="number"
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-sm"
          min={1}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="velocity">
          Historical Velocity (points per day)
        </label>
        <input
          id="velocity"
          type="number"
          value={velocity}
          onChange={(e) => setVelocity(Number(e.target.value))}
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-sm"
          min={1}
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="duration">
          Sprint Duration (days)
        </label>
        <input
          id="duration"
          type="number"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-full rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-sm"
          min={1}
        />
      </div>
      <button
        onClick={generatePlan}
        disabled={loading}
        className="rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-50"
      >
        {loading ? 'Generating…' : 'Generate Plan'}
      </button>
      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}
      {plan && (
        <div className="space-y-4">
          <p className="font-medium">{plan.summary}</p>
          <div className="text-sm text-zinc-600 dark:text-zinc-300">
            Total points: {plan.suggestedStories.reduce((sum, s) => sum + (s.points || 0), 0)} / {capacity}
          </div>
          {plan.suggestedStories.reduce((sum, s) => sum + (s.points || 0), 0) > capacity && (
            <div className="text-sm text-orange-600">Warning: Selected points exceed capacity.</div>
          )}
          <ul className="list-disc pl-5 space-y-1">
            {plan.suggestedStories.map((story) => (
              <li key={story.id}>
                {story.title} <span className="text-xs text-zinc-500">({story.points} pts)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}