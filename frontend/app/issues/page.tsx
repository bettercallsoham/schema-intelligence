'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload,
  faCheckDouble,
  faChartLine,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/contexts/AppContext';
import { schemaApi, impactApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import type { Issue } from '@/types';

export default function IssuesPage() {
  const router = useRouter();
  const { selectedDatabaseId, databases } = useApp();
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'severity' | 'improvement'>('severity');

  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots', selectedDatabaseId],
    queryFn: () => schemaApi.getAll(selectedDatabaseId || undefined, 1, 1),
    enabled: !!selectedDatabaseId,
  });

  // Handle both direct array and paginated response
  const snapshotArray = Array.isArray(snapshots) 
    ? snapshots 
    : (snapshots?.data && Array.isArray(snapshots.data) ? snapshots.data : []);
  
  const latestSnapshot = snapshotArray[0];
  const snapshotId = latestSnapshot?.id || latestSnapshot?.snapshotId;

  const { data: issues, isLoading } = useQuery({
    queryKey: ['ranked-issues', snapshotId],
    queryFn: () => impactApi.getRankedIssues(snapshotId!, 100),
    enabled: !!snapshotId,
  });

  const filteredIssues = (issues?.filter((issue) => {
    if (selectedSeverity !== 'all') {
      const issueSeverity = String(issue.severity).toUpperCase();
      const selectedSeverityUpper = selectedSeverity.toUpperCase();
      if (issueSeverity !== selectedSeverityUpper) return false;
    }
    return true;
  }) || []).sort((a, b) => {
    if (sortBy === 'improvement') {
      // Sort by predicted improvement (highest first), then by severity
      const aImprovement = a.predictedImprovement ?? -1;
      const bImprovement = b.predictedImprovement ?? -1;
      if (bImprovement !== aImprovement) {
        return bImprovement - aImprovement;
      }
    }
    // Default: sort by severity (CRITICAL > HIGH > MEDIUM > LOW)
    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const aIndex = severityOrder.indexOf(String(a.severity).toUpperCase());
    const bIndex = severityOrder.indexOf(String(b.severity).toUpperCase());
    return aIndex - bIndex;
  });

  const severityCounts = {
    critical: issues?.filter((i) => String(i.severity).toUpperCase() === 'CRITICAL').length || 0,
    high: issues?.filter((i) => String(i.severity).toUpperCase() === 'HIGH').length || 0,
    medium: issues?.filter((i) => String(i.severity).toUpperCase() === 'MEDIUM').length || 0,
    low: issues?.filter((i) => String(i.severity).toUpperCase() === 'LOW').length || 0,
  };

  const severityColors: Record<string, string> = {
    CRITICAL: 'severity-critical',
    HIGH: 'severity-high',
    MEDIUM: 'severity-medium',
    LOW: 'severity-low',
  };

  if (isLoading || snapshotsLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Issues' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <div className="text-text-primary">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: 'Issues' }]}>
      <div className="flex-1 p-xl overflow-y-auto">
        <div className="space-y-xl">
          {/* Page Header */}
          <section>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-h1 text-text-primary">Issues</h1>
                <p className="text-body-lg text-text-secondary mt-1">
                  Performance issues and optimization recommendations
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  icon={faDownload}
                  onClick={() => {
                    if (issues && issues.length > 0) {
                      const csv = [
                        ['Severity', 'Category', 'Title', 'Description', 'Table', 'Column', 'Predicted Improvement %'].join(','),
                        ...issues.map(i => [
                          i.severity,
                          i.category,
                          `"${i.title}"`,
                          `"${i.description}"`,
                          i.tableName || '',
                          i.columnName || '',
                          i.predictedImprovement !== null && i.predictedImprovement !== undefined 
                            ? i.predictedImprovement.toFixed(2) 
                            : ''
                        ].join(','))
                      ].join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `issues-${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                    }
                  }}
                >
                  Export
                </Button>
              </div>
            </div>
          </section>

          {/* Filter Bar */}
          <Card>
            <CardContent>
              <div className="flex flex-wrap items-center gap-4">
                {/* Severity Filter */}
                <div className="flex items-center gap-2">
                  <span className="text-body-sm text-text-secondary font-medium">Severity:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedSeverity('all')}
                      className={`px-3 py-1 text-sm rounded-md ${
                        selectedSeverity === 'all'
                          ? 'bg-primary text-white'
                          : 'bg-surface-light text-text-secondary hover:bg-border'
                      }`}
                    >
                      All
                    </button>
                    {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((severity) => (
                      <button
                        key={severity}
                        onClick={() => setSelectedSeverity(severity)}
                        className={`px-3 py-1 text-sm rounded-md ${
                          selectedSeverity === severity
                            ? `bg-${severityColors[severity]} text-white`
                            : 'bg-surface-light text-text-secondary hover:bg-border'
                        }`}
                      >
                        {severity.charAt(0) + severity.slice(1).toLowerCase()} ({severityCounts[severity.toLowerCase() as keyof typeof severityCounts]})
                      </button>
                    ))}
                  </div>
                </div>
                {/* Sort Option */}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-body-sm text-text-secondary font-medium">Sort by:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSortBy('severity')}
                      className={`px-3 py-1 text-sm rounded-md ${
                        sortBy === 'severity'
                          ? 'bg-primary text-white'
                          : 'bg-surface-light text-text-secondary hover:bg-border'
                      }`}
                    >
                      Severity
                    </button>
                    <button
                      onClick={() => setSortBy('improvement')}
                      className={`px-3 py-1 text-sm rounded-md flex items-center gap-1 ${
                        sortBy === 'improvement'
                          ? 'bg-primary text-white'
                          : 'bg-surface-light text-text-secondary hover:bg-border'
                      }`}
                    >
                      <FontAwesomeIcon icon={faChartLine} className="text-xs" />
                      Improvement
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Issues List */}
          <section>
            {filteredIssues.length > 0 ? (
              <div className="space-y-md">
                {filteredIssues.map((issue) => (
                  <Card key={issue.id} hover>
                    <CardContent>
                      <div className="flex items-start gap-4">
                        <div className={`w-2 h-2 bg-${severityColors[issue.severity]} rounded-full mt-2 flex-shrink-0`}></div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-h4 text-text-primary">{issue.title}</h3>
                            <span
                              className={`text-caption px-2 py-1 rounded-md bg-${severityColors[issue.severity]}/20 text-${severityColors[issue.severity]}`}
                            >
                              {issue.severity}
                            </span>
                            <span className="text-caption text-text-muted bg-surface-light px-2 py-1 rounded-md">
                              {issue.category}
                            </span>
                          </div>
                          <p className="text-body text-text-secondary mb-3">{issue.description}</p>
                          {issue.tableName && (
                            <p className="text-body-sm text-text-muted mb-3">
                              Table: <span className="font-mono">{issue.tableName}</span>
                              {issue.columnName && (
                                <>
                                  {' • Column: '}
                                  <span className="font-mono">{issue.columnName}</span>
                                </>
                              )}
                            </p>
                          )}
                          {issue.recommendation && (
                            <div className="bg-surface-light p-3 rounded-md mb-3">
                              <p className="text-body-sm text-text-primary font-medium mb-1">Recommendation:</p>
                              <p className="text-body-sm text-text-secondary">{issue.recommendation}</p>
                            </div>
                          )}
                          {/* ML Prediction Display */}
                          {issue.predictedImprovement !== null && issue.predictedImprovement !== undefined && 
                           (issue.category === 'index' || issue.category === 'foreign-keys') && (
                            <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-3 rounded-md mb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <FontAwesomeIcon icon={faWandMagicSparkles} className="text-primary" />
                                <p className="text-body-sm text-text-primary font-semibold">
                                  Expected Performance Improvement
                                </p>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="text-h3 font-bold text-primary">
                                  {issue.predictedImprovement.toFixed(1)}%
                                </span>
                                <span className="text-body-sm text-text-secondary">
                                  predicted improvement from adding this index
                                </span>
                              </div>
                              <p className="text-caption text-text-muted mt-1">
                                Powered by ML model (LightGBM)
                              </p>
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => router.push(`/sql-generator?issueId=${issue.id}`)}
                            >
                              Generate SQL
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent>
                  <div className="text-center py-8">
                    {!selectedDatabaseId ? (
                      <>
                        <p className="text-body text-text-secondary mb-4">
                          {databases.length > 0 
                            ? 'Please select a database from the sidebar to view issues.'
                            : 'No databases found. Please ingest a schema first.'}
                        </p>
                        {databases.length === 0 && (
                          <Button variant="primary" onClick={() => router.push('/databases')}>
                            Go to Databases
                          </Button>
                        )}
                      </>
                    ) : !snapshotId ? (
                      <p className="text-body text-text-secondary">
                        No snapshot found for this database. Please ingest a schema first.
                      </p>
                    ) : (
                      <p className="text-body text-text-secondary">
                        No issues found for this snapshot. Your schema looks good! 🎉
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
