'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDatabase,
  faTable,
  faKey,
  faFont,
  faCalendar,
  faChevronDown,
  faChevronRight,
  faSearch,
  faCode,
  faEllipsis,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/contexts/AppContext';
import { schemaApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

function SchemasPageInner() {
  const searchParams = useSearchParams();
  const snapshotIdParam = searchParams.get('snapshot');
  const { databases, selectedDatabaseId, setSelectedDatabaseId } = useApp();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const { data: snapshot, isLoading, error } = useQuery({
    queryKey: ['snapshot', snapshotIdParam || selectedDatabaseId],
    queryFn: () => {
      if (snapshotIdParam) {
        return schemaApi.getSnapshot(snapshotIdParam);
      }
      if (selectedDatabaseId) {
        return schemaApi.getLatest(selectedDatabaseId);
      }
      return null;
    },
    enabled: !!(snapshotIdParam || selectedDatabaseId),
  });

  useEffect(() => {
    // Auto-select first database if none selected but databases exist
    if (databases.length > 0 && !selectedDatabaseId) {
      setSelectedDatabaseId(databases[0].id);
    }
  }, [databases, selectedDatabaseId, setSelectedDatabaseId]);

  useEffect(() => {
    if (snapshot?.tables && snapshot.tables.length > 0 && !selectedTableId) {
      setSelectedTableId(snapshot.tables[0].id);
      setExpandedTables(new Set([snapshot.tables[0].id]));
    }
  }, [snapshot, selectedTableId]);

  const toggleTable = (tableId: string) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableId)) {
      newExpanded.delete(tableId);
    } else {
      newExpanded.add(tableId);
    }
    setExpandedTables(newExpanded);
  };

  const tables = snapshot?.tables || [];
  const filteredTables = tables.filter((table: any) =>
    table.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedTable = tables.find((t: any) => t.id === selectedTableId);

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Schemas' }]}>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-text-primary">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Schemas' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <Card>
            <div className="p-8 text-center">
              <p className="text-body text-text-secondary mb-4">
                Error loading schema: {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!snapshot || tables.length === 0) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Schemas' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <Card>
            <div className="p-8 text-center">
              <p className="text-body text-text-secondary mb-4">
                {selectedDatabaseId 
                  ? `No schema data found for database "${selectedDatabaseId}". Make sure you've ingested a schema.` 
                  : databases.length > 0
                  ? 'Please select a database from the sidebar to view schemas.'
                  : 'No databases found. Please ingest a schema first from the Databases page.'}
              </p>
              {databases.length === 0 && (
                <a href="/databases" className="text-primary hover:text-primary-light">
                  Go to Databases page
                </a>
              )}
            </div>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumbs={[{ label: 'Schemas' }]}>
      <div className="flex flex-1 overflow-hidden">
        {/* Schema Tree Panel */}
        <div className="w-[300px] bg-surface border-r border-border flex flex-col">
          <div className="p-md border-b border-border">
            <div className="relative">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm"
              />
              <input
                type="text"
                placeholder="Filter tables or columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-3 bg-surface-light border border-border rounded-md text-body text-text-primary placeholder-text-muted focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-md">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-body text-text-secondary cursor-pointer hover:text-text-primary">
                <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                <FontAwesomeIcon icon={faDatabase} className="text-primary-light" />
                <span className="font-medium">{selectedDatabaseId || 'Select Database'}</span>
              </div>
              <div className="ml-4 space-y-2">
                <div className="flex items-center gap-2 text-body text-text-secondary cursor-pointer hover:text-text-primary">
                  <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
                  <span className="font-medium">public</span>
                </div>
                <div className="ml-4 space-y-1">
                  {filteredTables.map((table: any) => (
                    <div key={table.id}>
                      <div
                        onClick={() => {
                          toggleTable(table.id);
                          setSelectedTableId(table.id);
                        }}
                        className={`flex items-center justify-between p-2 rounded-md cursor-pointer ${
                          selectedTableId === table.id
                            ? 'bg-primary/10 border-l-2 border-primary'
                            : 'hover:bg-surface-light'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon
                            icon={expandedTables.has(table.id) ? faChevronDown : faChevronRight}
                            className="text-xs text-text-muted"
                          />
                          <FontAwesomeIcon icon={faTable} className="text-primary-light text-sm" />
                          <span className="text-body text-text-primary">{table.name}</span>
                        </div>
                        {table.rowCount && (
                          <span className="text-caption text-text-muted bg-surface-light px-2 py-0.5 rounded">
                            {table.rowCount.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {expandedTables.has(table.id) && table.columns && table.columns.length > 0 && (
                        <div className="ml-6 space-y-1 mt-1">
                          {table.columns.map((column: any) => (
                            <div
                              key={column.id}
                              className="flex items-center gap-2 text-body-sm text-text-secondary py-1"
                            >
                              <FontAwesomeIcon
                                icon={column.isPrimaryKey ? faKey : column.type.includes('varchar') ? faFont : faCalendar}
                                className={`text-xs ${
                                  column.isPrimaryKey ? 'text-warning' : column.type.includes('varchar') ? 'text-info' : 'text-success'
                                }`}
                              />
                              <span>{column.name}</span>
                              <span className="text-caption text-text-muted">{column.type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table Detail Panel */}
        {selectedTable && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-surface border-b border-border p-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon icon={faTable} className="text-primary-light text-2xl" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-h2 text-text-primary">{selectedTable.name}</h2>
                    <span className="text-caption bg-success/20 text-success px-2 py-1 rounded-md">
                      0 issues
                    </span>
                  </div>
                  <p className="text-body-sm text-text-muted">{selectedTable.schemaName}.{selectedTable.name}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const sql = `-- Table: ${selectedTable.schemaName}.${selectedTable.name}\n\n` +
                      `CREATE TABLE ${selectedTable.schemaName}.${selectedTable.name} (\n` +
                      selectedTable.columns?.map((col: any) => 
                        `  ${col.name} ${col.type}${col.nullable ? '' : ' NOT NULL'}${col.defaultValue ? ` DEFAULT ${col.defaultValue}` : ''}`
                      ).join(',\n') +
                      '\n);\n\n' +
                      (selectedTable.indexes?.length > 0 ? 
                        selectedTable.indexes.map((idx: any) => 
                          `CREATE INDEX ${idx.name} ON ${selectedTable.schemaName}.${selectedTable.name}(${idx.columns.join(', ')});`
                        ).join('\n') + '\n\n' : '') +
                      (selectedTable.foreignKeys?.length > 0 ?
                        selectedTable.foreignKeys.map((fk: any) =>
                          `ALTER TABLE ${selectedTable.schemaName}.${selectedTable.name} ADD CONSTRAINT ${fk.name} FOREIGN KEY (${fk.columnName}) REFERENCES ${fk.referencedTable}(${fk.referencedColumn});`
                        ).join('\n') : '');
                    navigator.clipboard.writeText(sql);
                    alert('SQL copied to clipboard!');
                  }}
                  className="h-9 px-4 border border-border rounded-md text-sm text-text-secondary hover:bg-surface-light"
                >
                  <FontAwesomeIcon icon={faCode} className="mr-2" />
                  View SQL
                </button>
              </div>
            </div>
            <div className="bg-surface border-b border-border px-lg py-md grid grid-cols-5 gap-lg">
              <div>
                <p className="text-caption text-text-muted uppercase">Rows</p>
                <p className="text-h4 text-text-primary mt-1">{selectedTable.rowCount?.toLocaleString() || '0'}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted uppercase">Columns</p>
                <p className="text-h4 text-text-primary mt-1">{selectedTable.columns?.length || 0}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted uppercase">Indexes</p>
                <p className="text-h4 text-text-primary mt-1">{selectedTable.indexes?.length || 0}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted uppercase">Foreign Keys</p>
                <p className="text-h4 text-text-primary mt-1">{selectedTable.foreignKeys?.length || 0}</p>
              </div>
              <div>
                <p className="text-caption text-text-muted uppercase">Size</p>
                <p className="text-h4 text-text-primary mt-1">{selectedTable.sizeFormatted || 'N/A'}</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-lg">
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface-light">
                      <tr>
                        <th className="text-left text-caption text-text-muted uppercase px-4 py-3">Name</th>
                        <th className="text-left text-caption text-text-muted uppercase px-4 py-3">Type</th>
                        <th className="text-left text-caption text-text-muted uppercase px-4 py-3">Nullable</th>
                        <th className="text-left text-caption text-text-muted uppercase px-4 py-3">Default</th>
                        <th className="text-left text-caption text-text-muted uppercase px-4 py-3">Indexed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedTable.columns?.map((column: any) => (
                        <tr key={column.id} className="hover:bg-surface-light">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <FontAwesomeIcon
                                icon={column.isPrimaryKey ? faKey : faFont}
                                className={`text-sm ${column.isPrimaryKey ? 'text-warning' : 'text-info'}`}
                              />
                              <span className="text-body font-mono text-text-primary">{column.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-body text-text-secondary">{column.type}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-caption px-2 py-1 rounded-md ${
                                column.nullable
                                  ? 'bg-success/20 text-success'
                                  : 'bg-error/20 text-error'
                              }`}
                            >
                              {column.nullable ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-body text-text-muted font-mono">
                            {column.defaultValue || '—'}
                          </td>
                          <td className="px-4 py-3">
                            {column.isPrimaryKey || selectedTable.indexes?.some((idx: any) =>
                              idx.columns.includes(column.name)
                            ) ? (
                              <FontAwesomeIcon icon={faKey} className="text-success" />
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default function SchemasPage() {
  return (
    <Suspense>
      <SchemasPageInner />
    </Suspense>
  );
}
