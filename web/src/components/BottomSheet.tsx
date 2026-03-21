import { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-[300] transition-colors duration-300 ${
          open ? 'bg-[rgba(26,20,16,0.55)] pointer-events-auto' : 'bg-transparent pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[301] bg-cream rounded-t-2xl flex flex-col max-h-[88vh] transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Handle row */}
        <div className="relative flex items-center justify-between px-5 pt-3 pb-0 flex-shrink-0">
          <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-9 h-1 rounded-full bg-[rgba(26,20,16,0.08)]" />
          <span className="font-cormorant text-[18px] font-normal italic text-ink tracking-[0.03em] pt-2">
            Filters
          </span>
          <button
            onClick={onClose}
            className="mt-1 w-[30px] h-[30px] rounded-full bg-[rgba(26,20,16,0.06)] flex items-center justify-center text-muted hover:bg-[rgba(26,20,16,0.1)] transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          className="overflow-y-auto flex-1 pb-[env(safe-area-inset-bottom,0px)]"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(184,146,74,0.2) transparent' }}
        >
          {children}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-warm-border flex-shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
          <button
            onClick={onClose}
            className="w-full py-3.5 font-sans text-[13px] font-medium tracking-[0.08em] uppercase text-white bg-[#7b2d3e] rounded hover:bg-[#a84458] transition-colors"
          >
            Show Results
          </button>
        </div>
      </div>
    </>
  );
}
