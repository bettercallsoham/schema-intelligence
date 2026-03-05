'use client';

import React from 'react';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faBell,
  faChevronDown,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/contexts/AuthContext';

interface HeaderProps {
  breadcrumbs?: Array<{ label: string; href?: string }>;
  onNewScan?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  breadcrumbs = [],
  onNewScan,
}) => {
  const { user, logout } = useAuth();
  return (
    <header className="h-[56px] bg-surface border-b border-border flex-shrink-0 flex items-center justify-between px-lg">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        {breadcrumbs.length === 0 ? (
          <span className="text-text-primary">Dashboard</span>
        ) : (
          breadcrumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              {index > 0 && (
                <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
              )}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-text-primary transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className={index === breadcrumbs.length - 1 ? 'text-text-primary' : ''}>
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))
        )}
      </div>

      <div className="flex items-center gap-md">
        <button
          onClick={onNewScan}
          className="bg-primary text-white h-9 px-4 rounded-md text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          New Scan
        </button>

        <button className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-surface-light text-text-secondary transition-colors">
          <FontAwesomeIcon icon={faBell} />
        </button>

        <div className="flex items-center gap-2">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name || 'User Avatar'}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-medium">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
          )}
          <div className="relative group">
            <button className="text-text-muted hover:text-text-primary transition-colors">
              <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button
                onClick={logout}
                className="w-full text-left px-4 py-2 text-body text-text-secondary hover:bg-surface-light rounded-md"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

