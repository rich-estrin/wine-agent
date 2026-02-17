import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { Wine } from '../types';
import RatingDisplay from './RatingDisplay';

export default function WineDetail({
  wine,
  onClose,
}: {
  wine: Wine | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={wine !== null} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-2 md:p-4">
        <DialogPanel className="w-full max-w-2xl max-h-[90vh] md:max-h-[85vh] overflow-y-auto rounded-xl bg-white p-4 md:p-6 shadow-xl">
          {wine && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-wide">
                    {wine.brandName}
                  </p>
                  <DialogTitle className="text-xl font-bold text-gray-900">
                    {wine.wineName}
                  </DialogTitle>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-4">
                <RatingDisplay rating={wine.rating} size="lg" />
                <span className="text-lg font-semibold text-gray-900">
                  {wine.price}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {wine.mainVarietal && (
                  <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700">
                    {wine.mainVarietal}
                  </span>
                )}
                {wine.type && (
                  <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                    {wine.type}
                  </span>
                )}
                {wine.region && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {wine.region}
                  </span>
                )}
                {wine.ava && (
                  <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                    {wine.ava}
                  </span>
                )}
                {wine.vintage && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {wine.vintage}
                  </span>
                )}
              </div>

              {wine.review && (
                <div className="mt-5">
                  <h4 className="text-sm font-semibold text-gray-700 mb-1">
                    Review
                  </h4>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {wine.review}
                  </p>
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {wine.publicationDate && (
                  <div>
                    <span className="text-gray-400">Published:</span>{' '}
                    <span className="text-gray-700">
                      {wine.publicationDate}
                    </span>
                  </div>
                )}
                {wine.tastingDate && (
                  <div>
                    <span className="text-gray-400">Tasted:</span>{' '}
                    <span className="text-gray-700">{wine.tastingDate}</span>
                  </div>
                )}
                {wine.setting && (
                  <div>
                    <span className="text-gray-400">Setting:</span>{' '}
                    <span className="text-gray-700">{wine.setting}</span>
                  </div>
                )}
                {wine.purchasedProvided && (
                  <div>
                    <span className="text-gray-400">Source:</span>{' '}
                    <span className="text-gray-700">
                      {wine.purchasedProvided}
                    </span>
                  </div>
                )}
              </div>

              {wine.hyperlink && (
                <div className="mt-5">
                  <a
                    href={wine.hyperlink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:text-indigo-800 underline"
                  >
                    View full review
                  </a>
                </div>
              )}
            </>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
