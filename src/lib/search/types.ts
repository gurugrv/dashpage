export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'brave' | 'tavily';
}

export interface SearchResponse {
  success: true;
  results: SearchResult[];
  source: 'brave' | 'tavily';
}

export interface SearchError {
  success: false;
  error: string;
}

export type SearchOutcome = SearchResponse | SearchError;
