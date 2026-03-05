'use client';

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faDatabase,
  faTable,
  faCalendarAlt,
  faFilter,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';
import { analyticsApi, type DatabaseConnection } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

export default function AnalyticsPage() {
  const [connectionConfig, setConnectionConfig] = useState<DatabaseConnection>({
    host: '',
    port: 5432,
    database: '',
    user: '',
    password: '',
  });
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [isConnected, setIsConnected] = useState(false);

  // Fetch schema
  const { data: schema, isLoading: schemaLoading, refetch: refetchSchema } = useQuery({
    queryKey: ['analytics-schema', connectionConfig],
    queryFn: () => analyticsApi.getSchema(connectionConfig),
    enabled: isConnected,
    retry: false,
  });

  // Get selected table info
  const selectedTableInfo = schema?.tables.find((t) => t.name === selectedTable);

  // Auto-select first table when schema loads
  useEffect(() => {
    if (schema?.tables && schema.tables.length > 0 && !selectedTable) {
      setSelectedTable(schema.tables[0].name);
    }
  }, [schema, selectedTable]);

  // Find date columns
  const dateColumns = selectedTableInfo?.columns.filter((c) => c.isDate) || [];
  const numericColumns = selectedTableInfo?.columns.filter((c) => c.isNumeric) || [];
  const textColumns = selectedTableInfo?.columns.filter((c) => c.isText) || [];

  // Default selections
  const defaultDateColumn = dateColumns[0]?.name || '';
  const defaultNumericColumn = numericColumns[0]?.name || '';
  const defaultTextColumn = textColumns[0]?.name || '';

  // Fetch metrics
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['analytics-metrics', connectionConfig, selectedTable, defaultNumericColumn],
    queryFn: () =>
      analyticsApi.getMetrics({
        ...connectionConfig,
        table: selectedTable,
        metricColumn: defaultNumericColumn || undefined,
      }),
    enabled: isConnected && !!selectedTable,
  });

  // Fetch time series
  const { data: timeSeries, isLoading: timeSeriesLoading } = useQuery({
    queryKey: ['analytics-time-series', connectionConfig, selectedTable, defaultDateColumn, dateRange],
    queryFn: () =>
      analyticsApi.getTimeSeries({
        ...connectionConfig,
        table: selectedTable,
        dateColumn: defaultDateColumn,
        metricColumn: defaultNumericColumn || undefined,
        startDate: dateRange.startDate || undefined,
        endDate: dateRange.endDate || undefined,
      }),
    enabled: isConnected && !!selectedTable && !!defaultDateColumn,
  });

  // Fetch distribution (for pie chart)
  const { data: distribution, isLoading: distributionLoading } = useQuery({
    queryKey: ['analytics-distribution', connectionConfig, selectedTable, defaultTextColumn],
    queryFn: () =>
      analyticsApi.getDistribution({
        ...connectionConfig,
        table: selectedTable,
        categoryColumn: defaultTextColumn,
        limit: 10,
      }),
    enabled: isConnected && !!selectedTable && !!defaultTextColumn,
  });

  // Fetch top N (for bar chart)
  const { data: topN, isLoading: topNLoading } = useQuery({
    queryKey: ['analytics-top-n', connectionConfig, selectedTable, defaultTextColumn, defaultNumericColumn],
    queryFn: () =>
      analyticsApi.getTopN({
        ...connectionConfig,
        table: selectedTable,
        column: defaultTextColumn,
        metricColumn: defaultNumericColumn || undefined,
        limit: 10,
      }),
    enabled: isConnected && !!selectedTable && !!defaultTextColumn,
  });

  const handleConnect = async () => {
    setIsConnected(true);
    await refetchSchema();
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setSelectedTable('');
  };

  return (
    <AppLayout breadcrumbs={[{ label: 'Analytics Dashboard' }]}>
      <div className="flex-1 p-xl overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-xl">
          {/* Header */}
          <section>
            <div className="flex items-center gap-3 mb-md">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <FontAwesomeIcon icon={faChartLine} className="text-primary text-2xl" />
              </div>
              <div>
                <h1 className="text-h1 text-text-primary">Analytics Dashboard</h1>
                <p className="text-body-lg text-text-secondary mt-1">
                  Connect to PostgreSQL databases and visualize data dynamically
                </p>
              </div>
            </div>
          </section>

          {/* Connection Form */}
          <Card>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <FontAwesomeIcon icon={faDatabase} className="text-primary" />
                <h2 className="text-h2 text-text-primary">Database Connection</h2>
              </div>
              {!isConnected ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-body-sm text-text-secondary mb-2">Host</label>
                    <input
                      type="text"
                      value={connectionConfig.host}
                      onChange={(e) => setConnectionConfig({ ...connectionConfig, host: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-md bg-surface text-text-primary"
                      placeholder="localhost"
                    />
                  </div>
                  <div>
                    <label className="block text-body-sm text-text-secondary mb-2">Port</label>
                    <input
                      type="number"
                      value={connectionConfig.port}
                      onChange={(e) => setConnectionConfig({ ...connectionConfig, port: parseInt(e.target.value) || 5432 })}
                      className="w-full px-3 py-2 border border-border rounded-md bg-surface text-text-primary"
                      placeholder="5432"
                    />
                  </div>
                  <div>
                    <label className="block text-body-sm text-text-secondary mb-2">Database</label>
                    <input
                      type="text"
                      value={connectionConfig.database}
                      onChange={(e) => setConnectionConfig({ ...connectionConfig, database: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-md bg-surface text-text-primary"
                      placeholder="analytics_demo"
                    />
                  </div>
                  <div>
                    <label className="block text-body-sm text-text-secondary mb-2">User</label>
                    <input
                      type="text"
                      value={connectionConfig.user}
                      onChange={(e) => setConnectionConfig({ ...connectionConfig, user: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-md bg-surface text-text-primary"
                      placeholder="postgres"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-body-sm text-text-secondary mb-2">Password</label>
                    <input
                      type="password"
                      value={connectionConfig.password}
                      onChange={(e) => setConnectionConfig({ ...connectionConfig, password: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-md bg-surface text-text-primary"
                      placeholder="postgres"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      onClick={handleConnect}
                      className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
                    >
                      Connect to Database
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-body font-medium text-text-primary">
                        Connected to: <span className="text-primary">{connectionConfig.database}</span>
                      </p>
                      <p className="text-body-sm text-text-secondary">
                        {connectionConfig.host}:{connectionConfig.port}
                      </p>
                    </div>
                    <button
                      onClick={handleDisconnect}
                      className="px-4 py-2 bg-danger text-white rounded-md hover:bg-danger/90 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>

                  {/* Table Selection */}
                  {schemaLoading ? (
                    <div className="flex items-center gap-2 text-text-secondary">
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                      <span>Loading schema...</span>
                    </div>
                  ) : schema?.tables && schema.tables.length > 0 ? (
                    <div>
                      <label className="block text-body-sm text-text-secondary mb-2">
                        <FontAwesomeIcon icon={faTable} className="mr-2" />
                        Select Table
                      </label>
                      <select
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-md bg-surface text-text-primary"
                      >
                        {schema.tables.map((table) => (
                          <option key={table.name} value={table.name}>
                            {table.name} ({table.columnCount} columns)
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-body text-text-secondary">No tables found in database</p>
                  )}

                  {/* Date Range Filter */}
                  {defaultDateColumn && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-body-sm text-text-secondary mb-2">
                          <FontAwesomeIcon icon={faCalendarAlt} className="mr-2" />
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={dateRange.startDate}
                          onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-md bg-surface text-text-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-body-sm text-text-secondary mb-2">
                          <FontAwesomeIcon icon={faCalendarAlt} className="mr-2" />
                          End Date
                        </label>
                        <input
                          type="date"
                          value={dateRange.endDate}
                          onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-md bg-surface text-text-primary"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* KPI Cards */}
          {isConnected && selectedTable && metrics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-xl">
              <Card>
                <CardContent>
                  <p className="text-caption text-text-muted uppercase mb-2">Total Rows</p>
                  <p className="text-h2 text-text-primary">{metrics.rowCount?.toLocaleString() || 0}</p>
                </CardContent>
              </Card>
              {metrics.metric && (
                <>
                  <Card>
                    <CardContent>
                      <p className="text-caption text-text-muted uppercase mb-2">Total</p>
                      <p className="text-h2 text-text-primary">
                        {metrics.metric.total?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <p className="text-caption text-text-muted uppercase mb-2">Average</p>
                      <p className="text-h2 text-text-primary">
                        {metrics.metric.average?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <p className="text-caption text-text-muted uppercase mb-2">Max</p>
                      <p className="text-h2 text-text-primary">
                        {metrics.metric.max?.toLocaleString(undefined, { maximumFractionDigits: 2 }) || 0}
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* Charts Grid */}
          {isConnected && selectedTable && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-xl">
              {/* Time Series Chart */}
              {defaultDateColumn && (
                <Card>
                  <CardContent>
                    <h3 className="text-h3 text-text-primary mb-4">Time Series Trend</h3>
                    {timeSeriesLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl text-text-secondary" />
                      </div>
                    ) : timeSeries && timeSeries.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={timeSeries}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="count" stroke="#0088FE" name="Count" />
                          {timeSeries[0]?.total !== undefined && (
                            <Line type="monotone" dataKey="total" stroke="#00C49F" name="Total" />
                          )}
                          {timeSeries[0]?.average !== undefined && (
                            <Line type="monotone" dataKey="average" stroke="#FFBB28" name="Average" />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-body text-text-secondary text-center py-8">No time series data available</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Distribution Pie Chart */}
              {defaultTextColumn && (
                <Card>
                  <CardContent>
                    <h3 className="text-h3 text-text-primary mb-4">Category Distribution</h3>
                    {distributionLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl text-text-secondary" />
                      </div>
                    ) : distribution && distribution.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={distribution as any}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry: any) => {
                              const percent = entry.percent;
                              return `${entry.category || entry.name}: ${percent ? (percent * 100).toFixed(0) : 0}%`;
                            }}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="count"
                            nameKey="category"
                          >
                            {distribution.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-body text-text-secondary text-center py-8">No distribution data available</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Top N Bar Chart */}
              {defaultTextColumn && (
                <Card>
                  <CardContent>
                    <h3 className="text-h3 text-text-primary mb-4">Top Entities</h3>
                    {topNLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl text-text-secondary" />
                      </div>
                    ) : topN && topN.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={topN}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="entity" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="count" fill="#0088FE" name="Count" />
                          {topN[0]?.total !== undefined && <Bar dataKey="total" fill="#00C49F" name="Total" />}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-body text-text-secondary text-center py-8">No top N data available</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Table Info */}
              <Card>
                <CardContent>
                  <h3 className="text-h3 text-text-primary mb-4">Table Information</h3>
                  {selectedTableInfo ? (
                    <div className="space-y-2">
                      <div>
                        <p className="text-body-sm text-text-muted">Table Name</p>
                        <p className="text-body font-medium text-text-primary">{selectedTableInfo.name}</p>
                      </div>
                      <div>
                        <p className="text-body-sm text-text-muted">Schema</p>
                        <p className="text-body font-medium text-text-primary">{selectedTableInfo.schema}</p>
                      </div>
                      <div>
                        <p className="text-body-sm text-text-muted">Columns</p>
                        <p className="text-body font-medium text-text-primary">{selectedTableInfo.columnCount}</p>
                      </div>
                      <div className="mt-4">
                        <p className="text-body-sm text-text-muted mb-2">Column Types Detected:</p>
                        <div className="flex flex-wrap gap-2">
                          {dateColumns.length > 0 && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-body-sm">
                              {dateColumns.length} Date
                            </span>
                          )}
                          {numericColumns.length > 0 && (
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-body-sm">
                              {numericColumns.length} Numeric
                            </span>
                          )}
                          {textColumns.length > 0 && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-body-sm">
                              {textColumns.length} Text
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-body text-text-secondary">Select a table to view information</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty State */}
          {!isConnected && (
            <Card>
              <CardContent>
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faDatabase} className="text-6xl text-text-muted mb-4" />
                  <h3 className="text-h3 text-text-primary mb-2">Connect to a Database</h3>
                  <p className="text-body text-text-secondary">
                    Enter your PostgreSQL connection details above to start analyzing data
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
