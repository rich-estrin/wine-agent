export default function ChatMessage({
  role,
  content,
}: {
  role: 'user' | 'assistant';
  content: string;
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg bg-indigo-600 px-4 py-2 text-white">
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg bg-gray-100 px-4 py-2 text-gray-900">
        <p className="whitespace-pre-wrap text-sm">{content}</p>
      </div>
    </div>
  );
}
