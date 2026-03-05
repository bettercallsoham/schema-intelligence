'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLayerGroup,
  faDatabase,
  faChevronDown,
  faChevronLeft,
  faChartPie,
  faTableList,
  faTriangleExclamation,
  faRobot,
  faWandMagicSparkles,
  faCodeCompare,
  faChartLine,
  faSliders,
  faShieldHalved,
} from '@fortawesome/free-solid-svg-icons';
import type { Database, NavItem } from '@/types';

interface SidebarProps {
  databases?: Database[];
  selectedDatabaseId?: string;
  onDatabaseChange?: (databaseId: string) => void;
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'chart-pie', href: '/dashboard' },
  { id: 'databases', label: 'Databases', icon: 'database', href: '/databases' },
  { id: 'schemas', label: 'Schemas', icon: 'table-list', href: '/schemas' },
  { id: 'issues', label: 'Issues', icon: 'triangle-exclamation', href: '/issues' },
  { id: 'schema-advisor', label: 'Schema Advisor', icon: 'shield-halved', href: '/schema-advisor' },
  { id: 'ai-assistant', label: 'AI Assistant', icon: 'robot', href: '/ai-assistant' },
  { id: 'sql-generator', label: 'SQL Generator', icon: 'wand-magic-sparkles', href: '/sql-generator' },
  { id: 'compare', label: 'Compare', icon: 'code-compare', href: '/compare' },
  { id: 'analytics', label: 'Analytics', icon: 'chart-line', href: '/analytics' },
  { id: 'settings', label: 'Settings', icon: 'sliders', href: '/settings' },
];

import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

const iconMap: Record<string, IconDefinition> = {
  'chart-pie': faChartPie,
  'database': faDatabase,
  'table-list': faTableList,
  'triangle-exclamation': faTriangleExclamation,
  'robot': faRobot,
  'wand-magic-sparkles': faWandMagicSparkles,
  'code-compare': faCodeCompare,
  'chart-line': faChartLine,
  'sliders': faSliders,
  'shield-halved': faShieldHalved,
};

export const Sidebar: React.FC<SidebarProps> = ({
  databases = [],
  selectedDatabaseId,
  onDatabaseChange,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDbSelectorOpen, setIsDbSelectorOpen] = useState(false);
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedDatabase = databases.find((db) => db.id === selectedDatabaseId) || databases[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDbSelectorOpen(false);
      }
    };

    if (isDbSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDbSelectorOpen]);

  if (isCollapsed) {
    return (
      <aside className="w-16 bg-surface flex flex-col flex-shrink-0 border-r border-border">
        <div className="h-[56px] flex items-center justify-center border-b border-border">
          <FontAwesomeIcon icon={faLayerGroup} className="text-primary text-2xl" />
        </div>
        <nav className="flex-grow px-2 py-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className={`flex items-center justify-center h-11 rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary-light'
                        : 'text-text-secondary hover:bg-surface-light'
                    }`}
                    title={item.label}
                  >
                    <FontAwesomeIcon icon={iconMap[item.icon]} className="w-5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="p-2 border-t border-border">
          <button
            onClick={() => setIsCollapsed(false)}
            className="w-full flex items-center justify-center h-11 rounded-md hover:bg-surface-light text-text-secondary"
            title="Expand"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="rotate-180" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-surface flex flex-col flex-shrink-0 border-r border-border">
      <div className="h-[56px] flex items-center px-lg border-b border-border">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faLayerGroup} className="text-primary text-2xl" />
          <h1 className="font-bold text-xl text-text-primary">Schema Intel</h1>
        </div>
      </div>

      <div className="p-md">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDbSelectorOpen(!isDbSelectorOpen)}
            className="w-full h-10 flex items-center justify-between px-3 bg-surface-light rounded-md hover:bg-opacity-80 transition-all"
          >
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faDatabase} className="text-primary-light" />
              <span className="text-body text-text-primary truncate">
                {selectedDatabase?.name || 'Select Database'}
              </span>
            </div>
            <FontAwesomeIcon 
              icon={faChevronDown} 
              className={`text-text-muted text-xs transition-transform ${isDbSelectorOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {isDbSelectorOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
              {databases.length > 0 ? (
                databases.map((db) => (
                  <button
                    key={db.id}
                    onClick={() => {
                      onDatabaseChange?.(db.id);
                      setIsDbSelectorOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-body hover:bg-surface-light first:rounded-t-md last:rounded-b-md transition-colors ${
                      selectedDatabaseId === db.id ? 'bg-primary/10 text-primary font-medium' : 'text-text-primary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{db.name}</span>
                      {db.tablesCount !== undefined && (
                        <span className="text-caption text-text-muted ml-2">
                          {db.tablesCount} tables
                        </span>
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-3 py-4 text-center">
                  <p className="text-body-sm text-text-muted">No databases found</p>
                  <p className="text-caption text-text-muted mt-1">Ingest a schema to get started</p>
                  <a 
                    href="/databases" 
                    className="text-primary hover:text-primary-light text-body-sm mt-2 inline-block"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.href = '/databases';
                    }}
                  >
                    Go to Databases →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <nav className="flex-grow px-md">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 h-11 px-3 rounded-md transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary-light border-l-2 border-primary'
                      : 'hover:bg-surface-light text-text-secondary'
                  }`}
                >
                  <FontAwesomeIcon icon={iconMap[item.icon]} className="w-5 text-center" />
                  <span className={`text-body ${isActive ? 'font-medium' : ''}`}>{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto bg-severity-critical/20 text-severity-critical text-xs px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-md border-t border-border">
        <button
          onClick={() => setIsCollapsed(true)}
          className="w-full flex items-center justify-between h-11 px-3 rounded-md hover:bg-surface-light text-text-secondary"
        >
          <span className="text-body">Collapse</span>
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
      </div>
    </aside>
  );
};

