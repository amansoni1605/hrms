'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

export function WorkspaceShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer whenever the route changes (user tapped a nav link)
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="ws-root">
      {/* Backdrop */}
      <div
        className={`ws-overlay${open ? ' ws-overlay--open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Single hamburger / close toggle — only button that controls the drawer */}
      <button
        className="ws-hamburger"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Sidebar drawer — no separate close button inside */}
      <div className={`ws-drawer${open ? ' ws-drawer--open' : ''}`}>
        {sidebar}
      </div>

      {/* Main column */}
      <div className="ws-main">
        {children}
      </div>
    </div>
  );
}
