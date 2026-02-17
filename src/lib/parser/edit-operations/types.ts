// --- Search/Replace Types ---

export interface EditOperation {
  search: string;
  replace: string;
  expectedReplacements?: number;
}

export type MatchTier = 'exact' | 'whitespace' | 'token' | 'fuzzy';

export interface BestMatch {
  text: string;
  /** Surrounding lines from the file for retry context */
  surrounding?: string;
  similarity: number;
  line: number;
}

export interface ApplySuccess {
  success: true;
  html: string;
  matchTiers: MatchTier[];
}

export interface FailedOperation {
  index: number;
  error: string;
  bestMatch: BestMatch | null;
}

export interface ApplyPartial {
  success: 'partial';
  html: string;
  appliedCount: number;
  failedCount: number;
  failedOperations: FailedOperation[];
  error: string;
  bestMatch: BestMatch | null;
  matchTiers: MatchTier[];
}

export interface ApplyFailure {
  success: false;
  html: string;
  error: string;
  bestMatch: BestMatch | null;
}

export type ApplyResult = ApplySuccess | ApplyPartial | ApplyFailure;

// --- DOM Operation Types ---

export type DomAction =
  | 'setAttribute'
  | 'setText'
  | 'setHTML'
  | 'addClass'
  | 'removeClass'
  | 'replaceClass'
  | 'remove'
  | 'insertAdjacentHTML';

export type InsertPosition = 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';

export interface DomOperation {
  selector: string;
  action: DomAction;
  attr?: string;
  value?: string;
  oldClass?: string;
  newClass?: string;
  position?: InsertPosition;
}

export interface DomOpSuccess {
  index: number;
  success: true;
}

export interface DomOpFailure {
  index: number;
  success: false;
  error: string;
}

export type DomOpResult = DomOpSuccess | DomOpFailure;

// --- Legacy (keep for backward compat until removed) ---

export interface EditParseResult {
  operations: EditOperation[];
  explanation: string;
  isComplete: boolean;
  hasEditTag: boolean;
  targetFile: string;
}
