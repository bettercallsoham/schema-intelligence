import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// CrewAI-TS is ESM-only, so we'll use dynamic imports
type CrewAITypes = {
  Agent: any;
  Task: any;
  Crew: any;
  OpenAILLM: any;
};

interface CrewTaskOutput {
  result?: string;
}

interface CrewRunOutput {
  finalOutput?: string;
  taskOutputs?: CrewTaskOutput[];
}

interface IssueContext {
  tableName?: string;
  columnName?: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  recommendation?: string;
}

interface TableDetail {
  name: string;
  columnCount: number;
  rowCount?: number | null;
  hasPrimaryKey: boolean;
  hasIndexes: boolean;
  indexCount: number;
  foreignKeyCount: number;
}

interface SchemaContext {
  databaseName: string;
  tablesCount: number;
  tableNames: string[];
  tablesWithDetails?: TableDetail[];
  issuesCount: number;
  topIssues: IssueContext[];
  healthScore?: number;
}

interface LLMResponse {
  explanation: string;
  sqlSuggestions: string[];
  recommendations: string[];
}

function formatIssuesForPrompt(issues: IssueContext[]): string {
  if (!issues || issues.length === 0) {
    return 'No specific issues detected.';
  }

  return issues.map((issue, idx) => {
    const parts = [
      `${idx + 1}. [${issue.severity}] ${issue.title}`,
      `   Description: ${issue.description}`,
    ];
    if (issue.tableName) parts.push(`   Table: ${issue.tableName}`);
    if (issue.columnName) parts.push(`   Column: ${issue.columnName}`);
    if (issue.category) parts.push(`   Category: ${issue.category}`);
    return parts.join('\n');
  }).join('\n\n');
}

function formatTablesForPrompt(tableNames: string[], tablesWithDetails?: TableDetail[]): string {
  if (!tableNames || tableNames.length === 0) {
    return 'No tables found.';
  }
  
  // If we have detailed table information, use it
  if (tablesWithDetails && tablesWithDetails.length > 0) {
    return tablesWithDetails.map((table, idx) => {
      const parts = [`${idx + 1}. ${table.name} (${table.columnCount} columns)`];
      if (table.rowCount !== null && table.rowCount !== undefined) {
        parts.push(`   Rows: ${table.rowCount.toLocaleString()}`);
      }
      if (!table.hasPrimaryKey) {
        parts.push(`   ⚠️ No primary key`);
      }
      if (table.indexCount > 0) {
        parts.push(`   Indexes: ${table.indexCount}`);
      }
      return parts.join('\n');
    }).join('\n');
  }
  
  // Fallback to simple list
  return tableNames.map((name, idx) => `${idx + 1}. ${name}`).join('\n');
}

// Initialize LangChain model
function getLangChainModel() {
  // Try OpenAI first if available, otherwise use Google Gemini
  if (process.env.OPENAI_API_KEY) {
    return new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || 'gpt-4',
      temperature: 0.3,
      maxTokens: 2000,
      timeout: 60000, // 60 seconds timeout
    });
  } else if (env.geminiApiKey && env.geminiApiKey.trim().length > 0) {
    return new ChatGoogleGenerativeAI({
      modelName: env.geminiModel,
      apiKey: env.geminiApiKey,
      temperature: 0.3,
      maxOutputTokens: 2000,
    });
  }
  return null;
}

export async function generateAIExplanation(
  message: string,
  schemaContext: SchemaContext | null,
  knowledgeBaseText: string,
): Promise<LLMResponse> {
  const model = getLangChainModel();

  if (!model) {
    logger.warn('No LLM model configured, using fallback response');
    return {
      explanation: 'AI-powered explanations require either OPENAI_API_KEY or GEMINI_API_KEY in your environment variables.',
      sqlSuggestions: [],
      recommendations: ['Configure OPENAI_API_KEY or GEMINI_API_KEY to enable AI-powered explanations'],
    };
  }

  try {
    // Build the system prompt
    const systemPrompt = `You are a senior PostgreSQL database performance engineer and schema optimization expert. Your role is to:

1. Analyze database schemas and identify performance issues
2. Explain problems in clear, human-readable language
3. Provide executable SQL suggestions to fix issues
4. Give actionable recommendations based on database best practices

KNOWLEDGE BASE (follow these rules strictly):
${knowledgeBaseText}

CRITICAL: ANSWER STYLE - BE DIRECT AND CONCISE FIRST
- ALWAYS START YOUR RESPONSE WITH A DIRECT, SPECIFIC ANSWER to the user's question
- Answer questions directly without verbose introductions like "Good news!" or "I found that..."
- For "which table" questions: Start with "Table: [name] - [count/attribute]" or "Tables: [list]"
- For "how many" questions: Start with the exact number
- For "yes/no" questions: Start with "Yes" or "No" followed by brief explanation
- Keep the direct answer concise (1-2 sentences maximum)
- THEN provide detailed explanations, context, and recommendations

EXAMPLES OF GOOD DIRECT ANSWERS:
- User: "Which table has too many columns?" → Answer: "Table: users (45 columns)" or "None. The table with most columns is orders (28 columns)"
- User: "How many tables are there?" → Answer: "12 tables"
- User: "Are there any missing indexes?" → Answer: "Yes. 3 tables are missing indexes: users, orders, products"

IMPORTANT GUIDELINES:
- Be direct and factual - avoid verbose or conversational introductions
- Provide executable PostgreSQL SQL statements when relevant
- Explain WHY each issue matters and WHAT impact it has (after the direct answer)
- Prioritize recommendations by severity and impact
- Use clear, professional language suitable for developers
- Be specific and actionable
- Format SQL code blocks properly
- Consider the schema context when making recommendations

RESPONSE FORMAT:
Your response should be structured as follows:

DIRECT ANSWER:
[Provide a direct, concise answer (1-2 sentences). Examples: "Table: users (45 columns)", "None", "3 tables: users, orders, products", "12 tables"]

EXPLANATION:
[Provide a clear, detailed explanation addressing the user's question. Explain why issues exist, what impact they have, and what should be done.]

SQL SUGGESTIONS:
[Provide executable PostgreSQL SQL statements. Each SQL statement should be in a code block. Include comments explaining what each statement does.]

RECOMMENDATIONS:
[Provide 3-5 prioritized, actionable recommendations with brief explanations of why each helps.]`;

    // Build the user prompt
    let userPrompt = `USER QUESTION: ${message}\n\n`;

    if (schemaContext) {
      userPrompt += `SCHEMA CONTEXT:
- Database Name: ${schemaContext.databaseName}
- Total Tables: ${schemaContext.tablesCount}
- Total Issues Detected: ${schemaContext.issuesCount}
- Health Score: ${schemaContext.healthScore ?? 'N/A'} / 100
${schemaContext.healthScore !== undefined ? `  (Higher is better - ${schemaContext.healthScore >= 80 ? 'Good' : schemaContext.healthScore >= 60 ? 'Fair' : 'Needs Improvement'})` : ''}

TABLES IN DATABASE:
${formatTablesForPrompt(schemaContext.tableNames, schemaContext.tablesWithDetails)}

TOP ISSUES:
${formatIssuesForPrompt(schemaContext.topIssues)}

TASKS:
1. FIRST: Provide a DIRECT, CONCISE answer (1-2 sentences) - list table names with counts, provide exact numbers, or state "None" if applicable
2. THEN: Analyze the user's question in the context of this schema
3. Explain any relevant issues in human-readable language
4. Provide executable PostgreSQL SQL statements to fix identified problems
5. Give prioritized recommendations with clear reasoning
6. If the question is about specific tables or issues, focus on those
7. If asking about optimization, provide a comprehensive action plan

CRITICAL: Start with a direct answer. Avoid verbose responses like "Good news!" or lengthy introductions. Be factual and concise first, then provide details.`;
    } else {
      userPrompt += `No specific database schema context is available. Please provide general guidance based on the knowledge base.`;
    }

    logger.info('Calling LLM API', {
      modelName: env.geminiApiKey ? env.geminiModel : (process.env.OPENAI_MODEL || 'gpt-4'),
      hasApiKey: !!(env.geminiApiKey || process.env.OPENAI_API_KEY),
      messageLength: message.length,
    });

    // Add timeout wrapper for the API call (60 seconds)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout: The AI API call took longer than 60 seconds')), 60000);
    });

    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await Promise.race([
      model.invoke(prompt),
      timeoutPromise,
    ]);
    const responseText = response.content as string;

    // Parse the response
    const parsed = parseLLMResponse(responseText);

    logger.info('AI explanation generated successfully with LangChain', {
      messageLength: message.length,
      hasContext: !!schemaContext,
      responseLength: responseText.length,
    });

    return parsed;
  } catch (error) {
    logger.error('Failed to generate AI explanation with LangChain', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : undefined,
    });

    // Provide specific error messages based on error type
    let errorMessage = 'Unknown error occurred';
    let recommendations = ['Check API key configuration', 'Verify network connectivity', 'Try again in a moment'];

    if (error instanceof Error) {
      if (error.message.includes('timeout') || error.message.includes('timed out')) {
        errorMessage = 'The AI request timed out. This can happen with complex queries. Please try again with a simpler question or wait a moment.';
        recommendations = ['Try rephrasing your question', 'Wait a moment and try again', 'Check API status'];
      } else if (error.message.includes('API key') || error.message.includes('authentication') || error.message.includes('401') || error.message.includes('403')) {
        errorMessage = 'API authentication failed. Please check your API key in the backend .env file.';
        recommendations = ['Verify API key is set correctly', 'Check the key is valid', 'Restart the backend server'];
      } else if (error.message.includes('rate limit') || error.message.includes('429')) {
        errorMessage = 'API rate limit exceeded. Please wait a moment before trying again.';
        recommendations = ['Wait 1-2 minutes before retrying', 'Check your API usage limits'];
      } else {
        errorMessage = error.message;
      }
    }

    return {
      explanation: `I encountered an error while generating an AI-powered explanation: ${errorMessage}\n\nIf this persists, please check:\n1. API key is configured correctly in backend/.env\n2. Network connectivity\n3. Backend server logs for detailed error information`,
      sqlSuggestions: [],
      recommendations: recommendations,
    };
  }
}

/**
 * Dynamically import CrewAI-TS (ESM module)
 * This is needed because crewai-ts is ESM-only and we're using CommonJS
 */
async function loadCrewAI(): Promise<CrewAITypes | null> {
  try {
    const crewai = await import('crewai-ts');
    return {
      Agent: crewai.Agent,
      Task: crewai.Task,
      Crew: crewai.Crew,
      OpenAILLM: crewai.OpenAILLM,
    };
  } catch (error) {
    logger.warn('Failed to load CrewAI-TS (ESM module may not be compatible)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get LLM instance for CrewAI-TS
 * Note: Currently only supports OpenAI as crewai-ts doesn't have Gemini support
 */
async function getCrewAILLM(crewai: CrewAITypes): Promise<any | null> {
  // Try OpenAI if available
  if (process.env.OPENAI_API_KEY) {
    return new crewai.OpenAILLM({
      apiKey: process.env.OPENAI_API_KEY,
      modelName: process.env.OPENAI_MODEL || 'gpt-4o',
    });
  }
  
  return null;
}

/**
 * Generate AI explanation using CrewAI-TS for complex multi-agent tasks
 * This uses multiple specialized agents working together
 */
export async function generateAIExplanationWithCrewAI(
  message: string,
  schemaContext: SchemaContext | null,
  knowledgeBaseText: string,
): Promise<LLMResponse> {
  try {
    // Load CrewAI-TS dynamically (ESM module)
    const crewai = await loadCrewAI();
    if (!crewai) {
      logger.warn('CrewAI-TS not available, falling back to LangChain');
      return generateAIExplanation(message, schemaContext, knowledgeBaseText);
    }

    // Get the LLM instance for CrewAI agents (currently only OpenAI is supported)
    const llm = await getCrewAILLM(crewai);
    if (!llm) {
      logger.warn('No OpenAI API key available for CrewAI, falling back to LangChain');
      return generateAIExplanation(message, schemaContext, knowledgeBaseText);
    }

    // Create database expert agent
    const databaseExpert = new crewai.Agent({
      role: 'Senior PostgreSQL Database Engineer',
      goal: 'Analyze database schemas and provide expert recommendations',
      backstory: 'You are a senior database engineer with 20+ years of experience optimizing PostgreSQL databases. You specialize in performance tuning, indexing strategies, and schema design.',
      llm: llm,
      verbose: true,
    });

    // Create SQL specialist agent
    const sqlSpecialist = new crewai.Agent({
      role: 'SQL Optimization Specialist',
      goal: 'Generate optimized, executable SQL statements',
      backstory: 'You are an expert in writing efficient PostgreSQL SQL queries and DDL statements. You understand query optimization, indexing, and best practices.',
      llm: llm,
      verbose: true,
    });

    // Build context string
    const contextString = schemaContext
      ? `Schema Context:
- Database: ${schemaContext.databaseName}
- Tables: ${schemaContext.tablesCount}
- Issues: ${schemaContext.issuesCount}
- Health Score: ${schemaContext.healthScore ?? 'N/A'}/100

TABLES IN DATABASE:
${formatTablesForPrompt(schemaContext.tableNames, schemaContext.tablesWithDetails)}

TOP ISSUES:
${formatIssuesForPrompt(schemaContext.topIssues)}

Knowledge Base:
${knowledgeBaseText}`
      : `Knowledge Base:
${knowledgeBaseText}`;

    // Create analysis task
    const analysisTask = new crewai.Task({
      description: `Analyze the following database question and provide expert insights:
      
Question: ${message}

${contextString}

CRITICAL INSTRUCTIONS - ANSWER STYLE:
- START WITH A DIRECT, CONCISE ANSWER (1-2 sentences)
- For "which table" questions: Answer with "Table: [name] - [count]" or "None" if no match
- For "how many" questions: Answer with the exact number first
- Avoid verbose introductions like "Good news!" or "I found that..."
- Be factual and concise in the direct answer, THEN provide detailed explanations

Focus on:
1. Providing a DIRECT, CONCISE answer first (1-2 sentences)
2. THEN identifying the root causes of problems
3. Explaining the impact on performance
4. Providing actionable insights`,
      agent: databaseExpert,
      expectedOutput: 'A direct, concise answer (1-2 sentences) followed by detailed explanation with analysis and recommendations',
    });

    // Create SQL generation task
    const sqlTask = new crewai.Task({
      description: `Based on the analysis from the database expert, generate executable PostgreSQL SQL statements to address the issues identified. 

Requirements:
- Each SQL statement must be executable
- Include comments explaining what each statement does
- Prioritize by impact and severity
- Ensure SQL follows PostgreSQL best practices`,
      agent: sqlSpecialist,
      expectedOutput: 'Executable SQL statements with comments',
      context: [analysisTask.id],
    });

    // Create crew with sequential process
    const crew = new crewai.Crew({
      agents: [databaseExpert, sqlSpecialist],
      tasks: [analysisTask, sqlTask],
      process: 'sequential',
      verbose: true,
    });

    // Execute crew
    const crewOutput = (await crew.kickoff()) as CrewRunOutput;

    // Get the final output from the crew
    let fullOutput = crewOutput.finalOutput || '';
    
    // Also include task outputs for more context
    if (crewOutput.taskOutputs && crewOutput.taskOutputs.length > 0) {
      crewOutput.taskOutputs.forEach((taskOutput) => {
        if (taskOutput && taskOutput.result) {
          fullOutput += '\n\n' + taskOutput.result;
        }
      });
    }

    // Parse the result
    const parsed = parseLLMResponse(fullOutput);

    logger.info('AI explanation generated successfully with CrewAI-TS', {
      messageLength: message.length,
      hasContext: !!schemaContext,
    });

    return parsed;
  } catch (error) {
    logger.error('Failed to generate AI explanation with CrewAI-TS', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Fallback to regular LangChain
    logger.info('Falling back to LangChain after CrewAI-TS error');
    return generateAIExplanation(message, schemaContext, knowledgeBaseText);
  }
}

function parseLLMResponse(responseText: string): LLMResponse {
  // Try to parse structured response
  const directAnswerMatch = responseText.match(/DIRECT ANSWER:?\s*\n(.*?)(?=EXPLANATION:|SQL SUGGESTIONS:|RECOMMENDATIONS:|$)/is);
  const explanationMatch = responseText.match(/EXPLANATION:?\s*\n(.*?)(?=SQL SUGGESTIONS:|RECOMMENDATIONS:|$)/is);
  const sqlMatch = responseText.match(/SQL SUGGESTIONS:?\s*\n(.*?)(?=RECOMMENDATIONS:|$)/is);
  const recommendationsMatch = responseText.match(/RECOMMENDATIONS:?\s*\n(.*?)$/is);

  // Combine direct answer and explanation
  let explanation = '';
  if (directAnswerMatch) {
    explanation = directAnswerMatch[1].trim();
    if (explanationMatch) {
      explanation += '\n\n' + explanationMatch[1].trim();
    }
  } else if (explanationMatch) {
    explanation = explanationMatch[1].trim();
  } else {
    explanation = responseText;
  }
  let sqlText = sqlMatch ? sqlMatch[1].trim() : '';
  let recommendationsText = recommendationsMatch ? recommendationsMatch[1].trim() : '';

  // Extract SQL code blocks
  const sqlSuggestions: string[] = [];
  const sqlBlockRegex = new RegExp('```(?:sql|postgresql)?\\s*\\n([\\s\\S]*?)```', 'gi');
  let sqlBlockMatch: RegExpExecArray | null;
  while ((sqlBlockMatch = sqlBlockRegex.exec(sqlText)) !== null) {
    const sql = sqlBlockMatch[1].trim();
    if (sql) sqlSuggestions.push(sql);
  }

  // If no code blocks found, try to extract SQL statements
  if (sqlSuggestions.length === 0 && sqlText) {
    const sqlStatements = sqlText.split(/\n\n+/).filter(line => 
      line.trim().toUpperCase().startsWith('CREATE') ||
      line.trim().toUpperCase().startsWith('ALTER') ||
      line.trim().toUpperCase().startsWith('DROP') ||
      line.trim().toUpperCase().startsWith('INSERT') ||
      line.trim().toUpperCase().startsWith('UPDATE') ||
      line.trim().toUpperCase().startsWith('DELETE') ||
      line.trim().toUpperCase().startsWith('SELECT')
    );
    sqlSuggestions.push(...sqlStatements);
  }

  // Extract recommendations as list items
  const recommendations: string[] = [];
  if (recommendationsText) {
    const recLines = recommendationsText.split(/\n/).filter(line => {
      const trimmed = line.trim();
      return trimmed && (
        trimmed.startsWith('-') ||
        trimmed.startsWith('•') ||
        trimmed.startsWith('*') ||
        /^\d+\./.test(trimmed)
      );
    });
    recommendations.push(...recLines.map(line => line.replace(/^[-•*]\s*|\d+\.\s*/, '').trim()).filter(r => r));
  }

  // If no structured format found, use the whole response as explanation
  if (!explanationMatch && !sqlMatch && !recommendationsMatch) {
    explanation = responseText;
  }

  return {
    explanation: explanation || 'No explanation generated.',
    sqlSuggestions: sqlSuggestions.length > 0 ? sqlSuggestions : [],
    recommendations: recommendations.length > 0 ? recommendations : [],
  };
}

export async function explainSpecificIssue(
  issue: IssueContext,
  schemaContext: SchemaContext,
  knowledgeBaseText: string,
): Promise<LLMResponse> {
  const model = getLangChainModel();

  if (!model) {
    return {
      explanation: 'AI-powered explanations require an API key.',
      sqlSuggestions: [],
      recommendations: [],
    };
  }

  try {
    const systemPrompt = `You are a PostgreSQL database expert. Explain issues clearly and provide executable SQL fixes.

KNOWLEDGE BASE:
${knowledgeBaseText}`;

    const userPrompt = `ISSUE DETAILS:
- Title: ${issue.title}
- Description: ${issue.description}
- Severity: ${issue.severity}
- Category: ${issue.category}
${issue.tableName ? `- Table: ${issue.tableName}` : ''}
${issue.columnName ? `- Column: ${issue.columnName}` : ''}

SCHEMA CONTEXT:
- Database: ${schemaContext.databaseName}
- Total Tables: ${schemaContext.tablesCount}

TASK:
1. Explain why this issue exists and its impact
2. Provide executable PostgreSQL SQL to fix it
3. Give 2-3 recommendations

Format your response with EXPLANATION, SQL SUGGESTIONS, and RECOMMENDATIONS sections.`;

    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const response = await model.invoke(prompt);
    return parseLLMResponse(response.content as string);
  } catch (error) {
    logger.error('Failed to explain specific issue with LangChain', { 
      error: error instanceof Error ? error.message : String(error) 
    });
    return {
      explanation: `Error generating explanation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      sqlSuggestions: [],
      recommendations: [],
    };
  }
}
