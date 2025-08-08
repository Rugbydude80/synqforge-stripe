"use client";

import { useState } from 'react';

export default function AIPage() {
  // Simple client-side page to demonstrate AI story generation.  For
  // production you should fetch the organisation and project IDs from
  // context or route parameters and stream results from the AI API via
  // fetch().
  const [requirements, setRequirements] = useState('');
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const handleGenerate = async () => {
    setLoading(true);
    setStories([]);
    try {
      const res = await fetch('/api/ai/generate-stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: '',
          organisationId: '',
          requirements
        })
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';
        for (const msg of messages) {
          if (!msg.startsWith('data: ')) continue;
          const dataStr = msg.slice(6);
          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'story') {
              setStories((prev) => [...prev, data.story]);
            }
          } catch {
            // ignore invalid JSON
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="container mx-auto py-10 space-y-4">
      <h1 className="text-2xl font-bold">AI Story Generator</h1>
      <textarea
        className="w-full border p-2"
        rows={4}
        value={requirements}
        onChange={(e) => setRequirements(e.target.value)}
        placeholder="Describe your product requirements..."
      />
      <button
        className="bg-blue-500 text-white px-4 py-2 rounded"
        onClick={handleGenerate}
        disabled={!requirements || loading}
      >
        {loading ? 'Generating...' : 'Generate Stories'}
      </button>
      <div className="space-y-2">
        {stories.map((story, idx) => (
          <div key={idx} className="border p-3 rounded">
            <h2 className="font-semibold">{story.title}</h2>
            <p className="text-sm text-gray-600 whitespace-pre-line">{story.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}