export interface EditOperation {
  search: string;
  replace: string;
}

export interface EditParseResult {
  operations: EditOperation[];
  explanation: string;
  isComplete: boolean;
  hasEditTag: boolean;
  targetFile: string;
}

export interface ApplyResult {
  success: boolean;
  html: string;
  failedIndex?: number;
}
