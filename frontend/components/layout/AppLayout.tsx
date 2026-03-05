'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';

interface AppLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  onNewScan?: () => void;
  onSearch?: () => void;
  showSidebar?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  breadcrumbs,
  onNewScan,
  onSearch,
  showSidebar = true,
}) => {
  const { isAuthenticated, isLoading } = useAuth();
  const { databases, selectedDatabaseId, setSelectedDatabaseId } = useApp();
  const router = useRouter();

  const handleNewScan = onNewScan || (() => router.push('/databases'));
  const handleSearch = onSearch || (() => {
    // Simple search - could be enhanced
    const query = prompt('Search...');
    if (query) {
      console.log('Search:', query);
    }
  });

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-text-primary">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen">
      {showSidebar && (
        <Sidebar
          databases={databases}
          selectedDatabaseId={selectedDatabaseId ?? undefined}
          onDatabaseChange={setSelectedDatabaseId}
        />
      )}
      <div className="flex-1 flex flex-col">
        <Header
          breadcrumbs={breadcrumbs}
          onNewScan={handleNewScan}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};

