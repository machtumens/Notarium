import React, { useState } from 'react';

export default function ChatInput({ onSubmit }: { onSubmit: (msg: string) => void }) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSubmit(input.trim());
      setInput('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white/70">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type your message..."
        className="w-full p-3 bg-white/60 text-[#1c2a22] placeholder-[#5b6f62] border border-[#1c2a22]/[0.12] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2e7d52] focus:border-transparent resize-none"
        rows={3}
      />
      <button
        type="submit"
        className="mt-2 px-4 py-2 bg-[#2e7d52] text-[#1c2a22] rounded hover:bg-[#2a6c47]"
      >
        Send
      </button>
    </form>
  );
}
