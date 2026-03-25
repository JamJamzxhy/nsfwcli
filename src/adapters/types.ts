/**
 * Search adapter interface — every site adapter implements this.
 * Community contributors add new sites by implementing SearchAdapter.
 *
 *   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
 *   │  SpankBang   │    │  Xvideos    │    │  Pornhub    │
 *   │  Adapter     │    │  Adapter    │    │  Adapter    │
 *   └──────┬───────┘    └──────┬──────┘    └──────┬──────┘
 *          │                   │                   │
 *          └───────────┬───────┴───────────────────┘
 *                      ▼
 *              SearchAdapter interface
 */

export interface StructuredQuery {
  actress?: string;
  tags?: string[];
  actions?: string[];
  code?: string;
  sort?: "relevance" | "date" | "views";
  query_raw?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  duration?: string;
  duration_seconds?: number;
  tags?: string[];
  actress?: string;
  code?: string;
  thumbnail?: string;
  source: string;
  video_direct_url?: string;
  studio?: string;
  release_date?: string;
}

export interface SearchAdapter {
  name: string;
  search(query: StructuredQuery): Promise<SearchResult[]>;
  extractVideoUrl?(pageUrl: string): Promise<string | null>;
  isAvailable(): Promise<boolean>;
}
