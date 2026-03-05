import { Router } from 'express';
import {
  createConversationController,
  getConversationController,
  listConversationsController,
  updateConversationTitleController,
  archiveConversationController,
  deleteConversationController,
  deleteConversationsController,
} from '../controllers/conversation.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.get('/', authenticate, listConversationsController);
router.get('/:id', authenticate, getConversationController);
router.post('/', authenticate, createConversationController);
router.patch('/:id/title', authenticate, updateConversationTitleController);
router.patch('/:id/archive', authenticate, archiveConversationController);
router.delete('/:id', authenticate, deleteConversationController);
router.delete('/', authenticate, deleteConversationsController);

export default router;
