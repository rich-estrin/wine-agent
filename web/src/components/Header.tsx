import { useState } from 'react';
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="bg-[#141617] border-b border-[#434549]">
      {/* Top Utility Bar */}
      <div className="border-b border-[#434549]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-2 text-xs">
            {/* Social Links */}
            <div className="flex items-center gap-3">
              <a
                href="https://www.facebook.com/northwestwinereport/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-[#deb77d]"
                aria-label="Facebook"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
              <a
                href="https://www.instagram.com/northwestwinereport/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-[#deb77d]"
                aria-label="Instagram"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                </svg>
              </a>
              <a
                href="https://www.northwestwinereport.com/contact"
                className="text-gray-400 hover:text-[#deb77d]"
                aria-label="Contact"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </a>
            </div>

            {/* Account Links */}
            <div className="flex items-center gap-4 text-gray-400">
              <a
                href="https://www.northwestwinereport.com/login"
                className="hover:text-[#deb77d] uppercase tracking-wider"
              >
                My Account
              </a>
              <span className="text-[#434549]">|</span>
              <a
                href="https://www.northwestwinereport.com/subscribe"
                className="hover:text-[#deb77d] uppercase tracking-wider"
              >
                Subscribe
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Logo Section */}
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4">
          <a
            href="https://www.northwestwinereport.com/"
            className="flex justify-center"
          >
            <img
              src="https://www.northwestwinereport.com/wp-content/uploads/2023/06/SPS_Gold_TransparentBg-600-116-1.png"
              alt="Northwest Wine Report Logo"
              className="h-14"
            />
          </a>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="border-t border-[#434549]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-center gap-8 py-3 text-sm">
            <a
              href="https://www.northwestwinereport.com/"
              className="text-gray-300 hover:text-[#deb77d] uppercase tracking-wide"
            >
              Home
            </a>
            <a
              href="https://www.northwestwinereport.com/news"
              className="text-gray-300 hover:text-[#deb77d] uppercase tracking-wide"
            >
              News
            </a>
            <a
              href="https://www.northwestwinereport.com/features"
              className="text-gray-300 hover:text-[#deb77d] uppercase tracking-wide"
            >
              Features
            </a>
            <a
              href="https://www.northwestwinereport.com/opinion"
              className="text-gray-300 hover:text-[#deb77d] uppercase tracking-wide"
            >
              Opinion
            </a>
            <span className="text-[#deb77d] uppercase tracking-wide font-medium flex items-center gap-1">
              Wine Search
              <ChevronDownIcon className="w-3 h-3" />
            </span>
            <a
              href="https://www.northwestwinereport.com/wine-articles"
              className="text-gray-300 hover:text-[#deb77d] uppercase tracking-wide"
            >
              Reviews
            </a>
            <a
              href="https://www.northwestwinereport.com/resources"
              className="text-gray-300 hover:text-[#deb77d] uppercase tracking-wide"
            >
              Resources
            </a>
            <a
              href="https://www.northwestwinereport.com/about"
              className="text-gray-300 hover:text-[#deb77d] uppercase tracking-wide"
            >
              About
            </a>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="text-gray-300 hover:text-[#deb77d]"
              aria-label="Search"
            >
              <MagnifyingGlassIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Search Field */}
          {searchOpen && (
            <div className="pb-4">
              <input
                type="text"
                placeholder="Search..."
                className="w-full px-4 py-2 rounded bg-[#212326] text-white placeholder-gray-500 border border-[#434549] focus:outline-none focus:border-[#deb77d]"
                autoFocus
              />
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
