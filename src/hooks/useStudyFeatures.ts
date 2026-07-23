import { useState } from 'react';
import api from '../lib/api';

interface StudyFeatureRequest {
  title: string;
  description: string;
  content?: string;
}

interface UseStudyFeaturesProps {
  noteId: number;
}

export interface SummaryResponse {
  success: boolean;
  summary?: string;
  error?: string;
}

export interface QuizResponse {
  success: boolean;
  quiz?: any;
  error?: string;
}

export interface ConceptsResponse {
  success: boolean;
  concepts?: string[];
  error?: string;
}

export interface StudyPlanResponse {
  success: boolean;
  plan?: any;
  error?: string;
}

export const useStudyFeatures = ({ noteId }: UseStudyFeaturesProps) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const [quiz, setQuiz] = useState<any | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

  const [concepts, setConcepts] = useState<string[] | null>(null);
  const [isGeneratingConcepts, setIsGeneratingConcepts] = useState(false);

  const [studyPlan, setStudyPlan] = useState<any | null>(null);
  const [isGeneratingStudyPlan, setIsGeneratingStudyPlan] = useState(false);

  const generateSummary = async (data: StudyFeatureRequest): Promise<string | null> => {
    setIsGeneratingSummary(true);
    try {
      const response: SummaryResponse = await api.request('/api/gemini/summarize', {
        method: 'POST',
        body: {
          title: data.title,
          description: data.description,
          content: data.content,
        },
      });

      if (response.success && response.summary) {
        setSummary(response.summary);
        return response.summary;
      } else {
        const errorMsg = 'Failed to generate summary. Please try again.';
        setSummary(errorMsg);
        return null;
      }
    } catch (error) {
      console.error('Summary error:', error);
      const errorMsg = 'Error generating summary';
      setSummary(errorMsg);
      return null;
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const generateQuiz = async (data: StudyFeatureRequest): Promise<any | null> => {
    setIsGeneratingQuiz(true);
    try {
      const response: QuizResponse = await api.request('/api/gemini/quiz', {
        method: 'POST',
        body: {
          title: data.title,
          description: data.description,
          content: data.content,
        },
      });

      if (response.success && response.quiz) {
        setQuiz(response.quiz);
        return response.quiz;
      }
      return null;
    } catch (error) {
      console.error('Quiz generation error:', error);
      return null;
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const generateConcepts = async (data: StudyFeatureRequest): Promise<string[] | null> => {
    setIsGeneratingConcepts(true);
    try {
      const response: ConceptsResponse = await api.request('/api/gemini/concepts', {
        method: 'POST',
        body: {
          title: data.title,
          description: data.description,
          content: data.content,
        },
      });

      if (response.success && Array.isArray(response.concepts)) {
        setConcepts(response.concepts);
        return response.concepts;
      }
      return null;
    } catch (error) {
      console.error('Concepts generation error:', error);
      return null;
    } finally {
      setIsGeneratingConcepts(false);
    }
  };

  const generateStudyPlan = async (data: StudyFeatureRequest): Promise<any | null> => {
    setIsGeneratingStudyPlan(true);
    try {
      const response: StudyPlanResponse = await api.request('/api/gemini/study-plan', {
        method: 'POST',
        body: {
          title: data.title,
          description: data.description,
          content: data.content,
        },
      });

      if (response.success && response.plan) {
        setStudyPlan(response.plan);
        return response.plan;
      }
      return null;
    } catch (error) {
      console.error('Study plan generation error:', error);
      return null;
    } finally {
      setIsGeneratingStudyPlan(false);
    }
  };

  const clearSummary = () => setSummary(null);
  const clearQuiz = () => setQuiz(null);
  const clearConcepts = () => setConcepts(null);
  const clearStudyPlan = () => setStudyPlan(null);

  return {
    summary,
    isGeneratingSummary,
    generateSummary,
    clearSummary,
    quiz,
    isGeneratingQuiz,
    generateQuiz,
    clearQuiz,
    concepts,
    isGeneratingConcepts,
    generateConcepts,
    clearConcepts,
    studyPlan,
    isGeneratingStudyPlan,
    generateStudyPlan,
    clearStudyPlan,
  };
};
