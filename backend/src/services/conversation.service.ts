import prisma from '../config/database';
import { logger } from '../utils/logger';

export interface CreateConversationInput {
  userId: string;
  title?: string;
  databaseName?: string;
}

export interface CreateMessageInput {
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  sqlSuggestions?: string[];
  recommendations?: string[];
}

export interface ConversationWithMessages {
  id: string;
  userId: string;
  title: string;
  preview: string | null;
  databaseName: string | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{
    id: string;
    role: 'USER' | 'ASSISTANT';
    content: string;
    sqlSuggestions: string[];
    recommendations: string[];
    createdAt: Date;
  }>;
}

/**
 * Generate a title for a conversation based on the first user message
 */
async function generateConversationTitle(firstMessage: string): Promise<string> {
  try {
    const title = firstMessage.length > 60 
      ? firstMessage.substring(0, 57) + '...' 
      : firstMessage;
    
    return title;
  } catch (error) {
    logger.warn('Failed to generate conversation title, using fallback', {
      error: error instanceof Error ? error.message : String(error),
    });
    return firstMessage.length > 60 
      ? firstMessage.substring(0, 57) + '...' 
      : firstMessage;
  }
}

/**
 * Create a new conversation
 */
export async function createConversation(input: CreateConversationInput): Promise<ConversationWithMessages> {
  try {
    const conversation = await prisma.conversation.create({
      data: {
        userId: input.userId,
        title: input.title || 'New Conversation',
        preview: null,
        databaseName: input.databaseName || null,
        archived: false,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    logger.info('Conversation created', { conversationId: conversation.id, userId: input.userId });
    return conversation as ConversationWithMessages;
  } catch (error) {
    logger.error('Failed to create conversation', {
      error: error instanceof Error ? error.message : String(error),
      input,
    });
    throw error;
  }
}

/**
 * Get a conversation by ID
 */
export async function getConversationById(
  conversationId: string,
  userId: string
): Promise<ConversationWithMessages | null> {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        userId: userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return conversation as ConversationWithMessages | null;
  } catch (error) {
    logger.error('Failed to get conversation', {
      error: error instanceof Error ? error.message : String(error),
      conversationId,
      userId,
    });
    throw error;
  }
}

/**
 * Get all conversations for a user with optional filters
 */
export async function getConversations(
  userId: string,
  options?: {
    archived?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ conversations: ConversationWithMessages[]; total: number }> {
  try {
    const where: any = {
      userId: userId,
    };

    if (options?.archived !== undefined) {
      where.archived = options.archived;
    }

    if (options?.search) {
      where.OR = [
        { title: { contains: options.search, mode: 'insensitive' } },
        { preview: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 1, // Only get first message for preview
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      prisma.conversation.count({ where }),
    ]);

    return {
      conversations: conversations as ConversationWithMessages[],
      total,
    };
  } catch (error) {
    logger.error('Failed to get conversations', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      options,
    });
    throw error;
  }
}

/**
 * Add a message to a conversation
 */
export async function addMessageToConversation(input: CreateMessageInput): Promise<void> {
  try {
    await prisma.message.create({
      data: {
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        sqlSuggestions: input.sqlSuggestions || [],
        recommendations: input.recommendations || [],
      },
    });

    // Update conversation preview and title if this is the first message
    if (input.role === 'USER') {
      const conversation = await prisma.conversation.findUnique({
        where: { id: input.conversationId },
        include: { messages: true },
      });

      if (conversation) {
        const updateData: any = {
          updatedAt: new Date(),
        };

        // Generate title from first user message if not set
        if (!conversation.title || conversation.title === 'New Conversation') {
          const firstUserMessage = conversation.messages.find(m => m.role === 'USER');
          if (firstUserMessage) {
            updateData.title = await generateConversationTitle(firstUserMessage.content);
          }
        }

        // Update preview (first 150 chars of last message)
        const preview = input.content.length > 150 
          ? input.content.substring(0, 147) + '...' 
          : input.content;
        updateData.preview = preview;

        await prisma.conversation.update({
          where: { id: input.conversationId },
          data: updateData,
        });
      }
    }

    logger.info('Message added to conversation', {
      conversationId: input.conversationId,
      role: input.role,
    });
  } catch (error) {
    logger.error('Failed to add message to conversation', {
      error: error instanceof Error ? error.message : String(error),
      input,
    });
    throw error;
  }
}

/**
 * Update conversation title
 */
export async function updateConversationTitle(
  conversationId: string,
  userId: string,
  title: string
): Promise<void> {
  try {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        userId: userId,
      },
      data: {
        title: title,
      },
    });

    logger.info('Conversation title updated', { conversationId, userId, title });
  } catch (error) {
    logger.error('Failed to update conversation title', {
      error: error instanceof Error ? error.message : String(error),
      conversationId,
      userId,
      title,
    });
    throw error;
  }
}

/**
 * Archive or unarchive a conversation
 */
export async function archiveConversation(
  conversationId: string,
  userId: string,
  archived: boolean
): Promise<void> {
  try {
    await prisma.conversation.updateMany({
      where: {
        id: conversationId,
        userId: userId,
      },
      data: {
        archived: archived,
      },
    });

    logger.info('Conversation archive status updated', {
      conversationId,
      userId,
      archived,
    });
  } catch (error) {
    logger.error('Failed to archive conversation', {
      error: error instanceof Error ? error.message : String(error),
      conversationId,
      userId,
      archived,
    });
    throw error;
  }
}

/**
 * Delete a conversation
 */
export async function deleteConversation(
  conversationId: string,
  userId: string
): Promise<void> {
  try {
    // Messages will be deleted automatically due to cascade
    await prisma.conversation.deleteMany({
      where: {
        id: conversationId,
        userId: userId,
      },
    });

    logger.info('Conversation deleted', { conversationId, userId });
  } catch (error) {
    logger.error('Failed to delete conversation', {
      error: error instanceof Error ? error.message : String(error),
      conversationId,
      userId,
    });
    throw error;
  }
}

/**
 * Delete multiple conversations
 */
export async function deleteConversations(
  conversationIds: string[],
  userId: string
): Promise<void> {
  try {
    await prisma.conversation.deleteMany({
      where: {
        id: { in: conversationIds },
        userId: userId,
      },
    });

    logger.info('Conversations deleted', { conversationIds, userId });
  } catch (error) {
    logger.error('Failed to delete conversations', {
      error: error instanceof Error ? error.message : String(error),
      conversationIds,
      userId,
    });
    throw error;
  }
}
