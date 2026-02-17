export default function Header() {
  return (
    <header className="bg-[#141617] border-b border-[#434549]">
      <div className="max-w-5xl mx-auto px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between py-3 border-b border-[#434549]">
          <div className="flex items-center gap-8">
            <h1 className="text-2xl font-bold text-[#deb77d] tracking-wide">
              NORTHWEST WINE REPORT
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="text-[#deb77d]">Wine Search</span>
          </div>
        </div>

        {/* Subtitle */}
        <div className="py-2 text-center">
          <p className="text-sm text-gray-400 italic">
            Exploring wines from the Pacific Northwest
          </p>
        </div>
      </div>
    </header>
  );
}
