import { Response } from 'express';
import {
  createConversation,
  getConversationById,
  getConversations,
  updateConversationTitle,
  archiveConversation,
  deleteConversation,
  deleteConversations,
} from '../services/conversation.service';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { logger } from '../utils/logger';

export const createConversationController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { title, databaseName } = req.body;

    const conversation = await createConversation({
      userId,
      title,
      databaseName,
    });

    res.json({
      status: 'success',
      data: conversation,
    });
  } catch (error) {
    logger.error('Error in createConversationController', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      `Failed to create conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
};

export const getConversationController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { id } = req.params;

    const conversation = await getConversationById(id, userId);

    if (!conversation) {
      throw new AppError('Conversation not found', 404);
    }

    res.json({
      status: 'success',
      data: conversation,
    });
  } catch (error) {
    logger.error('Error in getConversationController', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      `Failed to get conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
};

export const listConversationsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const {
      archived,
      search,
      limit,
      offset,
    } = req.query;

    const conversations = await getConversations(userId, {
      archived: archived === 'true' ? true : archived === 'false' ? false : undefined,
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      status: 'success',
      data: conversations,
    });
  } catch (error) {
    logger.error('Error in listConversationsController', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      `Failed to list conversations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
};

export const updateConversationTitleController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { id } = req.params;
    const { title } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new AppError('Title is required', 400);
    }

    if (title.length > 200) {
      throw new AppError('Title is too long. Maximum length is 200 characters', 400);
    }

    await updateConversationTitle(id, userId, title.trim());

    res.json({
      status: 'success',
      message: 'Conversation title updated',
    });
  } catch (error) {
    logger.error('Error in updateConversationTitleController', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      `Failed to update conversation title: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
};

export const archiveConversationController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { id } = req.params;
    const { archived } = req.body;

    if (typeof archived !== 'boolean') {
      throw new AppError('Archived must be a boolean', 400);
    }

    await archiveConversation(id, userId, archived);

    res.json({
      status: 'success',
      message: archived ? 'Conversation archived' : 'Conversation unarchived',
    });
  } catch (error) {
    logger.error('Error in archiveConversationController', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      `Failed to archive conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
};

export const deleteConversationController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { id } = req.params;

    await deleteConversation(id, userId);

    res.json({
      status: 'success',
      message: 'Conversation deleted',
    });
  } catch (error) {
    logger.error('Error in deleteConversationController', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      `Failed to delete conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
};

export const deleteConversationsController = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    const { conversationIds } = req.body;

    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      throw new AppError('conversationIds must be a non-empty array', 400);
    }

    await deleteConversations(conversationIds, userId);

    res.json({
      status: 'success',
      message: 'Conversations deleted',
    });
  } catch (error) {
    logger.error('Error in deleteConversationsController', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      `Failed to delete conversations: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
};
