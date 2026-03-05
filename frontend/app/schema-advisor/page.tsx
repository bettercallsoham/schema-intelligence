'use client';

import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/Card';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faShieldHalved,
  faTriangleExclamation,
  faCheckCircle,
  faCircleXmark,
  faChevronDown,
  faChevronRight,
  faCode,
  faLightbulb,
  faStar,
  faDatabase,
  faClipboard,
  faClipboardCheck,
  faArrowTrendUp,
  faTable,
  faGraduationCap,
  faBug,
  faWrench,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/contexts/AppContext';
import { schemaApi, schemaAdvisorApi } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalFormResult {
  form: '1NF' | '2NF' | '3NF' | 'BCNF';
  compliant: boolean;
  issues: string[];
  details: string;
}

interface TableNFAnalysis {
  tableName: string;
  schemaName: string;
  normalForms: NormalFormResult[];
  overallCompliance: 'PASS' | 'WARN' | 'FAIL';
}

interface Pitfall {
  id: string;
  category: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  affectedTables: string[];
  sqlFix?: string;
}

interface BestPractice {
  id: string;
  category: string;
  title: string;
  description: string;
  why: string;
  compliant: boolean;
  violations: string[];
  recommendation?: string;
  sqlExample?: string;
}

interface TableImprovement {
  tableName: string;
  schemaName: string;
  currentIssues: string[];
  suggestedDDL: string;
  improvedColumns: string[];
  rationale: string;
}

interface SchemaAdvisorReport {
  snapshotId: string;
  databaseName: string;
  analyzedAt: string;
  overallScore: number;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: {
    totalTables: number;
    totalColumns: number;
    totalIndexes: number;
    totalForeignKeys: number;
    pitfallsFound: number;
    bestPracticesFollowed: number;
    bestPracticesTotal: number;
    normalFormViolations: number;
  };
  normalFormAnalysis: TableNFAnalysis[];
  pitfalls: Pitfall[];
  bestPractices: BestPractice[];
  tableImprovements: TableImprovement[];
  isOptimalSchema: boolean;
  optimality: {
    verdict: string;
    strengths: string[];
    weaknesses: string[];
  };
}

// ─── Helper Components ────────────────────────────────────────────────────────

const SeverityBadge = ({ severity }: { severity: string }) => {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border border-red-500/30',
    HIGH: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    MEDIUM: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    LOW: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[severity] || map.LOW}`}>
      {severity}
    </span>
  );
};

const ComplianceBadge = ({ status }: { status: 'PASS' | 'WARN' | 'FAIL' }) => {
  const map = {
    PASS: 'bg-green-500/20 text-green-400 border border-green-500/30',
    WARN: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    FAIL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status]}`}>
      {status}
    </span>
  );
};

const GradeCircle = ({ grade, score }: { grade: string; score: number }) => {
  const gradeColors: Record<string, string> = {
    A: 'text-green-400',
    B: 'text-lime-400',
    C: 'text-yellow-400',
    D: 'text-orange-400',
    F: 'text-red-400',
  };
  const strokeColors: Record<string, string> = {
    A: '#22c55e',
    B: '#a3e635',
    C: '#eab308',
    D: '#f97316',
    F: '#ef4444',
  };
  return (
    <div className="relative w-28 h-28">
      <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 36 36">
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="#334155"
          strokeWidth="2.5"
        />
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke={strokeColors[grade] || '#64748b'}
          strokeWidth="2.5"
          strokeDasharray={`${score}, 100`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-black ${gradeColors[grade] || 'text-text-primary'}`}>{grade}</span>
        <span className="text-xs text-text-muted">{score}/100</span>
      </div>
    </div>
  );
};

const CollapsibleSection = ({
  title,
  icon,
  count,
  countColor,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: any;
  count?: number;
  countColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-lg hover:bg-surface-light rounded-t-lg transition-colors"
      >
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={icon} className="text-primary-light text-lg" />
          <h2 className="text-h3 text-text-primary font-semibold">{title}</h2>
          {count !== undefined && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${countColor || 'bg-primary/20 text-primary'}`}>
              {count}
            </span>
          )}
        </div>
        <FontAwesomeIcon
          icon={open ? faChevronDown : faChevronRight}
          className="text-text-muted text-sm"
        />
      </button>
      {open && <div className="px-lg pb-lg">{children}</div>}
    </Card>
  );
};

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary"
    >
      <FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />
      {copied ? 'Copied!' : 'Copy SQL'}
    </button>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SchemaAdvisorPage() {
  const { selectedDatabaseId, databases } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'normalforms' | 'pitfalls' | 'bestpractices' | 'improvements'>('overview');

  // Get latest snapshot
  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ['snapshots', selectedDatabaseId],
    queryFn: () => schemaApi.getAll(selectedDatabaseId || undefined, 1, 1),
    enabled: !!selectedDatabaseId,
  });

  const snapshotArray = Array.isArray(snapshots)
    ? snapshots
    : snapshots?.data && Array.isArray(snapshots.data)
    ? snapshots.data
    : [];
  const latestSnapshot = snapshotArray[0];
  const snapshotId = latestSnapshot?.id || latestSnapshot?.snapshotId;

  const { data: report, isLoading: reportLoading } = useQuery<SchemaAdvisorReport>({
    queryKey: ['schema-advisor', snapshotId],
    queryFn: () => schemaAdvisorApi.getBySnapshot(snapshotId!),
    enabled: !!snapshotId,
  });

  const isLoading = snapshotsLoading || reportLoading;

  // ─── Loading / Empty States ──────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Schema Advisor' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <div className="text-center space-y-3">
            <FontAwesomeIcon icon={faShieldHalved} className="text-primary text-5xl animate-pulse" />
            <p className="text-text-secondary">Analyzing schema structure…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!selectedDatabaseId || !snapshotId) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Schema Advisor' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <FontAwesomeIcon icon={faShieldHalved} className="text-text-muted text-4xl" />
              <h2 className="text-h2 text-text-primary">No Database Selected</h2>
              <p className="text-body text-text-secondary">
                {databases.length > 0
                  ? 'Select a database from the sidebar to run the Schema Advisor.'
                  : 'Ingest a database schema first to use Schema Advisor.'}
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!report) {
    return (
      <AppLayout breadcrumbs={[{ label: 'Schema Advisor' }]}>
        <div className="flex-1 p-xl flex items-center justify-center">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-body text-text-secondary">Failed to load advisor report. Please try again.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: faShieldHalved },
    { id: 'normalforms', label: 'Normal Forms', icon: faGraduationCap },
    { id: 'pitfalls', label: `Pitfalls (${report.pitfalls.length})`, icon: faBug },
    { id: 'bestpractices', label: 'Best Practices', icon: faLightbulb },
    { id: 'improvements', label: `Improvements (${report.tableImprovements.length})`, icon: faWrench },
  ] as const;

  return (
    <AppLayout breadcrumbs={[{ label: 'Schema Advisor' }]}>
      <div className="flex-1 overflow-y-auto p-xl">
        <div className="max-w-7xl space-y-xl">

          {/* ── Page Header ──────────────────────────────────────────────── */}
          <section className="flex items-start justify-between">
            <div>
              <h1 className="text-h1 text-text-primary flex items-center gap-3">
                <FontAwesomeIcon icon={faShieldHalved} className="text-primary" />
                Schema Advisor
              </h1>
              <p className="text-body-lg text-text-secondary mt-1">
                Complete database structure analysis — normal forms, best practices &amp; PostgreSQL design recommendations
              </p>
            </div>
            <div className="text-right text-body-sm text-text-muted">
              <p><span className="font-medium text-text-secondary">{report.databaseName}</span></p>
              <p>Analyzed {new Date(report.analyzedAt).toLocaleString()}</p>
            </div>
          </section>

          {/* ── Score Hero ───────────────────────────────────────────────── */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-lg">
            {/* Grade */}
            <Card>
              <CardContent className="flex items-center gap-6">
                <GradeCircle grade={report.overallGrade} score={report.overallScore} />
                <div>
                  <p className="text-caption text-text-muted uppercase mb-1">Schema Quality</p>
                  <p className="text-h2 text-text-primary font-bold">Grade {report.overallGrade}</p>
                  <p className="text-body-sm text-text-secondary mt-1">{report.overallScore}/100 points</p>
                  {report.isOptimalSchema ? (
                    <span className="inline-flex items-center gap-1 mt-2 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                      <FontAwesomeIcon icon={faStar} className="text-xs" />
                      Optimal Schema
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 mt-2 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">
                      <FontAwesomeIcon icon={faArrowTrendUp} className="text-xs" />
                      Improvements Available
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Summary Stats */}
            <Card className="md:col-span-2">
              <CardContent>
                <p className="text-caption text-text-muted uppercase mb-3">Schema Summary</p>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Tables', value: report.summary.totalTables, icon: faTable },
                    { label: 'Columns', value: report.summary.totalColumns, icon: faDatabase },
                    { label: 'Indexes', value: report.summary.totalIndexes, icon: faCode },
                    { label: 'Foreign Keys', value: report.summary.totalForeignKeys, icon: faShieldHalved },
                  ].map((s) => (
                    <div key={s.label} className="text-center p-3 bg-surface-light rounded-lg">
                      <FontAwesomeIcon icon={s.icon} className="text-primary-light text-lg mb-1" />
                      <p className="text-h3 text-text-primary font-bold">{s.value}</p>
                      <p className="text-caption text-text-muted">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-h3 font-bold text-red-400">{report.summary.pitfallsFound}</p>
                    <p className="text-caption text-text-muted">Pitfalls Found</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-h3 font-bold text-green-400">
                      {report.summary.bestPracticesFollowed}/{report.summary.bestPracticesTotal}
                    </p>
                    <p className="text-caption text-text-muted">Best Practices</p>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                    <p className="text-h3 font-bold text-yellow-400">{report.summary.normalFormViolations}</p>
                    <p className="text-caption text-text-muted">NF Violations</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Verdict Banner ───────────────────────────────────────────── */}
          <Card className={`border ${report.isOptimalSchema ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
            <CardContent>
              <div className="flex items-start gap-4">
                <FontAwesomeIcon
                  icon={report.isOptimalSchema ? faCheckCircle : faTriangleExclamation}
                  className={`text-2xl mt-0.5 flex-shrink-0 ${report.isOptimalSchema ? 'text-green-400' : 'text-yellow-400'}`}
                />
                <div className="flex-1">
                  <h3 className="text-h4 text-text-primary font-semibold mb-1">
                    {report.isOptimalSchema ? '✅ This is near the best version of your schema' : '⚠️ This is not yet the optimal version of your schema'}
                  </h3>
                  <p className="text-body text-text-secondary">{report.optimality.verdict}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {report.optimality.strengths.length > 0 && (
                      <div>
                        <p className="text-body-sm font-semibold text-green-400 mb-2">✓ Strengths</p>
                        <ul className="space-y-1">
                          {report.optimality.strengths.map((s, i) => (
                            <li key={i} className="text-body-sm text-text-secondary flex items-start gap-2">
                              <span className="text-green-400 mt-0.5">•</span> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {report.optimality.weaknesses.length > 0 && (
                      <div>
                        <p className="text-body-sm font-semibold text-red-400 mb-2">✗ Areas to Improve</p>
                        <ul className="space-y-1">
                          {report.optimality.weaknesses.map((w, i) => (
                            <li key={i} className="text-body-sm text-text-secondary flex items-start gap-2">
                              <span className="text-red-400 mt-0.5">•</span> {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Tab Navigation ───────────────────────────────────────────── */}
          <div className="border-b border-border">
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border'
                  }`}
                >
                  <FontAwesomeIcon icon={tab.icon} className="text-xs" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── TAB: Overview ────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <section className="space-y-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                {/* Critical Pitfalls Summary */}
                <Card>
                  <CardContent>
                    <h3 className="text-h4 text-text-primary font-semibold mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faBug} className="text-red-400" />
                      Critical Issues to Fix First
                    </h3>
                    {report.pitfalls.filter((p) => p.severity === 'CRITICAL' || p.severity === 'HIGH').length === 0 ? (
                      <p className="text-body-sm text-green-400 flex items-center gap-2">
                        <FontAwesomeIcon icon={faCheckCircle} />
                        No critical or high-severity pitfalls detected
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {report.pitfalls
                          .filter((p) => p.severity === 'CRITICAL' || p.severity === 'HIGH')
                          .map((p) => (
                            <div key={p.id} className="flex items-start gap-3 p-2 bg-surface-light rounded-md">
                              <SeverityBadge severity={p.severity} />
                              <div>
                                <p className="text-body-sm font-medium text-text-primary">{p.title}</p>
                                <p className="text-caption text-text-muted">{p.affectedTables.length} table(s) affected</p>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Best Practices Compliance */}
                <Card>
                  <CardContent>
                    <h3 className="text-h4 text-text-primary font-semibold mb-3 flex items-center gap-2">
                      <FontAwesomeIcon icon={faLightbulb} className="text-yellow-400" />
                      PostgreSQL Best Practices
                    </h3>
                    <div className="space-y-2">
                      {report.bestPractices.map((bp) => (
                        <div key={bp.id} className="flex items-center justify-between">
                          <span className="text-body-sm text-text-secondary truncate pr-2 flex-1">{bp.title.split('—')[0].trim()}</span>
                          <FontAwesomeIcon
                            icon={bp.compliant ? faCheckCircle : faCircleXmark}
                            className={`flex-shrink-0 ${bp.compliant ? 'text-green-400' : 'text-red-400'}`}
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* NF Quick Summary */}
              <Card>
                <CardContent>
                  <h3 className="text-h4 text-text-primary font-semibold mb-4 flex items-center gap-2">
                    <FontAwesomeIcon icon={faGraduationCap} className="text-primary-light" />
                    Normal Form Compliance by Table
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-light">
                          <th className="text-left px-3 py-2 text-caption text-text-muted uppercase">Table</th>
                          <th className="text-center px-3 py-2 text-caption text-text-muted uppercase">1NF</th>
                          <th className="text-center px-3 py-2 text-caption text-text-muted uppercase">2NF</th>
                          <th className="text-center px-3 py-2 text-caption text-text-muted uppercase">3NF</th>
                          <th className="text-center px-3 py-2 text-caption text-text-muted uppercase">BCNF</th>
                          <th className="text-center px-3 py-2 text-caption text-text-muted uppercase">Overall</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.normalFormAnalysis.map((nf) => (
                          <tr key={`${nf.schemaName}.${nf.tableName}`} className="hover:bg-surface-light">
                            <td className="px-3 py-2 font-mono text-text-primary">
                              {nf.schemaName}.{nf.tableName}
                            </td>
                            {nf.normalForms.map((form) => (
                              <td key={form.form} className="px-3 py-2 text-center">
                                <FontAwesomeIcon
                                  icon={form.compliant ? faCheckCircle : faCircleXmark}
                                  className={form.compliant ? 'text-green-400' : 'text-red-400'}
                                />
                              </td>
                            ))}
                            <td className="px-3 py-2 text-center">
                              <ComplianceBadge status={nf.overallCompliance} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </section>
          )}

          {/* ── TAB: Normal Forms ────────────────────────────────────────── */}
          {activeTab === 'normalforms' && (
            <section className="space-y-lg">
              {/* Explainer */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent>
                  <h3 className="text-h4 text-text-primary font-semibold mb-2">What are Normal Forms?</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                    {[
                      { form: '1NF', desc: 'Each column holds a single atomic value. No repeating groups or multi-valued attributes.' },
                      { form: '2NF', desc: 'Must satisfy 1NF. All non-key attributes must fully depend on the entire primary key (eliminates partial dependencies).' },
                      { form: '3NF', desc: 'Must satisfy 2NF. No transitive dependencies — non-key columns should depend only on the primary key, not on other non-key columns.' },
                      { form: 'BCNF', desc: 'Stricter than 3NF. Every functional determinant must be a candidate key.' },
                    ].map((nf) => (
                      <div key={nf.form} className="p-3 bg-surface-light rounded-lg">
                        <p className="text-primary font-bold text-lg mb-1">{nf.form}</p>
                        <p className="text-body-sm text-text-secondary">{nf.desc}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Per-table analysis */}
              {report.normalFormAnalysis.map((nf) => (
                <Card key={`${nf.schemaName}.${nf.tableName}`}>
                  <CardContent>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-h4 font-mono text-text-primary">
                        {nf.schemaName}.{nf.tableName}
                      </h3>
                      <ComplianceBadge status={nf.overallCompliance} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {nf.normalForms.map((form) => (
                        <div
                          key={form.form}
                          className={`p-4 rounded-lg border ${
                            form.compliant
                              ? 'border-green-500/20 bg-green-500/5'
                              : 'border-red-500/20 bg-red-500/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <FontAwesomeIcon
                              icon={form.compliant ? faCheckCircle : faCircleXmark}
                              className={form.compliant ? 'text-green-400' : 'text-red-400'}
                            />
                            <span className="font-bold text-text-primary">{form.form}</span>
                            <span className={`text-xs font-semibold ${form.compliant ? 'text-green-400' : 'text-red-400'}`}>
                              {form.compliant ? 'Compliant' : 'Violation'}
                            </span>
                          </div>
                          <p className="text-body-sm text-text-secondary mb-2">{form.details}</p>
                          {form.issues.length > 0 && (
                            <ul className="space-y-1">
                              {form.issues.map((issue, i) => (
                                <li key={i} className="text-body-sm text-red-300 flex items-start gap-2">
                                  <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}

          {/* ── TAB: Pitfalls ────────────────────────────────────────────── */}
          {activeTab === 'pitfalls' && (
            <section className="space-y-lg">
              {report.pitfalls.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-green-400 text-4xl mb-3" />
                    <p className="text-h3 text-text-primary font-semibold">No pitfalls detected!</p>
                    <p className="text-body text-text-secondary mt-1">Your schema is clean. Well done.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <p className="text-body text-text-secondary">
                    These are design pitfalls found in your schema that will cause <strong className="text-text-primary">performance degradation, data integrity issues, or maintenance nightmares</strong> as your application scales.
                  </p>
                  {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
                    const items = report.pitfalls.filter((p) => p.severity === sev);
                    if (items.length === 0) return null;
                    return (
                      <div key={sev} className="space-y-md">
                        <h3 className="text-body font-semibold text-text-muted uppercase tracking-wide">
                          {sev} ({items.length})
                        </h3>
                        {items.map((pitfall) => (
                          <Card key={pitfall.id}>
                            <CardContent>
                              <div className="flex items-start gap-4">
                                <FontAwesomeIcon
                                  icon={faTriangleExclamation}
                                  className={`text-xl mt-0.5 flex-shrink-0 ${
                                    sev === 'CRITICAL' ? 'text-red-400' :
                                    sev === 'HIGH' ? 'text-orange-400' :
                                    sev === 'MEDIUM' ? 'text-yellow-400' : 'text-blue-400'
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <h4 className="text-h4 text-text-primary font-semibold">{pitfall.title}</h4>
                                    <SeverityBadge severity={pitfall.severity} />
                                    <span className="text-xs text-text-muted bg-surface-light px-2 py-0.5 rounded">
                                      {pitfall.category}
                                    </span>
                                  </div>
                                  <p className="text-body text-text-secondary mb-3">{pitfall.description}</p>

                                  {pitfall.affectedTables.length > 0 && (
                                    <div className="mb-3">
                                      <p className="text-body-sm font-medium text-text-primary mb-1">Affected Tables:</p>
                                      <div className="flex flex-wrap gap-2">
                                        {pitfall.affectedTables.map((t, i) => (
                                          <span key={i} className="font-mono text-xs bg-surface-light px-2 py-1 rounded border border-border text-text-secondary">
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {pitfall.sqlFix && (
                                    <div className="mt-3">
                                      <div className="flex items-center justify-between mb-1">
                                        <p className="text-body-sm font-medium text-text-primary">Suggested Fix:</p>
                                        <CopyButton text={pitfall.sqlFix} />
                                      </div>
                                      <pre className="bg-surface-light p-3 rounded-md text-xs font-mono text-green-300 overflow-x-auto border border-border">
                                        {pitfall.sqlFix}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
            </section>
          )}

          {/* ── TAB: Best Practices ──────────────────────────────────────── */}
          {activeTab === 'bestpractices' && (
            <section className="space-y-lg">
              <p className="text-body text-text-secondary">
                These are <strong className="text-text-primary">PostgreSQL-specific best practices</strong> for schema design. Each one includes a description of why it matters and how to implement it.
              </p>

              {/* Compliance overview bar */}
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-body-sm text-text-secondary font-medium">Overall Compliance</span>
                    <span className="text-body-sm font-bold text-text-primary">
                      {report.summary.bestPracticesFollowed} / {report.summary.bestPracticesTotal} practices followed
                    </span>
                  </div>
                  <div className="w-full bg-surface-light rounded-full h-3 overflow-hidden">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-primary to-primary-light transition-all"
                      style={{
                        width: `${(report.summary.bestPracticesFollowed / report.summary.bestPracticesTotal) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-caption text-text-muted mt-1">
                    {Math.round((report.summary.bestPracticesFollowed / report.summary.bestPracticesTotal) * 100)}% compliance
                  </p>
                </CardContent>
              </Card>

              {/* Group by category */}
              {Array.from(new Set(report.bestPractices.map((bp) => bp.category))).map((category) => (
                <div key={category}>
                  <h3 className="text-body font-semibold text-text-muted uppercase tracking-wide mb-md">{category}</h3>
                  <div className="space-y-md">
                    {report.bestPractices
                      .filter((bp) => bp.category === category)
                      .map((bp) => (
                        <Card
                          key={bp.id}
                          className={`border ${bp.compliant ? 'border-green-500/20' : 'border-red-500/20'}`}
                        >
                          <CardContent>
                            <div className="flex items-start gap-4">
                              <FontAwesomeIcon
                                icon={bp.compliant ? faCheckCircle : faCircleXmark}
                                className={`text-2xl mt-0.5 flex-shrink-0 ${bp.compliant ? 'text-green-400' : 'text-red-400'}`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-1 flex-wrap">
                                  <h4 className="text-h4 text-text-primary font-semibold">{bp.title}</h4>
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bp.compliant ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {bp.compliant ? 'FOLLOWED' : 'NOT FOLLOWED'}
                                  </span>
                                </div>
                                <p className="text-body text-text-secondary mb-2">{bp.description}</p>

                                {/* Why it matters */}
                                <div className="bg-primary/5 border border-primary/20 p-3 rounded-md mb-3">
                                  <p className="text-body-sm font-semibold text-primary mb-1">
                                    <FontAwesomeIcon icon={faLightbulb} className="mr-1.5" />
                                    Why this matters:
                                  </p>
                                  <p className="text-body-sm text-text-secondary">{bp.why}</p>
                                </div>

                                {/* Violations */}
                                {!bp.compliant && bp.violations.length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-body-sm font-medium text-red-400 mb-1">Violations in your schema:</p>
                                    <div className="flex flex-wrap gap-2">
                                      {bp.violations.map((v, i) => (
                                        <span key={i} className="font-mono text-xs bg-red-500/10 border border-red-500/20 px-2 py-1 rounded text-red-300">
                                          {v}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Recommendation */}
                                {!bp.compliant && bp.recommendation && (
                                  <div className="mb-3">
                                    <p className="text-body-sm font-medium text-text-primary mb-1">Recommendation:</p>
                                    <p className="text-body-sm text-text-secondary">{bp.recommendation}</p>
                                  </div>
                                )}

                                {/* SQL Example */}
                                {bp.sqlExample && (
                                  <div>
                                    <div className="flex items-center justify-between mb-1">
                                      <p className="text-body-sm font-medium text-text-primary">
                                        <FontAwesomeIcon icon={faCode} className="mr-1.5 text-primary-light" />
                                        Example SQL:
                                      </p>
                                      <CopyButton text={bp.sqlExample} />
                                    </div>
                                    <pre className="bg-surface-light p-3 rounded-md text-xs font-mono text-green-300 overflow-x-auto border border-border">
                                      {bp.sqlExample}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* ── TAB: Improvements (Best Version DDL) ─────────────────────── */}
          {activeTab === 'improvements' && (
            <section className="space-y-lg">
              {report.tableImprovements.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-12">
                    <FontAwesomeIcon icon={faStar} className="text-yellow-400 text-4xl mb-3" />
                    <p className="text-h3 text-text-primary font-semibold">Your schema is already optimal!</p>
                    <p className="text-body text-text-secondary mt-1">
                      No DDL improvements needed. This is the best version of your schema.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                    <p className="text-body text-text-secondary">
                      <FontAwesomeIcon icon={faWrench} className="text-primary mr-2" />
                      Below is the <strong className="text-text-primary">recommended "best version"</strong> of your schema — the changes you need to make to follow PostgreSQL best practices. Apply these ALTER statements to get to an optimal design. Always test on a staging environment first.
                    </p>
                  </div>

                  {report.tableImprovements.map((improvement) => (
                    <Card key={`${improvement.schemaName}.${improvement.tableName}`}>
                      <CardContent>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-h4 font-mono text-text-primary">
                            {improvement.schemaName}.{improvement.tableName}
                          </h3>
                          <span className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                            {improvement.currentIssues.length} improvement{improvement.currentIssues.length > 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Issues in current schema */}
                        <div className="mb-4">
                          <p className="text-body-sm font-semibold text-text-primary mb-2">Issues in current schema:</p>
                          <ul className="space-y-1">
                            {improvement.currentIssues.map((issue, i) => (
                              <li key={i} className="text-body-sm text-text-secondary flex items-start gap-2">
                                <span className="text-red-400 mt-0.5 flex-shrink-0">✗</span>
                                {issue}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Rationale */}
                        <div className="bg-primary/5 border border-primary/20 p-3 rounded-md mb-4">
                          <p className="text-body-sm font-semibold text-primary mb-1">
                            <FontAwesomeIcon icon={faLightbulb} className="mr-1.5" />
                            Why we recommend these changes:
                          </p>
                          <p className="text-body-sm text-text-secondary">{improvement.rationale}</p>
                        </div>

                        {/* DDL */}
                        {improvement.suggestedDDL && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-body-sm font-semibold text-text-primary">
                                <FontAwesomeIcon icon={faCode} className="mr-1.5 text-green-400" />
                                Apply these changes:
                              </p>
                              <CopyButton text={improvement.suggestedDDL} />
                            </div>
                            <pre className="bg-surface-light p-4 rounded-md text-xs font-mono text-green-300 overflow-x-auto border border-border leading-relaxed">
                              {improvement.suggestedDDL}
                            </pre>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {/* Master DDL Export */}
                  <Card className="border-primary/30">
                    <CardContent>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-h4 text-text-primary font-semibold flex items-center gap-2">
                          <FontAwesomeIcon icon={faCode} className="text-primary" />
                          Full Migration Script (All Tables)
                        </h3>
                        <CopyButton
                          text={
                            `-- Schema Advisor Migration Script\n-- Database: ${report.databaseName}\n-- Generated: ${new Date(report.analyzedAt).toLocaleString()}\n-- Apply these changes to reach the recommended best-practice schema design\n\n` +
                            report.tableImprovements.map((t) => t.suggestedDDL).join('\n\n')
                          }
                        />
                      </div>
                      <pre className="bg-surface-light p-4 rounded-md text-xs font-mono text-green-300 overflow-x-auto border border-border leading-relaxed max-h-96">
                        {`-- Schema Advisor Migration Script\n-- Database: ${report.databaseName}\n-- Generated: ${new Date(report.analyzedAt).toLocaleString()}\n-- Apply these changes to reach the recommended best-practice schema design\n\n` +
                          report.tableImprovements.map((t) => t.suggestedDDL).join('\n\n')}
                      </pre>
                    </CardContent>
                  </Card>
                </>
              )}
            </section>
          )}

        </div>
      </div>
    </AppLayout>
  );
}

