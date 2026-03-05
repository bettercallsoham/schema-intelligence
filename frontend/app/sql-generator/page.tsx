'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faWandMagicSparkles,
  faCode,
  faCopy,
  faCheck,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/contexts/AppContext';
import { recommendationApi, impactApi, schemaApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

function SQLGeneratorPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const issueIdParam = searchParams.get('issueId');
  const { selectedDatabaseId } = useApp();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(issueIdParam);

  const { data: snapshotsResponse, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots', selectedDatabaseId],
    queryFn: () => schemaApi.getAll(selectedDatabaseId || undefined, 1, 1),
    enabled: !!selectedDatabaseId,
  });

  // Handle both direct array and paginated response
  const snapshotArray = Array.isArray(snapshotsResponse) 
    ? snapshotsResponse 
    : (snapshotsResponse?.data && Array.isArray(snapshotsResponse.data) ? snapshotsResponse.data : []);
  
  const latestSnapshot = snapshotArray[0];
  const snapshotId = latestSnapshot?.id || latestSnapshot?.snapshotId;

  const { data: issues, isLoading: issuesLoading } = useQuery({
    queryKey: ['ranked-issues', snapshotId],
    queryFn: () => impactApi.getRankedIssues(snapshotId!, 50),
    enabled: !!snapshotId,
  });

  const { data: recommendations, isLoading: recommendationsLoading, refetch: refetchRecommendations } = useQuery({
    queryKey: ['recommendations', selectedIssueId],
    queryFn: () => recommendationApi.getForIssue(selectedIssueId!),
    enabled: !!selectedIssueId,
  });

  const handleGenerateForIssue = async (issueId: string) => {
    try {
      await recommendationApi.generate(issueId);
      setSelectedIssueId(issueId);
      refetchRecommendations();
    } catch (error: any) {
      console.error('Failed to generate recommendations:', error);
      alert(error.response?.data?.message || 'Failed to generate SQL recommendations');
    }
  };

  const handleCopy = (sql: string, recId: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(recId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (snapshotsLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: 'SQL Generator' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <div className="text-text-primary">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!selectedDatabaseId) {
    return (
      <AppLayout breadcrumbs={[{ label: 'SQL Generator' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <Card>
            <div className="p-8 text-center">
              <p className="text-body text-text-secondary mb-4">
                Please select a database from the sidebar to view issues and generate SQL.
              </p>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!snapshotId) {
    return (
      <AppLayout breadcrumbs={[{ label: 'SQL Generator' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <Card>
            <div className="p-8 text-center">
              <p className="text-body text-text-secondary mb-4">
                No schema snapshot found for this database. Please ingest a schema first.
              </p>
              <Button variant="primary" onClick={() => router.push('/databases')}>
                Go to Databases
              </Button>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: 'SQL Generator' }]}>
      <div className="flex-1 p-xl overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-xl">
          {/* Header */}
          <section>
            <div className="flex items-center gap-3 mb-md">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <FontAwesomeIcon icon={faWandMagicSparkles} className="text-primary text-2xl" />
              </div>
              <div>
                <h1 className="text-h1 text-text-primary">SQL Generator</h1>
                <p className="text-body-lg text-text-secondary mt-1">
                  Generate SQL recommendations based on detected schema issues
                </p>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
            {/* Issues List */}
            <Card>
              <CardContent>
                <h3 className="text-h3 text-text-primary mb-4">Select an Issue</h3>
                {issuesLoading ? (
                  <div className="text-center py-8">
                    <p className="text-body text-text-secondary">Loading issues...</p>
                  </div>
                ) : issues && Array.isArray(issues) && issues.length > 0 ? (
                  <div className="space-y-2 max-h-[600px] overflow-y-auto">
                    {issues.map((issue: any) => (
                      <div
                        key={issue.id}
                        className={`p-4 rounded-md border cursor-pointer transition-colors ${
                          selectedIssueId === issue.id
                            ? 'bg-primary/10 border-primary'
                            : 'bg-surface-light border-border hover:bg-border'
                        }`}
                        onClick={() => {
                          setSelectedIssueId(issue.id);
                          refetchRecommendations();
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span
                                className={`text-caption px-2 py-1 rounded-md bg-${issue.severity === 'CRITICAL' ? 'severity-critical' : issue.severity === 'HIGH' ? 'severity-high' : issue.severity === 'MEDIUM' ? 'severity-medium' : 'severity-low'}/20 text-${issue.severity === 'CRITICAL' ? 'severity-critical' : issue.severity === 'HIGH' ? 'severity-high' : issue.severity === 'MEDIUM' ? 'severity-medium' : 'severity-low'}`}
                              >
                                {issue.severity}
                              </span>
                              <span className="text-caption text-text-muted">{issue.category}</span>
                            </div>
                            <h4 className="text-body font-medium text-text-primary mb-1">{issue.title}</h4>
                            <p className="text-body-sm text-text-secondary line-clamp-2">{issue.description}</p>
                            {issue.tableName && (
                              <p className="text-body-sm text-text-muted mt-1">
                                Table: <span className="font-mono">{issue.tableName}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="primary"
                          size="sm"
                          className="mt-3 w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateForIssue(issue.id);
                          }}
                          icon={faWandMagicSparkles}
                        >
                          Generate SQL
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="text-text-muted text-3xl mb-3" />
                    <p className="text-body text-text-secondary">No issues found for this snapshot.</p>
                    <p className="text-body-sm text-text-muted mt-2">
                      Issues are automatically detected when you ingest a schema.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardContent>
                <h3 className="text-h3 text-text-primary mb-4">Generated SQL</h3>
                {selectedIssueId ? (
                  recommendationsLoading ? (
                    <div className="text-center py-8">
                      <div className="text-text-primary">Loading recommendations...</div>
                    </div>
                  ) : recommendations && recommendations.length > 0 ? (
                    <div className="space-y-4">
                      {recommendations.map((rec: any, idx: number) => (
                        <div key={rec.id || idx} className="bg-surface-light p-4 rounded-md border border-border">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h4 className="text-body font-medium text-text-primary">{rec.description}</h4>
                              {rec.explanation && (
                                <p className="text-body-sm text-text-secondary mt-1">{rec.explanation}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {rec.safeToRun ? (
                                <span className="text-caption bg-success/20 text-success px-2 py-1 rounded-md">
                                  Safe
                                </span>
                              ) : (
                                <span className="text-caption bg-warning/20 text-warning px-2 py-1 rounded-md">
                                  Review
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="bg-background p-3 rounded-md border border-border mb-3">
                            <pre className="font-mono text-code text-text-primary whitespace-pre-wrap overflow-x-auto">
                              {rec.sql}
                            </pre>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              icon={copiedId === (rec.id || idx.toString()) ? faCheck : faCopy}
                              onClick={() => handleCopy(rec.sql, rec.id || idx.toString())}
                            >
                              {copiedId === (rec.id || idx.toString()) ? 'Copied!' : 'Copy SQL'}
                            </Button>
                            <Button variant="outline" size="sm" icon={faCode}>
                              View Details
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-body text-text-secondary mb-4">
                        No SQL recommendations generated yet for this issue.
                      </p>
                      <Button
                        variant="primary"
                        onClick={() => handleGenerateForIssue(selectedIssueId)}
                        icon={faWandMagicSparkles}
                      >
                        Generate SQL Recommendations
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="text-center py-8">
                    <FontAwesomeIcon icon={faCode} className="text-text-muted text-3xl mb-3" />
                    <p className="text-body text-text-secondary">Select an issue to generate SQL recommendations</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function SQLGeneratorPage() {
  return (
    <Suspense>
      <SQLGeneratorPageInner />
    </Suspense>
  );
}
