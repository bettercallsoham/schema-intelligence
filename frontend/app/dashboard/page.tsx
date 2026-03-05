'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faTriangleExclamation,
  faWandMagicSparkles,
  faArrowUp,
  faArrowDown,
  faDatabase,
  faChartLine,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { schemaApi, impactApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { databases, selectedDatabaseId } = useApp();

  const selectedDatabase = databases.find((db) => db.id === selectedDatabaseId) || databases[0];

  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots', selectedDatabaseId],
    queryFn: () => schemaApi.getAll(selectedDatabaseId || undefined, 1, 10),
    enabled: !!selectedDatabaseId,
  });

  const latestSnapshot = snapshots?.data?.[0];
  const snapshotId = latestSnapshot?.id || latestSnapshot?.snapshotId;

  const { data: impactScore, isLoading: scoreLoading } = useQuery({
    queryKey: ['impact-score', snapshotId],
    queryFn: () => impactApi.getScore(snapshotId!),
    enabled: !!snapshotId,
  });

  const { data: rankedIssues, isLoading: issuesLoading } = useQuery({
    queryKey: ['ranked-issues', snapshotId],
    queryFn: () => impactApi.getRankedIssues(snapshotId!, 10),
    enabled: !!snapshotId,
  });

  const handleNewScan = () => {
    router.push('/schemas');
  };

  if (snapshotsLoading || scoreLoading || issuesLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Dashboard' }]} onNewScan={handleNewScan}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <div className="text-text-primary">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!selectedDatabaseId || databases.length === 0) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Dashboard' }]} onNewScan={handleNewScan}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <Card>
            <CardContent className="p-8 text-center">
              <FontAwesomeIcon icon={faDatabase} className="text-text-muted text-4xl mb-4" />
              <h2 className="text-h2 text-text-primary mb-2">No Database Selected</h2>
              <p className="text-body text-text-secondary mb-6">
                Please ingest a database schema to view dashboard details.
              </p>
              <Button variant="primary" onClick={() => router.push('/databases')} icon={faDatabase}>
                Go to Databases
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const stats = impactScore
    ? {
        healthScore: impactScore.healthScore,
        healthScoreChange: 0,
        criticalIssues: impactScore.breakdown.critical,
        criticalIssuesChange: 0,
        tablesScanned: latestSnapshot?.tablesCount || 0,
        columnsAnalyzed: 0,
        optimizationPotential: Math.max(0, 100 - impactScore.healthScore),
      }
    : {
        healthScore: 100,
        healthScoreChange: 0,
        criticalIssues: 0,
        criticalIssuesChange: 0,
        tablesScanned: 0,
        columnsAnalyzed: 0,
        optimizationPotential: 0,
      };

  const issuesOverview = impactScore
    ? {
        critical: impactScore.breakdown.critical,
        high: impactScore.breakdown.high,
        medium: impactScore.breakdown.medium,
        low: impactScore.breakdown.low,
        criticalChange: 0,
        highChange: 0,
        mediumChange: 0,
        lowChange: 0,
      }
    : {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        criticalChange: 0,
        highChange: 0,
        mediumChange: 0,
        lowChange: 0,
      };

  const recentScans = snapshots?.data?.slice(0, 5).map((snapshot: any) => ({
    id: snapshot.id || snapshot.snapshotId,
    databaseId: snapshot.databaseName,
    databaseName: snapshot.databaseName,
    tablesScanned: snapshot.tablesCount || 0,
    issuesFound: snapshot.issuesCount || 0,
    healthScore: 100,
    duration: 'N/A',
    createdAt: snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'N/A',
    status: 'completed' as const,
    version: snapshot.version || 1,
  })) || [];

  return (
    <AppLayout breadcrumbs={[{ label: 'Dashboard' }]} onNewScan={handleNewScan}>
      <div className="flex-1 p-xl overflow-y-auto">
        <div className="space-y-xl max-w-7xl">
          {/* Welcome Section */}
          <section>
            <div className="flex items-center justify-between mb-lg">
              <div>
                <h1 className="text-h1 text-text-primary">Good morning, {user?.name || 'User'}!</h1>
                <p className="text-body-lg text-text-secondary mt-1">Here's your database health summary</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleNewScan}
                  className="bg-primary text-white h-10 px-4 rounded-md text-sm font-medium hover:bg-primary-dark transition-colors"
                >
                  <FontAwesomeIcon icon={faSearch} className="mr-2" />
                  New Scan
                </button>
                <button
                  onClick={() => router.push('/issues')}
                  className="border border-border text-text-secondary h-10 px-4 rounded-md text-sm hover:bg-surface-light transition-colors"
                >
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mr-2" />  
                  View Issues
                </button>
                <button
                  onClick={() => router.push('/sql-generator')}
                  className="border border-border text-text-secondary h-10 px-4 rounded-md text-sm hover:bg-surface-light transition-colors"
                >
                  <FontAwesomeIcon icon={faWandMagicSparkles} className="mr-2" />
                  Generate SQL
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
              <Card>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-success rounded-full"></div>
                    <span className="text-body text-text-primary font-medium">
                      {selectedDatabase?.name || 'No Database'} {selectedDatabase ? 'Connected' : 'Not Selected'}
                    </span>
                  </div>
                  <p className="text-body-sm text-text-muted mt-1">
                    {stats.tablesScanned} tables monitored
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <h4 className="text-h4 text-text-primary">Last Scan</h4>
                  <p className="text-body text-text-secondary mt-1">
                    {recentScans[0]?.createdAt || 'No scans yet'} • {recentScans[0]?.databaseName || 'N/A'}
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* KPI Cards */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg">
            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-h4 text-text-primary">Health Score</h3>
                  <div className="w-12 h-12 relative">
                    <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#334155"
                        strokeWidth="2"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#16A34A"
                        strokeWidth="2"
                        strokeDasharray={`${stats.healthScore}, 100`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-semibold text-severity-healthy">{stats.healthScore}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-muted">Current score</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-h4 text-text-primary">Critical Issues</h3>
                  <div className="w-6 h-6 bg-severity-critical/20 rounded-full flex items-center justify-center">
                    <span className="text-xs font-semibold text-severity-critical">{stats.criticalIssues}</span>
                  </div>
                </div>
                <p className="text-display text-severity-critical">{stats.criticalIssues}</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-text-muted">Requires attention</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-h4 text-text-primary">Tables Scanned</h3>
                  <FontAwesomeIcon icon={faDatabase} className="text-info text-xl" />
                </div>
                <p className="text-display text-text-primary">{stats.tablesScanned}</p>
                <p className="text-body-sm text-text-muted">Total tables</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-h4 text-text-primary">Optimization Potential</h3>
                  <FontAwesomeIcon icon={faChartLine} className="text-warning text-xl" />
                </div>
                <p className="text-display text-warning">{stats.optimizationPotential}%</p>
                <p className="text-body-sm text-text-muted">Est. performance gain</p>
              </CardContent>
            </Card>
          </section>

          {/* Issues Overview */}
          <section>
            <h2 className="text-h2 text-text-primary mb-lg">Issues Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-lg mb-lg">
              <Card hover onClick={() => router.push('/issues')}>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-h4 text-severity-critical">Critical</h4>
                    {issuesOverview.critical > 0 && (
                      <FontAwesomeIcon icon={faArrowUp} className="text-severity-critical text-sm" />
                    )}
                  </div>
                  <p className="text-display text-severity-critical">{issuesOverview.critical}</p>
                  <p className="text-body-sm text-text-muted">Issues found</p>
                </CardContent>
              </Card>

              <Card hover onClick={() => router.push('/issues')}>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-h4 text-severity-high">High</h4>
                  </div>
                  <p className="text-display text-severity-high">{issuesOverview.high}</p>
                  <p className="text-body-sm text-text-muted">Issues found</p>
                </CardContent>
              </Card>

              <Card hover onClick={() => router.push('/issues')}>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-h4 text-severity-medium">Medium</h4>
                  </div>
                  <p className="text-display text-severity-medium">{issuesOverview.medium}</p>
                  <p className="text-body-sm text-text-muted">Issues found</p>
                </CardContent>
              </Card>

              <Card hover onClick={() => router.push('/issues')}>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-h4 text-severity-low">Low</h4>
                  </div>
                  <p className="text-display text-severity-low">{issuesOverview.low}</p>
                  <p className="text-body-sm text-text-muted">Issues found</p>
                </CardContent>
              </Card>
            </div>
            <div className="text-center">
              <button
                onClick={() => router.push('/issues')}
                className="text-primary hover:text-primary-light font-medium inline-flex items-center gap-1"
              >
                View All Issues <FontAwesomeIcon icon={faArrowRight} className="ml-1" />
              </button>
            </div>
          </section>

          {/* Recent Scans */}
          <section>
            <div className="flex items-center justify-between mb-lg">
              <h2 className="text-h2 text-text-primary">Recent Scans</h2>
            </div>
            {recentScans.length > 0 ? (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface-light">
                      <tr>
                        <th className="text-left p-4 text-caption text-text-secondary font-medium">Database</th>
                        <th className="text-left p-4 text-caption text-text-secondary font-medium">Version</th>
                        <th className="text-left p-4 text-caption text-text-secondary font-medium">Tables</th>
                        <th className="text-left p-4 text-caption text-text-secondary font-medium">Issues</th>
                        <th className="text-left p-4 text-caption text-text-secondary font-medium">Date</th>
                        <th className="text-right p-4 text-caption text-text-secondary font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentScans.map((scan) => (
                        <tr key={scan.id} className="hover:bg-surface-light cursor-pointer">
                          <td className="p-4 text-body text-text-primary font-medium">{scan.databaseName}</td>
                          <td className="p-4 text-body text-text-secondary">
                            <span className="px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                              v{scan.version}
                            </span>
                          </td>
                          <td className="p-4 text-body text-text-secondary">{scan.tablesScanned}</td>
                          <td className="p-4 text-body text-text-secondary">
                            <span className={scan.issuesFound > 0 ? 'text-severity-critical' : 'text-success'}>
                              {scan.issuesFound}
                            </span>
                          </td>
                          <td className="p-4 text-body text-text-secondary">{scan.createdAt}</td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => router.push(`/schemas?snapshot=${scan.id}`)}
                              className="text-primary hover:text-primary-light text-sm font-medium"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <Card>
                <CardContent>
                  <p className="text-body text-text-secondary text-center py-8">
                    No scans yet. Start by ingesting a schema.
                  </p>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
