export type StoryLike = { id: string; points?: number | null; priority?: number | null; due_date?: string | null };

export function selectStoriesByPriorityAndDueDate(stories: StoryLike[], capacityPoints: number): { selected: StoryLike[]; totalPoints: number } {
  const target = Math.round(capacityPoints * 1.1);
  const sorted = [...stories].sort((a, b) => (b.priority || 0) - (a.priority || 0) || (new Date(a.due_date || '2100-01-01').getTime() - new Date(b.due_date || '2100-01-01').getTime()));
  const selected: StoryLike[] = [];
  let total = 0;
  for (const s of sorted) {
    const p = s.points || 0;
    if (total + p > target) continue;
    selected.push(s);
    total += p;
  }
  return { selected, totalPoints: total };
}


