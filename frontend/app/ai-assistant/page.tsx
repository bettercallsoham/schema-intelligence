'use client';

import React, { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/Button';
import { ConversationList } from '@/components/ai-assistant/ConversationList';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faPaperPlane,
  faRobot,
  faUser,
  faCopy,
  faCheck,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import { useApp } from '@/contexts/AppContext';
import { assistantApi, conversationApi } from '@/lib/api';
import type { Message, Conversation } from '@/types';
import { formatMessageContent } from '@/utils/formatMessage';

const MAX_MESSAGE_LENGTH = 5000;

export default function AIAssistantPage() {
  const { selectedDatabaseId, databases, setSelectedDatabaseId } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedSqlIndex, setCopiedSqlIndex] = useState<number | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isConversationsVisible, setIsConversationsVisible] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedDatabase = databases.find((db) => db.id === selectedDatabaseId);

  // Auto-select first database if available and none is selected
  useEffect(() => {
    if (databases.length > 0 && !selectedDatabaseId) {
      setSelectedDatabaseId(databases[0].id);
    }
  }, [databases, selectedDatabaseId, setSelectedDatabaseId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversation messages when a conversation is selected
  useEffect(() => {
    if (selectedConversation?.id) {
      loadConversationMessages(selectedConversation.id);
    } else {
      setMessages([]);
      setConversationId(null);
    }
  }, [selectedConversation?.id]);

  const loadConversationMessages = async (convId: string) => {
    try {
      const conversation = await conversationApi.get(convId);
      if (conversation.messages) {
        setMessages(conversation.messages.map((msg) => ({
          ...msg,
          role: msg.role.toLowerCase() as 'user' | 'assistant',
        })));
      }
      setConversationId(convId);
    } catch (error: any) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleNewChat = async () => {
    setMessages([]);
    setMessage('');
    setSelectedConversation(null);
    setConversationId(null);
  };

  const handleSelectConversation = (conversation: Conversation | null) => {
    setSelectedConversation(conversation);
  };

  const handleSendMessage = async () => {
    if (!message.trim() || isLoading) return;

    // Validate message length
    if (message.length > MAX_MESSAGE_LENGTH) {
      const errorMessage: Message = {
        id: `msg-error-${Date.now()}`,
        conversationId: conversationId ?? '',
        role: 'assistant',
        content: `Message is too long. Maximum length is ${MAX_MESSAGE_LENGTH} characters. Please shorten your message.`,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      return;
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      conversationId: conversationId ?? '',
      role: 'user',
      content: message.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const messageToSend = message.trim();
    setMessage('');
    setIsLoading(true);

    try {
      const response = await assistantApi.sendMessage(
        messageToSend,
        selectedDatabase?.name,
        conversationId || undefined
      );
      setMessages((prev) => [...prev, response]);
      
      // Update conversation ID if it was created
      if (response.conversationId && response.conversationId !== conversationId) {
        setConversationId(response.conversationId);
        // Reload conversation to get the full conversation object
        try {
          const updatedConversation = await conversationApi.get(response.conversationId);
          setSelectedConversation(updatedConversation);
        } catch (err) {
          console.error('Failed to load updated conversation:', err);
        }
      }
    } catch (error: any) {
      console.error('Failed to send message:', error);
      
      // Extract error message from response
      let errorContent = 'Sorry, I encountered an error. Please try again.';
      
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        errorContent = '⏱️ Request timed out. The AI response is taking longer than expected. This can happen with complex queries. Please try:\n\n1. Wait a moment and try again\n2. Simplify your question\n3. Check if the backend server is still running';
      } else if (error.code === 'ERR_NETWORK' || error.message === 'Network Error' || !error.response) {
        errorContent = '🔌 Network Error: Cannot connect to the backend server.\n\n**Please check:**\n1. Is the backend running? (Run `npm run dev` in the `backend` folder)\n2. Is it running on http://localhost:3001?\n3. Check the backend terminal for any error messages\n\n**To start the backend:**\n```bash\ncd backend\nnpm run dev\n```';
      } else if (error.response?.status === 500) {
        errorContent = `❌ Server Error (500): ${error.response.data?.message || 'An internal server error occurred'}\n\nPlease check the backend logs for more details.`;
      } else if (error.response?.status === 401) {
        errorContent = '🔐 Authentication Error: Please log in again.';
      } else if (error.response?.data?.message) {
        errorContent = `Error: ${error.response.data.message}`;
      } else if (error.response?.data?.error) {
        errorContent = `Error: ${error.response.data.error}`;
      } else if (error.message) {
        errorContent = `Error: ${error.message}`;
      }
      
      const errorMessage: Message = {
        id: `msg-error-${Date.now()}`,
        conversationId: conversationId ?? '',
        role: 'assistant',
        content: errorContent,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout breadcrumbs={[{ label: 'AI Assistant' }]}>
      <div className="flex-1 flex flex-row h-full">
        {/* Conversation List Sidebar */}
        {isConversationsVisible && (
          <div className="w-80 flex-shrink-0 border-r border-border">
            <ConversationList
              selectedConversationId={selectedConversation?.id || null}
              onSelectConversation={handleSelectConversation}
              onNewConversation={handleNewChat}
            />
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setIsConversationsVisible(!isConversationsVisible)}
          className="flex-shrink-0 w-6 bg-surface border-r border-border hover:bg-surface-light transition-colors flex items-center justify-center group"
          title={isConversationsVisible ? 'Hide conversations' : 'Show conversations'}
        >
          <FontAwesomeIcon
            icon={isConversationsVisible ? faChevronLeft : faChevronRight}
            className="text-text-muted group-hover:text-text-primary text-sm"
          />
        </button>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="p-lg border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <FontAwesomeIcon icon={faRobot} className="text-primary text-lg" />
            </div>
            <div>
              <h1 className="text-h2 text-text-primary">AI Assistant</h1>
              <p className="text-body-sm text-text-secondary">
                {selectedDatabase
                  ? `Helping with: ${selectedDatabase.name}`
                  : databases.length > 0
                  ? `Ready to help with: ${databases[0].name}`
                  : 'No databases found. Upload a schema first to get started'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!selectedDatabase && databases.length === 0 && (
              <Button 
                variant="primary" 
                size="sm" 
                onClick={() => window.location.href = '/databases'}
              >
                Go to Databases
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleNewChat} icon={faPlus}>
              New Chat
            </Button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-lg">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FontAwesomeIcon icon={faRobot} className="text-primary text-2xl" />
                </div>
                {!selectedDatabase && databases.length === 0 ? (
                  <>
                    <h2 className="text-h3 text-text-primary mb-2">No Database Available</h2>
                    <p className="text-body text-text-secondary mb-6">
                      You need to upload a database schema first. Go to the <strong>Databases</strong> page to ingest your schema JSON file.
                    </p>
                    <Button 
                      variant="primary" 
                      onClick={() => window.location.href = '/databases'}
                      className="mt-4"
                    >
                      Go to Databases Page
                    </Button>
                  </>
                ) : (
                  <>
                    <h2 className="text-h3 text-text-primary mb-2">Ask me anything about your schema</h2>
                    <p className="text-body text-text-secondary mb-6">
                      I can help you with performance optimization, indexing strategies, schema design, and more.
                      {selectedDatabase && (
                        <span className="block mt-2 text-body-sm text-text-muted">
                          Currently analyzing: <strong>{selectedDatabase.name}</strong>
                        </span>
                      )}
                    </p>
                    <div className="space-y-2 text-left">
                      <p className="text-body-sm text-text-muted">Try asking:</p>
                      <ul className="text-body-sm text-text-secondary space-y-1">
                        <li>• "How can I optimize my database?"</li>
                        <li>• "What indexes do I need?"</li>
                        <li>• "Explain foreign key relationships"</li>
                        <li>• "Why is my table slow?"</li>
                        <li>• "Show all the table names"</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1">
                      <FontAwesomeIcon icon={faRobot} className="text-white text-sm" />
                    </div>
                  )}
                  <div
                    className={`flex-1 max-w-3xl ${
                      msg.role === 'user' ? 'flex justify-end' : ''
                    }`}
                  >
                    <div
                      className={`p-4 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-primary text-white rounded-tr-none'
                          : 'bg-surface-light border border-border rounded-tl-none'
                      }`}
                    >
                      <div className="text-body">
                        {msg.content.split('```sql').map((part, partIdx) => {
                          if (partIdx === 0) {
                            // Format the text content with proper headings and bullet points
                            return (
                              <div key={partIdx}>
                                {formatMessageContent(part, msg.role === 'user')}
                              </div>
                            );
                          }
                          const [sqlCode, ...rest] = part.split('```');
                          const remaining = rest.join('```');
                          return (
                            <React.Fragment key={partIdx}>
                              <div className="mt-4 mb-4 relative">
                                <div className="flex items-center justify-between mb-2">
                                  <span className={`text-caption ${msg.role === 'user' ? 'text-white/80' : 'text-text-muted'}`}>
                                    SQL Suggestion {partIdx}
                                  </span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(sqlCode.trim());
                                      setCopiedSqlIndex(partIdx);
                                      setTimeout(() => setCopiedSqlIndex(null), 2000);
                                    }}
                                    className={`text-caption flex items-center gap-1 transition-colors ${
                                      msg.role === 'user'
                                        ? 'text-white hover:text-white/80'
                                        : 'text-primary hover:text-primary/80'
                                    }`}
                                  >
                                    <FontAwesomeIcon 
                                      icon={copiedSqlIndex === partIdx ? faCheck : faCopy} 
                                      className="text-xs"
                                    />
                                    {copiedSqlIndex === partIdx ? 'Copied!' : 'Copy'}
                                  </button>
                                </div>
                                <pre className={`border rounded p-3 overflow-x-auto ${
                                  msg.role === 'user'
                                    ? 'bg-white/10 border-white/20'
                                    : 'bg-surface-dark border-border'
                                }`}>
                                  <code className={`text-body-sm font-mono ${
                                    msg.role === 'user' ? 'text-white' : 'text-text-primary'
                                  }`}>
                                    {sqlCode.trim()}
                                  </code>
                                </pre>
                              </div>
                              {remaining && (
                                <div>
                                  {formatMessageContent(remaining, msg.role === 'user')}
                                </div>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                      {msg.sqlSuggestions && msg.sqlSuggestions.length > 0 && (
                        <div className="mt-5 space-y-4">
                          <h4 className={`text-lg font-bold mb-3 ${msg.role === 'user' ? 'text-white' : 'text-text-primary'}`}>
                            Executable SQL Suggestions:
                          </h4>
                          {msg.sqlSuggestions.map((sql, idx) => (
                            <div key={idx} className="relative">
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-caption ${msg.role === 'user' ? 'text-white/80' : 'text-text-muted'}`}>
                                  SQL {idx + 1}
                                </span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(sql);
                                    setCopiedSqlIndex(idx + 1000);
                                    setTimeout(() => setCopiedSqlIndex(null), 2000);
                                  }}
                                  className={`text-caption flex items-center gap-1 transition-colors ${
                                    msg.role === 'user'
                                      ? 'text-white hover:text-white/80'
                                      : 'text-primary hover:text-primary/80'
                                  }`}
                                >
                                  <FontAwesomeIcon 
                                    icon={copiedSqlIndex === idx + 1000 ? faCheck : faCopy} 
                                    className="text-xs"
                                  />
                                  {copiedSqlIndex === idx + 1000 ? 'Copied!' : 'Copy'}
                                </button>
                              </div>
                              <pre className={`border rounded p-3 overflow-x-auto ${
                                msg.role === 'user'
                                  ? 'bg-white/10 border-white/20'
                                  : 'bg-surface-dark border-border'
                              }`}>
                                <code className={`text-body-sm font-mono ${
                                  msg.role === 'user' ? 'text-white' : 'text-text-primary'
                                }`}>
                                  {sql}
                                </code>
                              </pre>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.recommendations && msg.recommendations.length > 0 && (
                        <div className="mt-5 space-y-2.5">
                          <h4 className={`text-lg font-bold mb-3 ${msg.role === 'user' ? 'text-white' : 'text-text-primary'}`}>
                            Recommendations:
                          </h4>
                          <ul className={`space-y-2.5 list-none pl-0 ${msg.role === 'user' ? 'text-white' : 'text-text-primary'}`}>
                            {msg.recommendations.map((rec, idx) => (
                              <li key={idx} className="flex items-start">
                                <span className={`mr-3 flex-shrink-0 mt-0.5 text-xl leading-none ${msg.role === 'user' ? 'text-white' : 'text-primary'}`}>•</span>
                                <div className="flex-1 leading-relaxed">
                                  {formatMessageContent(rec, msg.role === 'user')}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    <p className="text-caption text-text-muted mt-1 px-2">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                      <FontAwesomeIcon icon={faUser} className="text-primary text-sm" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-1">
                    <FontAwesomeIcon icon={faRobot} className="text-white text-sm" />
                  </div>
                  <div className="bg-surface-light border border-border rounded-lg rounded-tl-none p-4">
                    <div className="flex gap-2">
                      <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-lg border-t border-border bg-surface">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-center gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                    setMessage(e.target.value);
                  }
                }}
                onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                placeholder="Ask about your schema..."
                maxLength={MAX_MESSAGE_LENGTH}
                className="flex-1 h-11 pl-4 pr-12 bg-surface-light border border-border rounded-lg text-body text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!message.trim() || isLoading}
                isLoading={isLoading}
                icon={faPaperPlane}
                className="absolute right-2"
                size="sm"
              >
                Send
              </Button>
            </div>
            <div className="flex items-center justify-between mt-2">
              {selectedDatabase && (
                <p className="text-caption text-text-muted text-center flex-1">
                  Chatting about: <strong>{selectedDatabase.name}</strong>
                </p>
              )}
              {!selectedDatabase && databases.length === 0 && (
                <p className="text-caption text-text-muted text-center flex-1">
                  No databases available. <a href="/databases" className="text-primary hover:underline">Upload a schema</a> first.
                </p>
              )}
              {message.length > 0 && (
                <p className={`text-caption ml-auto ${
                  message.length > MAX_MESSAGE_LENGTH * 0.9 
                    ? 'text-warning' 
                    : message.length > MAX_MESSAGE_LENGTH * 0.8
                    ? 'text-text-secondary'
                    : 'text-text-muted'
                }`}>
                  {message.length} / {MAX_MESSAGE_LENGTH}
                </p>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>
    </AppLayout>
  );
}
