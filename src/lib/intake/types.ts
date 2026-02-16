import { z } from 'zod';

// What the AI returns when analyzing a prompt
export const intakeAnalysisSchema = z.object({
  isBusinessSite: z.boolean(),
  detectedName: z.string().nullable(),
  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    type: z.enum(['text', 'phone', 'email', 'address_autocomplete', 'select', 'textarea']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
    prefilled: z.string().optional(),
  })),
});

export type IntakeAnalysis = z.infer<typeof intakeAnalysisSchema>;

export interface IntakeQuestion {
  id: string;
  question: string;
  type: 'text' | 'phone' | 'email' | 'address_autocomplete' | 'select' | 'textarea';
  required: boolean;
  options?: string[];
  prefilled?: string;
}

// What the completeness evaluator returns
export const completenessResultSchema = z.object({
  ready: z.boolean(),
  followUpQuestions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    type: z.enum(['text', 'phone', 'email', 'select', 'textarea']),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
  })).optional(),
});

export type CompletenessResult = z.infer<typeof completenessResultSchema>;

// Google Places enrichment data
export interface PlacesEnrichment {
  formattedAddress: string;
  lat: number;
  lng: number;
  types: string[];
  primaryType: string;
  displayName: string;
  googleMapsUri: string;
}

// Collected business data (superset - what gets saved to DB)
export interface BusinessProfileData {
  name: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  category?: string;
  categories?: string[];
  hours?: Record<string, string>;
  services?: string[];
  socialMedia?: Record<string, string>;
  additionalInfo?: string;
  googleMapsUri?: string;
}
