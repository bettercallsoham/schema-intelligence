'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCodeCompare,
  faCheck,
  faTimes,
  faTrash,
  faTrashCan,
  faPenToSquare,
  faRotateLeft,
  faCopy,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/contexts/AppContext';
import { schemaApi } from '@/lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function ComparePage() {
  const { selectedDatabaseId, databases } = useApp();
  const queryClient = useQueryClient();
  const [snapshot1Id, setSnapshot1Id] = useState<string>('');
  const [snapshot2Id, setSnapshot2Id] = useState<string>('');
  const [showManageSnapshots, setShowManageSnapshots] = useState(false);
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [copiedSql, setCopiedSql] = useState<string | null>(null);

  const { data: snapshotsResponse, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots', selectedDatabaseId],
    queryFn: () => schemaApi.getAll(selectedDatabaseId || undefined, 1, 50),
    enabled: !!selectedDatabaseId,
  });

  const snapshots = Array.isArray(snapshotsResponse)
    ? snapshotsResponse
    : snapshotsResponse?.data && Array.isArray(snapshotsResponse.data)
    ? snapshotsResponse.data
    : [];

  useEffect(() => {
    if (selectedDatabaseId) {
      console.log('Compare page - snapshots:', snapshots);
    }
  }, [selectedDatabaseId, snapshotsResponse, snapshots]);

  const [shouldCompare, setShouldCompare] = useState(false);

  const { data: comparison, isLoading: comparing } = useQuery({
    queryKey: ['compare', snapshot1Id, snapshot2Id],
    queryFn: () => schemaApi.compare(snapshot1Id, snapshot2Id),
    enabled: shouldCompare && !!snapshot1Id && !!snapshot2Id,
  });

  const handleCompare = () => {
    if (snapshot1Id && snapshot2Id && snapshot1Id !== snapshot2Id) {
      setShouldCompare(true);
    } else if (snapshot1Id === snapshot2Id && snapshot1Id) {
      alert('Please select two different snapshots to compare');
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!confirm('Are you sure you want to delete this snapshot? This action cannot be undone.')) return;
    setDeletingSnapshotId(snapshotId);
    try {
      await schemaApi.deleteSnapshot(snapshotId);
      if (snapshot1Id === snapshotId) setSnapshot1Id('');
      if (snapshot2Id === snapshotId) setSnapshot2Id('');
      queryClient.invalidateQueries({ queryKey: ['snapshots', selectedDatabaseId] });
      alert('Snapshot deleted successfully');
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete snapshot');
    } finally {
      setDeletingSnapshotId(null);
    }
  };

  const handleDeleteAll = async () => {
    const confirmMessage = selectedDatabaseId
      ? `Are you sure you want to delete ALL snapshots for "${selectedDatabaseId}"? This action cannot be undone.`
      : 'Are you sure you want to delete ALL snapshots? This action cannot be undone.';
    if (!confirm(confirmMessage)) return;
    setDeletingAll(true);
    try {
      const result = await schemaApi.deleteAllSnapshots(selectedDatabaseId || undefined);
      setSnapshot1Id('');
      setSnapshot2Id('');
      queryClient.invalidateQueries({ queryKey: ['snapshots', selectedDatabaseId] });
      alert(`Successfully deleted ${result.deletedCount} snapshot(s)`);
      setShowManageSnapshots(false);
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete snapshots');
    } finally {
      setDeletingAll(false);
    }
  };

  const handleCopySql = (sql: string | string[], key: string) => {
    const text = Array.isArray(sql) ? sql.join('\n') : sql;
    navigator.clipboard.writeText(text);
    setCopiedSql(key);
    setTimeout(() => setCopiedSql(null), 2000);
  };

  return (
    <AppLayout breadcrumbs={[{ label: 'Schema Comparison' }]}>
      <div className="flex-1 p-xl overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-xl">
          {/* Header */}
          <section>
            <div className="flex items-center justify-between mb-md">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={faCodeCompare} className="text-primary text-2xl" />
                </div>
                <div>
                  <h1 className="text-h1 text-text-primary">Schema Comparison</h1>
                  <p className="text-body-lg text-text-secondary mt-1">
                    Compare schemas between snapshots and get rollback commands
                  </p>
                </div>
              </div>
              {selectedDatabaseId && snapshots.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManageSnapshots(!showManageSnapshots)}
                  icon={faTrashCan}
                >
                  {showManageSnapshots ? 'Hide' : 'Manage'} Snapshots
                </Button>
              )}
            </div>
          </section>

          {/* Manage Snapshots Panel */}
          {showManageSnapshots && selectedDatabaseId && snapshots.length > 0 && (
            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-h3 text-text-primary">Manage Snapshots</h3>
                  <Button variant="danger" size="sm" onClick={handleDeleteAll} isLoading={deletingAll} icon={faTrash}>
                    Delete All Snapshots
                  </Button>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {snapshots.map((snapshot: any) => {
                    const id = snapshot.id || snapshot.snapshotId;
                    return (
                      <div key={id} className="flex items-center justify-between p-3 bg-surface-light rounded-md border border-border">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-body font-medium text-text-primary">Version {snapshot.version}</span>
                            <span className="text-body-sm text-text-muted">{new Date(snapshot.createdAt).toLocaleString()}</span>
                            <span className="text-body-sm text-text-secondary">{snapshot.tablesCount || 0} tables</span>
                          </div>
                          <p className="text-body-sm text-text-muted mt-1 font-mono">{id}</p>
                        </div>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteSnapshot(id)}
                          isLoading={deletingSnapshotId === id}
                          icon={faTrash}
                        >
                          Delete
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Snapshot selector */}
          <Card>
            <CardContent>
              <div className="space-y-6">
                {selectedDatabaseId && snapshots.length >= 2 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-body-sm font-medium text-text-primary mb-2">Snapshot 1 (baseline)</label>
                      <select
                        value={snapshot1Id}
                        onChange={(e) => { setSnapshot1Id(e.target.value); setShouldCompare(false); }}
                        className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select snapshot...</option>
                        {snapshots.map((snapshot: any) => {
                          const id = snapshot.id || snapshot.snapshotId;
                          return (
                            <option key={id} value={id}>
                              Version {snapshot.version} — {new Date(snapshot.createdAt).toLocaleDateString()}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="block text-body-sm font-medium text-text-primary mb-2">Snapshot 2 (target)</label>
                      <select
                        value={snapshot2Id}
                        onChange={(e) => { setSnapshot2Id(e.target.value); setShouldCompare(false); }}
                        className="w-full h-10 px-3 bg-surface-light border border-border rounded-md text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Select snapshot...</option>
                        {snapshots.map((snapshot: any) => {
                          const id = snapshot.id || snapshot.snapshotId;
                          return (
                            <option key={id} value={id}>
                              Version {snapshot.version} — {new Date(snapshot.createdAt).toLocaleDateString()}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-body-sm text-text-muted">
                      {!selectedDatabaseId
                        ? 'Select a database first'
                        : snapshotsLoading
                        ? 'Loading snapshots...'
                        : snapshots.length > 0 && snapshots.length < 2
                        ? `You need at least 2 snapshots. Currently have ${snapshots.length}.`
                        : 'No snapshots found'}
                    </p>
                  </div>
                )}
                {selectedDatabaseId && snapshots.length >= 2 && (
                  <Button
                    variant="primary"
                    onClick={handleCompare}
                    isLoading={comparing}
                    disabled={!snapshot1Id || !snapshot2Id || snapshot1Id === snapshot2Id}
                    icon={faCodeCompare}
                  >
                    Compare Schemas
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {comparison && (
            <div className="space-y-4">
              {/* Added tables */}
              {comparison.addedTables && comparison.addedTables.length > 0 && (
                <Card>
                  <CardContent>
                    <h3 className="text-h3 text-text-primary mb-4 flex items-center gap-2">
                      <FontAwesomeIcon icon={faCheck} className="text-success" />
                      Added Tables ({comparison.addedTables.length})
                    </h3>
                    <div className="space-y-3">
                      {comparison.addedTables.map((table: any, idx: number) => (
                        <div key={idx} className="p-3 bg-success/10 rounded-md border border-success/20">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-body font-medium text-text-primary font-mono">
                              {table.schemaName}.{table.name}
                            </span>
                            <span className="text-caption text-text-muted">{table.columnCount} columns</span>
                          </div>
                          {table.rollbackSql && (
                            <RollbackBlock
                              label="Rollback (drop added table)"
                              sql={table.rollbackSql}
                              id={`added-${idx}`}
                              copiedId={copiedSql}
                              onCopy={handleCopySql}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Removed tables */}
              {comparison.removedTables && comparison.removedTables.length > 0 && (
                <Card>
                  <CardContent>
                    <h3 className="text-h3 text-text-primary mb-4 flex items-center gap-2">
                      <FontAwesomeIcon icon={faTimes} className="text-error" />
                      Removed Tables ({comparison.removedTables.length})
                    </h3>
                    <div className="space-y-3">
                      {comparison.removedTables.map((table: any, idx: number) => (
                        <div key={idx} className="p-3 bg-error/10 rounded-md border border-error/20">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-body font-medium text-text-primary font-mono">
                              {table.schemaName}.{table.name}
                            </span>
                            <span className="text-caption text-text-muted">{table.columnCount} columns</span>
                          </div>
                          {table.rollbackSql && (
                            <RollbackBlock
                              label="Rollback (recreate removed table)"
                              sql={table.rollbackSql}
                              id={`removed-${idx}`}
                              copiedId={copiedSql}
                              onCopy={handleCopySql}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Modified tables */}
              {comparison.modifiedTables && comparison.modifiedTables.length > 0 && (
                <Card>
                  <CardContent>
                    <h3 className="text-h3 text-text-primary mb-4 flex items-center gap-2">
                      <FontAwesomeIcon icon={faPenToSquare} className="text-warning" />
                      Modified Tables ({comparison.modifiedTables.length})
                    </h3>
                    <div className="space-y-4">
                      {comparison.modifiedTables.map((diff: any, idx: number) => (
                        <div key={idx} className="p-4 bg-surface-light rounded-md border border-border">
                          <h4 className="text-body font-medium text-text-primary mb-3 font-mono">{diff.tableName}</h4>

                          {/* Added columns */}
                          {diff.changes?.columns?.added?.length > 0 && (
                            <div className="mb-2">
                              <span className="text-body-sm font-medium text-success">+ Added columns: </span>
                              <span className="text-body-sm text-text-secondary font-mono">
                                {diff.changes.columns.added.map((c: any) => `${c.name} (${c.type})`).join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Removed columns */}
                          {diff.changes?.columns?.removed?.length > 0 && (
                            <div className="mb-2">
                              <span className="text-body-sm font-medium text-error">− Removed columns: </span>
                              <span className="text-body-sm text-text-secondary font-mono">
                                {diff.changes.columns.removed.map((c: any) => `${c.name} (${c.type})`).join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Modified columns */}
                          {diff.changes?.columns?.modified?.length > 0 && (
                            <div className="mb-2">
                              <span className="text-body-sm font-medium text-warning">~ Modified columns: </span>
                              <div className="mt-1 space-y-1">
                                {diff.changes.columns.modified.map((c: any, colIdx: number) => {
                                  // Use changeType from backend if available, otherwise detect it
                                  const isSizeChange = c.changeType === 'size' || 
                                    (c.changeType === undefined && (() => {
                                      const fromBase = c.from.type.replace(/\([^)]*\)/g, '').toLowerCase();
                                      const toBase = c.to.type.replace(/\([^)]*\)/g, '').toLowerCase();
                                      return fromBase === toBase && c.from.type !== c.to.type;
                                    })());
                                  const isNullableChange = c.changeType === 'nullable' || 
                                    (c.changeType === undefined && c.from.nullable !== c.to.nullable && !isSizeChange);
                                  const isTypeChange = c.changeType === 'type' || 
                                    (c.changeType === undefined && !isSizeChange && !isNullableChange);
                                  
                                  return (
                                    <div key={colIdx} className="text-body-sm text-text-secondary font-mono pl-4">
                                      <span className="font-medium text-text-primary">{c.name}:</span>{' '}
                                      <span className={isSizeChange ? 'text-warning' : ''}>
                                        {c.from.type}
                                        {c.from.nullable !== c.to.nullable && (
                                          <span className="text-text-muted"> ({c.from.nullable ? 'NULL' : 'NOT NULL'})</span>
                                        )}
                                      </span>
                                      {' → '}
                                      <span className={isSizeChange ? 'text-warning font-semibold' : ''}>
                                        {c.to.type}
                                        {c.from.nullable !== c.to.nullable && (
                                          <span className="text-text-muted"> ({c.to.nullable ? 'NULL' : 'NOT NULL'})</span>
                                        )}
                                      </span>
                                      {isSizeChange && (
                                        <span className="ml-2 text-caption text-warning bg-warning/10 px-1.5 py-0.5 rounded">
                                          Size change
                                        </span>
                                      )}
                                      {isNullableChange && !isSizeChange && (
                                        <span className="ml-2 text-caption text-info bg-info/10 px-1.5 py-0.5 rounded">
                                          Nullable change
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Added indexes */}
                          {diff.changes?.indexes?.added?.length > 0 && (
                            <div className="mb-2">
                              <span className="text-body-sm font-medium text-success">+ Added indexes: </span>
                              <span className="text-body-sm text-text-secondary font-mono">
                                {diff.changes.indexes.added.map((i: any) => i.name).join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Removed indexes */}
                          {diff.changes?.indexes?.removed?.length > 0 && (
                            <div className="mb-2">
                              <span className="text-body-sm font-medium text-error">− Removed indexes: </span>
                              <span className="text-body-sm text-text-secondary font-mono">
                                {diff.changes.indexes.removed.map((i: any) => i.name).join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Added FK */}
                          {diff.changes?.foreignKeys?.added?.length > 0 && (
                            <div className="mb-2">
                              <span className="text-body-sm font-medium text-success">+ Added foreign keys: </span>
                              <span className="text-body-sm text-text-secondary font-mono">
                                {diff.changes.foreignKeys.added.map((fk: any) => fk.name).join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Removed FK */}
                          {diff.changes?.foreignKeys?.removed?.length > 0 && (
                            <div className="mb-2">
                              <span className="text-body-sm font-medium text-error">− Removed foreign keys: </span>
                              <span className="text-body-sm text-text-secondary font-mono">
                                {diff.changes.foreignKeys.removed.map((fk: any) => fk.name).join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Rollback SQL */}
                          {diff.rollbackSql && diff.rollbackSql.length > 0 && (
                            <div className="mt-3">
                              <RollbackBlock
                                label="Rollback commands"
                                sql={diff.rollbackSql}
                                id={`modified-${idx}`}
                                copiedId={copiedSql}
                                onCopy={handleCopySql}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No differences */}
              {(!comparison.addedTables || comparison.addedTables.length === 0) &&
                (!comparison.removedTables || comparison.removedTables.length === 0) &&
                (!comparison.modifiedTables || comparison.modifiedTables.length === 0) && (
                  <Card>
                    <CardContent>
                      <p className="text-body text-text-secondary text-center py-8">
                        No differences found between the two snapshots.
                      </p>
                    </CardContent>
                  </Card>
                )}
            </div>
          )}

          {/* No database selected */}
          {!selectedDatabaseId && (
            <Card>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-body text-text-secondary mb-4">
                    {databases.length > 0
                      ? 'Please select a database from the sidebar to compare snapshots.'
                      : 'No databases found. Please ingest a schema first.'}
                  </p>
                  {databases.length === 0 && (
                    <Button variant="primary" onClick={() => (window.location.href = '/databases')}>
                      Go to Databases
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Not enough snapshots */}
          {selectedDatabaseId && snapshots.length < 2 && !snapshotsLoading && (
            <Card>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-body text-text-secondary mb-4">
                    You need at least 2 snapshots to compare. Currently you have {snapshots.length} snapshot(s).
                  </p>
                  <p className="text-body-sm text-text-muted mb-4">
                    Ingest the same database schema again to create version 2, then you can compare versions.
                  </p>
                  <Button variant="primary" onClick={() => (window.location.href = '/databases')}>
                    Ingest Schema Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

/* ── Rollback SQL block sub-component ────────────────────────────────────── */
interface RollbackBlockProps {
  label: string;
  sql: string | string[];
  id: string;
  copiedId: string | null;
  onCopy: (sql: string | string[], id: string) => void;
}

function RollbackBlock({ label, sql, id, copiedId, onCopy }: RollbackBlockProps) {
  const displaySql = Array.isArray(sql) ? sql.join('\n') : sql;

  return (
    <div className="mt-2 bg-background rounded-md border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-light border-b border-border/40">
        <span className="text-caption text-warning flex items-center gap-1.5">
          <FontAwesomeIcon icon={faRotateLeft} className="text-xs" />
          {label}
        </span>
        <button
          onClick={() => onCopy(sql, id)}
          className="text-caption text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
        >
          <FontAwesomeIcon icon={faCopy} className="text-xs" />
          {copiedId === id ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 font-mono text-code text-text-primary whitespace-pre-wrap overflow-x-auto text-xs">
        {displaySql}
      </pre>
    </div>
  );
}
