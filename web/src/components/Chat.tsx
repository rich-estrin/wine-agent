import { useState, useEffect, useRef } from 'react';
import { sendChatMessage, type ChatMessage as ChatMessageType } from '../api';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (content: string) => {
    const userMessage: ChatMessageType = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await sendChatMessage(newMessages);
      setMessages([...newMessages, { role: 'assistant', content: response }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-16rem)] flex-col">
      {/* Welcome message */}
      {messages.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900">
              Wine Expert Assistant
            </h2>
            <p className="mt-2 text-sm text-gray-500">
              Ask me anything about our collection of 3,240+ wines!
            </p>
            <div className="mt-6 space-y-2 text-left">
              <p className="text-xs text-gray-400">Try asking:</p>
              <button
                onClick={() => handleSend('Find me the highest rated wines under $40')}
                className="block w-full rounded-md bg-gray-50 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
              >
                "Find me the highest rated wines under $40"
              </button>
              <button
                onClick={() => handleSend('Show me recent Quilceda Creek reviews')}
                className="block w-full rounded-md bg-gray-50 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
              >
                "Show me recent Quilceda Creek reviews"
              </button>
              <button
                onClick={() => handleSend('What are the best Oregon Pinot Noirs?')}
                className="block w-full rounded-md bg-gray-50 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
              >
                "What are the best Oregon Pinot Noirs?"
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message history */}
      {messages.length > 0 && (
        <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4">
          {messages.map((msg, idx) => (
            <ChatMessage key={idx} role={msg.role} content={msg.content} />
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg bg-gray-100 px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: '0.1s' }}
                  />
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: '0.2s' }}
                  />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <div className="mt-4">
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
    </div>
  );
}
