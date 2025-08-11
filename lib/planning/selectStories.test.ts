import assert from 'node:assert';
import test from 'node:test';
import { selectStoriesByPriorityAndDueDate } from './selectStories';

test('selectStories respects capacity with 10% overfill', () => {
  const stories = [
    { id: 'a', points: 8, priority: 3 },
    { id: 'b', points: 5, priority: 2 },
    { id: 'c', points: 3, priority: 3 },
    { id: 'd', points: 2, priority: 1 }
  ];
  const { selected, totalPoints } = selectStoriesByPriorityAndDueDate(stories as any, 10);
  assert.ok(totalPoints <= Math.round(10 * 1.1));
  // With 10% overfill, a(8) then c(3) fits exactly 11
  assert.deepStrictEqual(selected.map((s) => s.id), ['a', 'c']);
});


