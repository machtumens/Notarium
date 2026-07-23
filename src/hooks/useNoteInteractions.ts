import { useState } from 'react';
import api from '../lib/api';

interface UseNoteInteractionsProps {
  noteId: number;
  initialLiked: boolean;
  initialLikeCount: number;
}

export const useNoteInteractions = ({
  noteId,
  initialLiked,
  initialLikeCount,
}: UseNoteInteractionsProps) => {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [comments, setComments] = useState<any[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  const handleLike = async (onLikeCallback?: (noteId: number) => void) => {
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikeCount((prev) => (newLikedState ? prev + 1 : prev - 1));
    onLikeCallback?.(noteId);
  };

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const response = await api.request(`/api/notes/${noteId}/comments`, {
        method: 'GET',
      });

      if (response.success && Array.isArray(response.comments)) {
        setComments(response.comments);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setIsLoadingComments(false);
    }
  };

  const addComment = async (comment: string) => {
    try {
      const response = await api.request(`/api/notes/${noteId}/comments`, {
        method: 'POST',
        body: { text: comment },
      });

      if (response.success) {
        setComments((prev) => [...prev, response.comment]);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error adding comment:', error);
      return false;
    }
  };

  return {
    isLiked,
    likeCount,
    comments,
    isLoadingComments,
    handleLike,
    loadComments,
    addComment,
  };
};
