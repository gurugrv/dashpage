'use client';

import { useState, useCallback, useRef } from 'react';
import type {
  IntakeQuestion,
  IntakeAnalysis,
  BusinessProfileData,
  PlacesEnrichment,
  CompletenessResult,
} from '@/lib/intake/types';

export type IntakePhase =
  | 'idle'           // Not started
  | 'analyzing'      // AI analyzing prompt
  | 'asking'         // Showing questions to user
  | 'evaluating'     // AI checking if enough data
  | 'confirming'     // Showing BusinessProfileSummary
  | 'complete'       // Done, ready for blueprint generation
  | 'skipped';       // Non-business site, skip intake

export interface UseIntakeOptions {
  provider: string;
  model: string;
}

export function useIntake({ provider, model }: UseIntakeOptions) {
  const [phase, setPhase] = useState<IntakePhase>('idle');
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [businessProfile, setBusinessProfile] = useState<BusinessProfileData | null>(null);
  const [placesEnrichment, setPlacesEnrichment] = useState<PlacesEnrichment | null>(null);
  const [questionsAskedCount, setQuestionsAskedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const originalPromptRef = useRef<string>('');

  // Start intake: POST /api/intake/analyze
  const startIntake = useCallback(async (prompt: string) => {
    setError(null);
    setPhase('analyzing');
    originalPromptRef.current = prompt;

    try {
      const res = await fetch('/api/intake/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, provider, model }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to analyze prompt');
      }

      const analysis: IntakeAnalysis & { placesConfigured?: boolean } = await res.json();

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

      // Pre-fill answers from detected data
      const prefilled: Record<string, string> = {};
      for (const q of analysis.questions) {
        if (q.prefilled) {
          prefilled[q.id] = q.prefilled;
        }
      }
      setAnswers(prefilled);
      setPhase('asking');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setPhase('idle');
    }
  }, [provider, model]);

  // Handle answer submission for a question
  const submitAnswer = useCallback((questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  // Handle address selection with Places enrichment
  const submitAddressAnswer = useCallback((questionId: string, address: string, enrichment: PlacesEnrichment) => {
    setAnswers((prev) => ({ ...prev, [questionId]: address }));
    setPlacesEnrichment(enrichment);
  }, []);

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
      const res = await fetch('/api/intake/evaluate', {
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
        // Append follow-up questions
        const followUps: IntakeQuestion[] = result.followUpQuestions.map((q) => ({
          ...q,
          type: q.type as IntakeQuestion['type'],
        }));
        setQuestions((prev) => [...prev, ...followUps]);
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
    setError(null);
    originalPromptRef.current = '';
  }, []);

  // Check if all current questions are answered
  const allCurrentQuestionsAnswered = questions.length > 0 &&
    questions.every((q) => !q.required || answers[q.id]?.trim());

  return {
    phase,
    questions,
    answers,
    businessProfile,
    error,
    allCurrentQuestionsAnswered,
    startIntake,
    submitAnswer,
    submitAddressAnswer,
    evaluateAndContinue,
    confirmProfile,
    selectExistingProfile,
    reset,
  };
}
