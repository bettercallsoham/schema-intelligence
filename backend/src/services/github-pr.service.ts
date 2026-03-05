import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { logger } from '../utils/logger';

export interface PRSchemaChange {
  file: string;
  additions: string[];
  deletions: string[];
  changeType: 'create' | 'alter' | 'drop' | 'modify';
}

export interface PRAnalysisResult {
  prNumber: number;
  repository: string;
  schemaChanges: PRSchemaChange[];
  issues: PRSchemaIssue[];
  recommendations: string[];
  score: number;
  summary: string;
}

export interface PRSchemaIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  issue: string;
  suggestion: string;
  line?: number;
  file?: string;
}

/**
 * Analyze schema changes in a GitHub Pull Request
 */
export const analyzePRSchemaChanges = async (
  githubToken: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRAnalysisResult> => {
  const octokit = new Octokit({ auth: githubToken });

  logger.info('Analyzing PR schema changes', { owner, repo, prNumber });

  // Get PR files
  const { data: files } = await octokit.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Filter for SQL/migration files
  const migrationFiles = files.filter(file =>
    file.filename.includes('migration') ||
    file.filename.endsWith('.sql') ||
    file.filename.includes('flyway') ||
    file.filename.includes('db/') ||
    file.filename.includes('database/')
  );

  if (migrationFiles.length === 0) {
    return {
      prNumber,
      repository: `${owner}/${repo}`,
      schemaChanges: [],
      issues: [],
      recommendations: ['No schema changes detected in this PR.'],
      score: 100,
      summary: '✅ No database schema changes found in this PR.',
    };
  }

  const schemaChanges: PRSchemaChange[] = [];
  const issues: PRSchemaIssue[] = [];

  // Analyze each migration file
  for (const file of migrationFiles) {
    const changes = await analyzeFileChanges(octokit, owner, repo, file);
    schemaChanges.push(changes);

    // Check for common issues in the SQL
    const fileIssues = await detectSQLIssues(file.filename, file.patch || '');
    issues.push(...fileIssues);
  }

  // Deduplicate issues (same file, line, category, and issue text)
  const uniqueIssues = deduplicateIssues(issues);

  // Generate recommendations
  const recommendations = generatePRRecommendations(schemaChanges, uniqueIssues);

  // Calculate score
  const score = calculatePRScore(uniqueIssues);

  // Generate summary
  const summary = generatePRSummary(schemaChanges, uniqueIssues, score);

  logger.info('PR analysis completed', { owner, repo, prNumber, issuesFound: uniqueIssues.length });

  return {
    prNumber,
    repository: `${owner}/${repo}`,
    schemaChanges,
    issues: uniqueIssues,
    recommendations,
    score,
    summary,
  };
};

/**
 * Post analysis results as a PR comment
 */
export const postPRComment = async (
  githubToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  analysis: PRAnalysisResult
): Promise<void> => {
  // Use GitHub App if configured, otherwise use personal token
  let octokit: Octokit;
  
  const githubAppId = process.env.GITHUB_APP_ID;
  const githubAppPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const githubAppInstallationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (githubAppId && githubAppPrivateKey && githubAppInstallationId) {
    // Use GitHub App (bot account) - comments will show as bot
    logger.info('Using GitHub App for posting comment', { appId: githubAppId });
    octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: githubAppId,
        privateKey: githubAppPrivateKey.replace(/\\n/g, '\n'),
        installationId: githubAppInstallationId,
      },
    });
  } else {
    // Fallback to personal token (comments show as user)
    logger.info('Using personal token for posting comment');
    octokit = new Octokit({ auth: githubToken });
  }

  logger.info('Posting PR comment with CrewAI agent', { owner, repo, prNumber });

  // Call CrewAI Cloud API for analysis (as per BRD Month 5)
  // Flow: Schema Intel → CrewAI API → Analysis → PR Comment
  const comment = await callCrewAIAnalysis(analysis);

  // Post comment - will show as bot if using GitHub App, or user if using personal token
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: comment,
  });

  logger.info('Posted PR comment', { owner, repo, prNumber });
};

/**
 * Analyze individual file changes
 */
async function analyzeFileChanges(
  _octokit: Octokit,
  _owner: string,
  _repo: string,
  file: any
): Promise<PRSchemaChange> {
  const patch = file.patch || '';
  const additions: string[] = [];
  const deletions: string[] = [];

  // Parse patch to extract SQL statements
  const lines = patch.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push(line.substring(1).trim());
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions.push(line.substring(1).trim());
    }
  }

  // Determine change type
  const changeType = determineChangeType(additions);

  return {
    file: file.filename,
    additions,
    deletions,
    changeType,
  };
}

/**
 * Detect SQL issues in migration files
 */
async function detectSQLIssues(filename: string, patch: string): Promise<PRSchemaIssue[]> {
  const issues: PRSchemaIssue[] = [];
  const lines = patch.split('\n');

  // Check 9: No transaction wrapper in migration (check once per file, not per line)
  const hasTransaction = lines.slice(0, 10).some(l => {
    const lower = l.toLowerCase();
    return lower.includes('begin') || lower.includes('start transaction');
  });

  if (!hasTransaction && lines.length > 0) {
    // Only add this issue once per file
    issues.push({
      severity: 'MEDIUM',
      category: 'Migration Safety',
      issue: 'Migration file lacks transaction wrapper',
      suggestion: 'Wrap DDL statements in BEGIN/COMMIT for atomicity (where possible)',
      line: 1,
      file: filename,
    });
  }

  let lineNumber = 0;
  for (const line of lines) {
    lineNumber++;
    const trimmed = line.trim().toLowerCase();

    // Skip deletions and metadata
    if (trimmed.startsWith('-') || trimmed.startsWith('@@')) continue;

    const addedLine = trimmed.startsWith('+') ? trimmed.substring(1).trim() : trimmed;

    // Check 1: CREATE INDEX without CONCURRENTLY
    if (addedLine.includes('create index') && !addedLine.includes('concurrently')) {
      issues.push({
        severity: 'HIGH',
        category: 'Index Creation',
        issue: 'CREATE INDEX without CONCURRENTLY will lock the table',
        suggestion: 'Use CREATE INDEX CONCURRENTLY to avoid blocking reads/writes during index creation',
        line: lineNumber,
        file: filename,
      });
    }

    // Check 2: ALTER TABLE without proper considerations
    if (addedLine.includes('alter table') && addedLine.includes('add column')) {
      if (addedLine.includes('not null') && !addedLine.includes('default')) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Schema Migration',
          issue: 'Adding NOT NULL column without DEFAULT will fail on existing data',
          suggestion: 'Add a DEFAULT value or backfill data first, then add NOT NULL constraint',
          line: lineNumber,
          file: filename,
        });
      }
    }

    // Check 3: DROP COLUMN without safety
    if (addedLine.includes('drop column')) {
      issues.push({
        severity: 'HIGH',
        category: 'Data Loss Risk',
        issue: 'DROP COLUMN will permanently delete data',
        suggestion: 'Ensure data is backed up or migrated. Consider deprecating the column first.',
        line: lineNumber,
        file: filename,
      });
    }

    // Check 4: Missing foreign key index
    if (addedLine.includes('foreign key') || addedLine.includes('references')) {
      const hasCorrespondingIndex = lines.some(l =>
        l.toLowerCase().includes('create index') &&
        extractColumnName(addedLine, l.toLowerCase())
      );

      if (!hasCorrespondingIndex) {
        issues.push({
          severity: 'HIGH',
          category: 'Indexing',
          issue: 'Foreign key added without corresponding index',
          suggestion: 'Add an index on the foreign key column for better JOIN performance',
          line: lineNumber,
          file: filename,
        });
      }
    }

    // Check 5: TIMESTAMP without timezone
    if (addedLine.includes('timestamp') && !addedLine.includes('timestamptz') && !addedLine.includes('with time zone')) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Data Type',
        issue: 'TIMESTAMP without timezone can cause bugs',
        suggestion: 'Use TIMESTAMPTZ (TIMESTAMP WITH TIME ZONE) to handle timezones correctly',
        line: lineNumber,
        file: filename,
      });
    }

    // Check 6: Missing primary key on CREATE TABLE
    if (addedLine.includes('create table')) {
      const tableBlock = extractTableDefinition(lines, lineNumber);
      if (!tableBlock.toLowerCase().includes('primary key')) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Table Design',
          issue: 'CREATE TABLE without primary key',
          suggestion: 'Every table should have a primary key for data integrity and performance',
          line: lineNumber,
          file: filename,
        });
      }
    }

    // Check 7: Using TEXT instead of VARCHAR with appropriate limit
    if (addedLine.includes('varchar(255)')) {
      issues.push({
        severity: 'LOW',
        category: 'Data Type',
        issue: 'VARCHAR(255) is often a cargo-cult default',
        suggestion: 'Use TEXT for unbounded strings or a specific VARCHAR length if validation is needed',
        line: lineNumber,
        file: filename,
      });
    }

    // Check 8: JSON instead of JSONB
    if (addedLine.includes(' json') && !addedLine.includes('jsonb')) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Data Type',
        issue: 'Using JSON instead of JSONB',
        suggestion: 'Use JSONB for better performance and indexing support in PostgreSQL',
        line: lineNumber,
        file: filename,
      });
    }

    // Check 9: SERIAL instead of IDENTITY
    if (addedLine.includes('serial') || addedLine.includes('bigserial')) {
      issues.push({
        severity: 'LOW',
        category: 'Data Type',
        issue: 'Using legacy SERIAL type',
        suggestion: 'PostgreSQL 10+ recommends GENERATED AS IDENTITY for auto-increment columns',
        line: lineNumber,
        file: filename,
      });
    }
  }

  return issues;
}

/**
 * Deduplicate issues - remove duplicates based on file, line, category, and issue text
 */
function deduplicateIssues(issues: PRSchemaIssue[]): PRSchemaIssue[] {
  const seen = new Set<string>();
  const unique: PRSchemaIssue[] = [];

  for (const issue of issues) {
    // Create a unique key: file + line + category + issue text
    const key = `${issue.file || 'unknown'}:${issue.line || 0}:${issue.category}:${issue.issue}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(issue);
    }
  }

  return unique;
}

/**
 * Determine the type of schema change
 */
function determineChangeType(additions: string[]): PRSchemaChange['changeType'] {
  const combined = additions.join(' ').toLowerCase();

  if (combined.includes('create table')) return 'create';
  if (combined.includes('alter table')) return 'alter';
  if (combined.includes('drop table') || combined.includes('drop column')) return 'drop';

  return 'modify';
}

/**
 * Check if a foreign key column has a corresponding index definition line.
 *
 * This is intentionally a lightweight heuristic:
 * - Extract the FK column from a line like: CONSTRAINT ... FOREIGN KEY ("user_id") REFERENCES ...
 * - Extract indexed columns from a line like: CREATE INDEX ... ON ...("user_id", "other_col")
 * - Return true if the FK column appears in the index column list.
 */
function extractColumnName(fkLine: string, indexLine: string): boolean {
  const fk = fkLine.toLowerCase();
  const idx = indexLine.toLowerCase();

  // Get foreign key column name inside FOREIGN KEY(...)
  const fkMatch = fk.match(/foreign key\s*\(([^)]+)\)/);
  if (!fkMatch) return false;

  const fkCols = fkMatch[1]
    .split(',')
    .map((c) => c.replace(/"/g, '').trim())
    .filter(Boolean);

  if (fkCols.length === 0) return false;
  const fkCol = fkCols[0];

  // Extract all column names from the index definition: (...col1, col2,...)
  const idxMatch = idx.match(/\(([^)]+)\)/);
  if (!idxMatch) return false;

  const idxCols = idxMatch[1]
    .split(',')
    .map((c) => c.replace(/"/g, '').trim())
    .filter(Boolean);

  return idxCols.includes(fkCol);
}

/**
 * Extract table definition block
 */
function extractTableDefinition(lines: string[], startLine: number): string {
  let definition = '';
  let parenCount = 0;
  let started = false;

  for (let i = startLine; i < lines.length && i < startLine + 50; i++) {
    const line = lines[i];
    definition += line + '\n';

    for (const char of line) {
      if (char === '(') {
        parenCount++;
        started = true;
      } else if (char === ')') {
        parenCount--;
      }
    }

    if (started && parenCount === 0) break;
  }

  return definition;
}

/**
 * Generate recommendations for PR
 */
function generatePRRecommendations(changes: PRSchemaChange[], issues: PRSchemaIssue[]): string[] {
  const recommendations: string[] = [];

  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const highCount = issues.filter(i => i.severity === 'HIGH').length;

  if (criticalCount > 0) {
    recommendations.push(`⚠️ ${criticalCount} CRITICAL issue(s) must be fixed before merging`);
  }

  if (highCount > 0) {
    recommendations.push(`⚠️ ${highCount} HIGH severity issue(s) should be addressed`);
  }

  // Specific recommendations based on change types
  if (changes.some(c => c.changeType === 'drop')) {
    recommendations.push('🔴 This PR drops tables/columns - ensure data is backed up');
  }

  if (changes.some(c => c.changeType === 'create')) {
    recommendations.push('✅ Run ANALYZE after creating tables to update statistics');
  }

  if (issues.some(i => i.category === 'Index Creation')) {
    recommendations.push('⚡ Use CREATE INDEX CONCURRENTLY for zero-downtime deployments');
  }

  if (issues.length === 0) {
    recommendations.push('✅ No issues detected - schema changes look good!');
  }

  recommendations.push('📖 Review the PostgreSQL documentation for best practices');
  recommendations.push('🧪 Test migrations on a staging environment before production');

  return recommendations;
}

/**
 * Calculate PR score
 */
function calculatePRScore(issues: PRSchemaIssue[]): number {
  let score = 100;

  for (const issue of issues) {
    switch (issue.severity) {
      case 'CRITICAL':
        score -= 20;
        break;
      case 'HIGH':
        score -= 10;
        break;
      case 'MEDIUM':
        score -= 5;
        break;
      case 'LOW':
        score -= 2;
        break;
    }
  }

  return Math.max(0, score);
}

/**
 * Generate PR summary
 */
function generatePRSummary(changes: PRSchemaChange[], issues: PRSchemaIssue[], score: number): string {
  const parts: string[] = [];

  if (score >= 90) {
    parts.push('✅ Excellent! Schema changes follow best practices.');
  } else if (score >= 75) {
    parts.push('✓ Good schema changes with minor issues to address.');
  } else if (score >= 50) {
    parts.push('⚠️ Schema changes need attention - several issues detected.');
  } else {
    parts.push('❌ Critical issues detected - schema changes require significant revision.');
  }

  parts.push(`\nAnalyzed ${changes.length} file(s) with schema changes.`);

  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const highCount = issues.filter(i => i.severity === 'HIGH').length;

  if (criticalCount > 0) {
    parts.push(`\n🔴 ${criticalCount} CRITICAL issue(s) must be fixed before merging.`);
  }
  if (highCount > 0) {
    parts.push(`\n🟠 ${highCount} HIGH priority issue(s) should be addressed.`);
  }

  return parts.join(' ');
}

/**
 * Detect database type from schema changes
 */
function detectDatabaseType(analysis: PRAnalysisResult): string {
  // Check SQL syntax and keywords to determine database type
  const allSQL = analysis.schemaChanges
    .flatMap(change => [...change.additions, ...change.deletions])
    .join(' ')
    .toLowerCase();

  // PostgreSQL indicators
  if (allSQL.includes('serial') || allSQL.includes('timestamptz') || 
      allSQL.includes('jsonb') || allSQL.includes('pg_') ||
      allSQL.includes('generate_series') || allSQL.includes('array[')) {
    return 'postgresql';
  }

  // MySQL indicators
  if (allSQL.includes('auto_increment') || allSQL.includes('engine=') ||
      allSQL.includes('charset=') || allSQL.includes('collate=') ||
      allSQL.includes('unsigned') || allSQL.includes('tinyint')) {
    return 'mysql';
  }

  // SQL Server indicators
  if (allSQL.includes('nvarchar') || allSQL.includes('datetime2') ||
      allSQL.includes('identity(') || allSQL.includes('with (') ||
      allSQL.includes('on [primary]')) {
    return 'mssql';
  }

  // Snowflake indicators
  if (allSQL.includes('variant') || allSQL.includes('object') ||
      allSQL.includes('stage') || allSQL.includes('warehouse')) {
    return 'snowflake';
  }

  // Default to PostgreSQL
  return 'postgresql';
}

/**
 * Get Crew ID based on database type
 */
function getCrewIDForDatabaseType(dbType: string): string {
  // First check for database-specific crew ID
  const crewIdMap: { [key: string]: string } = {
    postgresql: process.env.CREWAI_CREW_ID_POSTGRESQL || process.env.CREWAI_CREW_ID || '',
    mysql: process.env.CREWAI_CREW_ID_MYSQL || process.env.CREWAI_CREW_ID || '',
    mssql: process.env.CREWAI_CREW_ID_MSSQL || process.env.CREWAI_CREW_ID || '',
    snowflake: process.env.CREWAI_CREW_ID_SNOWFLAKE || process.env.CREWAI_CREW_ID || '',
  };

  const crewId = crewIdMap[dbType.toLowerCase()] || process.env.CREWAI_CREW_ID || '';
  
  if (!crewId) {
    logger.warn('No CrewAI Crew ID found, using default');
    return 'pr-schema-reviewer-postgresql';
  }

  return crewId;
}

/**
 * Call CrewAI Cloud API to analyze PR schema changes
 * As specified in BRD Month 5: AI Reviewer Agent
 * Flow: Schema Intel Service → CrewAI API → Analysis Results
 * Supports multiple database types (PostgreSQL, MySQL, MSSQL, Snowflake)
 */
async function callCrewAIAnalysis(analysis: PRAnalysisResult): Promise<string> {
  const crewAIApiKey = process.env.CREWAI_API_KEY;
  const crewAIApiUrl = process.env.CREWAI_API_URL || 'https://api.crewai.com';

  if (!crewAIApiKey) {
    logger.warn('CREWAI_API_KEY not set, skipping CrewAI analysis - using template fallback');
    return formatPRComment(analysis);
  }

  try {
    // Detect database type from schema changes
    const dbType = detectDatabaseType(analysis);
    const crewId = getCrewIDForDatabaseType(dbType);

    if (!crewId || crewId === '') {
      logger.warn('CREWAI_CREW_ID not set, skipping CrewAI analysis - using template fallback');
      return formatPRComment(analysis);
    }

    logger.info('Calling CrewAI for database analysis', {
      dbType,
      crewId,
      score: analysis.score,
    });

    // Build context for CrewAI agents
    const issuesText = analysis.issues
      .map(issue => `- [${issue.severity}] ${issue.category}: ${issue.issue}\n  Suggestion: ${issue.suggestion}`)
      .join('\n');

    const changesText = analysis.schemaChanges
      .map(change => `- ${change.file}: ${change.changeType.toUpperCase()}`)
      .join('\n');

    const analysisContext = {
      database_type: dbType,
      score: analysis.score,
      summary: analysis.summary,
      issues: analysis.issues,
      schemaChanges: analysis.schemaChanges,
      recommendations: analysis.recommendations,
    };

    // Call CrewAI API to run agent crew for PR review
    // Uses database-specific crew (PostgreSQL Expert, MySQL Expert, etc.)
    // Note: API endpoint may vary - check CrewAI docs for correct endpoint
    const apiEndpoint = `${crewAIApiUrl}/api/v1/crew/kick`;
    
    logger.info('Calling CrewAI API', {
      endpoint: apiEndpoint,
      crewId,
      dbType,
    });

    const requestBody = {
      crew_id: crewId,
      inputs: {
        database_type: dbType,
        analysis_context: JSON.stringify(analysisContext),
        issues_text: issuesText,
        changes_text: changesText,
        pr_summary: `Schema Analysis Score: ${analysis.score}/100\n\nDatabase Type: ${dbType.toUpperCase()}\n\n${analysis.summary}`,
      },
    };

    logger.debug('CrewAI request body', { requestBody });

    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${crewAIApiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('CrewAI API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`CrewAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const crewResult = await response.json();
    
    logger.info('CrewAI API response', {
      hasResult: !!crewResult,
      resultKeys: Object.keys(crewResult || {}),
    });

    // Extract the final output from CrewAI crew execution, handling 'crewResult' as unknown
    let crewAnalysis = '';
    if (crewResult && typeof crewResult === 'object') {
      const resultObj = crewResult as Record<string, any>;
      crewAnalysis = resultObj.final_output || resultObj.result || resultObj.output || '';
    }

    logger.info('CrewAI analysis completed', {
      score: analysis.score,
      crewResultLength: crewAnalysis.length,
      hasAnalysis: crewAnalysis.length > 0,
      crewId,
      dbType,
    });

    // Format PR comment with CrewAI analysis
    // Pass true to indicate CrewAI was used
    return formatPRCommentWithCrewAIResult(analysis, crewAnalysis, true);
  } catch (error) {
    logger.error('CrewAI API call failed, falling back to template', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback to template (CrewAI not used)
    return formatPRComment(analysis);
  }
}

/**
 * Format PR comment with CrewAI analysis results
 */
function formatPRCommentWithCrewAIResult(analysis: PRAnalysisResult, crewAnalysis: string, crewAIUsed: boolean = true): string {
  const lines: string[] = [];
  
  // Header showing this is from CrewAI
  lines.push('## CrewAI - Database Schema Analysis\n');
  lines.push(`**Score: ${analysis.score}/100** ${getScoreEmoji(analysis.score)}\n`);
  
  // Clear indicator that CrewAI was used
  if (crewAIUsed && crewAnalysis) {
    lines.push(`\n> **AI-Powered Review by CrewAI Database Expert Agent**\n`);
    lines.push(`> This analysis was generated using specialized AI agents for database schema review.\n`);
  }
  
  lines.push('---\n');
  
  // CrewAI-generated analysis
  if (crewAnalysis && crewAnalysis.length > 0) {
    lines.push(`### 📊 AI Analysis\n`);
    lines.push(`${crewAnalysis}\n`);
    lines.push('---\n');
  }

  // Structured issues section
  if (analysis.issues.length > 0) {
    lines.push(`### Issues Found (${analysis.issues.length})\n`);
    const groupedIssues = groupIssuesBySeverity(analysis.issues);

    for (const [severity, issues] of Object.entries(groupedIssues)) {
      if (issues.length > 0) {
        lines.push(`\n#### ${getSeverityEmoji(severity)} ${severity} (${issues.length})\n`);
        for (const issue of issues) {
          lines.push(`- **${issue.category}**: ${issue.issue}`);
          lines.push(`  - ${issue.suggestion}`);
          if (issue.file && issue.line) {
            lines.push(`  - 📄 \`${issue.file}\` line ${issue.line}`);
          }
          lines.push('');
        }
      }
    }
    lines.push('---\n');
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    lines.push(`### Recommendations\n`);
    for (const rec of analysis.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
    lines.push('---\n');
  }

  // Schema changes
  if (analysis.schemaChanges.length > 0) {
    lines.push(`### Schema Changes Detected (${analysis.schemaChanges.length} file(s))\n`);
    for (const change of analysis.schemaChanges) {
      lines.push(`- \`${change.file}\` - **${change.changeType.toUpperCase()}** operation`);
    }
    lines.push('');
  }

  lines.push('---\n');
  
  // Footer with clear CrewAI indicator
  if (crewAIUsed && crewAnalysis) {
    lines.push('*This analysis was performed by **Schema Intelligence** — AI-Powered Database Schema Analysis*\n');
    lines.push('*AI analysis powered by [CrewAI](https://app.crewai.com) - Database Expert Agent*\n');
    lines.push('*Verified: CrewAI agent was used for this review*\n');
  } else {
    lines.push('*This analysis was performed by **Schema Intelligence** — AI-Powered Database Schema Analysis*\n');
    lines.push('*Note: CrewAI analysis unavailable - using template-based review*\n');
  }

  return lines.join('\n');
}

/**
 * Format PR comment with analysis results (fallback template)
 */
function formatPRComment(analysis: PRAnalysisResult): string {
  const lines: string[] = [];

  lines.push('## 🔍 Schema Intelligence - Database Schema Analysis\n');
  lines.push(`**Score: ${analysis.score}/100** ${getScoreEmoji(analysis.score)}\n`);
  lines.push('---\n');
  lines.push(`### Summary\n`);
  lines.push(`${analysis.summary}\n`);
  lines.push('---\n');

  if (analysis.issues.length > 0) {
    lines.push(`### Issues Found (${analysis.issues.length})\n`);

    const groupedIssues = groupIssuesBySeverity(analysis.issues);

    for (const [severity, issues] of Object.entries(groupedIssues)) {
      if (issues.length > 0) {
        lines.push(`\n#### ${getSeverityEmoji(severity)} ${severity} (${issues.length})\n`);

        for (const issue of issues) {
          lines.push(`- **${issue.category}**: ${issue.issue}`);
          lines.push(`  - ${issue.suggestion}`);
          if (issue.file && issue.line) {
            lines.push(`  - 📄 \`${issue.file}\` line ${issue.line}`);
          }
          lines.push('');
        }
      }
    }

    lines.push('---\n');
  }

  if (analysis.recommendations.length > 0) {
    lines.push(`### Recommendations\n`);
    for (const rec of analysis.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
    lines.push('---\n');
  }

  if (analysis.schemaChanges.length > 0) {
    lines.push(`### Schema Changes Detected (${analysis.schemaChanges.length} file(s))\n`);
    for (const change of analysis.schemaChanges) {
      lines.push(`- \`${change.file}\` - **${change.changeType.toUpperCase()}** operation`);
    }
    lines.push('');
  }

  lines.push('---\n');
  lines.push('*This analysis was performed by **Schema Intelligence** — AI-Powered Database Schema Analysis*\n');
  lines.push('*For detailed schema analysis, run the full tool on your complete database schema.*\n');

  return lines.join('\n');
}

/**
 * Group issues by severity
 */
function groupIssuesBySeverity(issues: PRSchemaIssue[]): { [key: string]: PRSchemaIssue[] } {
  const grouped: { [key: string]: PRSchemaIssue[] } = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };

  for (const issue of issues) {
    grouped[issue.severity].push(issue);
  }

  return grouped;
}

/**
 * Get emoji for score
 */
function getScoreEmoji(score: number): string {
  if (score >= 90) return '🎉';
  if (score >= 75) return '✅';
  if (score >= 50) return '⚠️';
  return '❌';
}

/**
 * Get emoji for severity
 */
function getSeverityEmoji(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return '🔴';
    case 'HIGH':
      return '🟠';
    case 'MEDIUM':
      return '🟡';
    case 'LOW':
      return '🔵';
    default:
      return '⚪';
  }
}

/**
 * Save PR analysis to database
 */
export const savePRAnalysis = async (
  repository: string,
  prNumber: number,
  analysis: PRAnalysisResult
): Promise<void> => {
  // This would save to a new table in the database
  // For now, just log it
  logger.info('PR analysis saved', { repository, prNumber, score: analysis.score });
};

export default {
  analyzePRSchemaChanges,
  postPRComment,
  savePRAnalysis,
};

