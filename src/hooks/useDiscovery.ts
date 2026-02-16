'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  DiscoveryQuestion,
  DiscoveryAnalysis,
  BusinessProfileData,
  PlacesEnrichment,
  CompletenessResult,
} from '@/lib/discovery/types';

export type DiscoveryPhase =
  | 'idle'           // Not started
  | 'picking'        // Showing existing profiles to choose from
  | 'analyzing'      // AI analyzing prompt
  | 'asking'         // Showing questions to user
  | 'evaluating'     // AI checking if enough data
  | 'confirming'     // Showing BusinessProfileSummary
  | 'complete'       // Done, ready for blueprint generation
  | 'skipped';       // Non-business site, skip discovery

export interface UseDiscoveryOptions {
  provider: string;
  model: string;
}

export function useDiscovery({ provider, model }: UseDiscoveryOptions) {
  const [phase, setPhase] = useState<DiscoveryPhase>('idle');
  const [questions, setQuestions] = useState<DiscoveryQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileData | null>(null);
  const [placesEnrichment, setPlacesEnrichment] = useState<PlacesEnrichment | null>(null);
  const [questionsAskedCount, setQuestionsAskedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [existingProfiles, setExistingProfiles] = useState<(BusinessProfileData & { id?: string })[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const originalPromptRef = useRef<string>('');

  // Proceed with AI analysis (called after picker or when no existing profiles)
  const runAnalysis = useCallback(async (prompt: string) => {
    setPhase('analyzing');

    try {
      const res = await fetch('/api/discovery/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider, model }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to analyze prompt');
      }

      const analysis: DiscoveryAnalysis & { placesConfigured?: boolean } = await res.json();

      if (!analysis.isBusinessSite) {
        setPhase('skipped');
        return;
      }

      if (analysis.questions.length === 0) {
        // Business site but no questions generated — skip
        setPhase('skipped');
        return;
      }

      setQuestions(analysis.questions);
      setQuestionsAskedCount(analysis.questions.length);
      setCurrentQuestionIndex(0);
      setAnswers({});
      setPhase('asking');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('idle');
    }
  }, [provider, model]);

  // Start discovery: analyze prompt for business questions
  const startDiscovery = useCallback(async (prompt: string) => {
    setError(null);
    originalPromptRef.current = prompt;
    await runAnalysis(prompt);
  }, [runAnalysis]);

  // Called when user selects "Create new" from the picker
  const skipPickerAndAnalyze = useCallback(async () => {
    await runAnalysis(originalPromptRef.current);
  }, [runAnalysis]);

  // Advance to next question (called after answer)
  const advanceQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => prev + 1);
  }, []);

  // Handle answer submission for a question
  const submitAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    advanceQuestion();
  }, [advanceQuestion]);

  // Handle address selection with Places enrichment
  const submitAddressAnswer = useCallback((questionId: string, address: string, enrichment: PlacesEnrichment) => {
    setAnswers((prev) => ({ ...prev, [questionId]: address }));
    setPlacesEnrichment(enrichment);
    advanceQuestion();
  }, [advanceQuestion]);

  // Build BusinessProfileData from answers + enrichment
  const buildProfileFromAnswers = useCallback((): BusinessProfileData => {
    const profile: BusinessProfileData = {
      name: answers.business_name ?? answers.name ?? '',
    };

    if (answers.phone) profile.phone = answers.phone;
    if (answers.email) profile.email = answers.email;
    if (answers.website) profile.website = answers.website;
    if (answers.address) profile.address = answers.address;
    if (answers.hours) profile.additionalInfo = (profile.additionalInfo ?? '') + `\nHours: ${answers.hours}`;
    if (answers.services) profile.services = answers.services.split(',').map((s) => s.trim()).filter(Boolean);
    if (answers.description) profile.additionalInfo = (profile.additionalInfo ?? '') + `\n${answers.description}`;

    // Merge enrichment data
    if (placesEnrichment) {
      if (!profile.address) profile.address = placesEnrichment.formattedAddress;
      profile.lat = placesEnrichment.lat;
      profile.lng = placesEnrichment.lng;
      profile.googleMapsUri = placesEnrichment.googleMapsUri;
      if (placesEnrichment.primaryType) profile.category = placesEnrichment.primaryType;
    }

    // Collect remaining answers as additionalInfo
    const knownKeys = new Set(['business_name', 'name', 'phone', 'email', 'website', 'address', 'hours', 'services', 'description']);
    const extras = Object.entries(answers)
      .filter(([k, v]) => !knownKeys.has(k) && v)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join('\n');
    if (extras) {
      profile.additionalInfo = ((profile.additionalInfo ?? '') + '\n' + extras).trim();
    }

    return profile;
  }, [answers, placesEnrichment]);

  // After all current questions answered, evaluate completeness
  const evaluateAndContinue = useCallback(async () => {
    setPhase('evaluating');
    const profile = buildProfileFromAnswers();

    try {
      const res = await fetch('/api/discovery/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: originalPromptRef.current,
          provider,
          model,
          collectedData: profile,
          questionsAskedSoFar: questionsAskedCount,
        }),
      });

      if (!res.ok) {
        // Fail-open: proceed with what we have
        setBusinessProfile(profile);
        setPhase('confirming');
        return;
      }

      const result: CompletenessResult = await res.json();

      if (result.ready || !result.followUpQuestions?.length) {
        setBusinessProfile(profile);
        setPhase('confirming');
      } else {
        // Append follow-up questions and show the first new one
        const followUps: DiscoveryQuestion[] = result.followUpQuestions.map((q) => ({
          ...q,
          type: q.type as DiscoveryQuestion['type'],
        }));
        setQuestions((prev) => {
          // currentQuestionIndex should point to the first new question
          setCurrentQuestionIndex(prev.length);
          return [...prev, ...followUps];
        });
        setQuestionsAskedCount((prev) => prev + followUps.length);
        setPhase('asking');
      }
    } catch {
      // Fail-open
      setBusinessProfile(profile);
      setPhase('confirming');
    }
  }, [buildProfileFromAnswers, provider, model, questionsAskedCount]);

  // Confirm profile and save to DB
  const confirmProfile = useCallback(async (
    conversationId: string,
    editedProfile?: BusinessProfileData,
  ) => {
    const profileToSave = editedProfile ?? businessProfile ?? buildProfileFromAnswers();

    try {
      // Create business profile
      const createRes = await fetch('/api/business-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileToSave),
      });

      if (!createRes.ok) throw new Error('Failed to save profile');

      const saved = await createRes.json();

      // Link to conversation
      await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessProfileId: saved.id }),
      });

      setBusinessProfile(profileToSave);
      setPhase('complete');
    } catch {
      // Even if DB save fails, proceed with generation
      setBusinessProfile(profileToSave);
      setPhase('complete');
    }
  }, [businessProfile, buildProfileFromAnswers]);

  // Select an existing profile (for returning users)
  const selectExistingProfile = useCallback((profile: BusinessProfileData, conversationId: string) => {
    setBusinessProfile(profile);
    // Link to conversation if the profile has an id
    const profileWithId = profile as BusinessProfileData & { id?: string };
    if (profileWithId.id && conversationId) {
      fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessProfileId: profileWithId.id }),
      }).catch(() => {});
    }
    setPhase('complete');
  }, []);

  // Reset
  const reset = useCallback(() => {
    setPhase('idle');
    setQuestions([]);
    setAnswers({});
    setBusinessProfile(null);
    setPlacesEnrichment(null);
    setQuestionsAskedCount(0);
    setCurrentQuestionIndex(0);
    setError(null);
    originalPromptRef.current = '';
  }, []);

  // Check if all current questions are answered (index past the last question)
  const allCurrentQuestionsAnswered = questions.length > 0 &&
    currentQuestionIndex >= questions.length;

  // Visible questions: all answered + current active one
  const visibleQuestions = questions.slice(0, currentQuestionIndex + 1);

  // Also reset existing profiles
  const resetFull = useCallback(() => {
    reset();
    setExistingProfiles([]);
  }, [reset]);

  return {
    phase,
    questions,
    visibleQuestions,
    answers,
    businessProfile,
    existingProfiles,
    error,
    allCurrentQuestionsAnswered,
    startDiscovery,
    skipPickerAndAnalyze,
    submitAnswer,
    submitAddressAnswer,
    evaluateAndContinue,
    confirmProfile,
    selectExistingProfile,
    reset: resetFull,
  };
}
