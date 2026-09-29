// Policy retrieval: BM25-style keyword search (MiniSearch) over the knowledge-base chunks.
// Superseded chunks (the 2023 late-payment rules in penalties.docx) are never indexed, so
// the assistant cannot quote them. See ARCHITECTURE.md §6.

import MiniSearch from "minisearch";
import type { KbChunk } from "./contract";

export interface RetrievedChunk {
  chunk: KbChunk;
  score: number;
}

export function buildIndex(chunks: KbChunk[]) {
  const current = chunks.filter((chunk) => !chunk.superseded);
  const index = new MiniSearch<KbChunk>({
    idField: "chunk_id",
    fields: ["title", "section", "text"],
    storeFields: ["chunk_id"],
    searchOptions: { boost: { section: 2, title: 1.5 }, fuzzy: 0.2, prefix: true },
  });
  index.addAll(current);
  const byId = new Map(current.map((chunk) => [chunk.chunk_id, chunk]));

  return {
    search(query: string, limit = 4): RetrievedChunk[] {
      return index
        .search(query, { combineWith: "OR" })
        .slice(0, limit)
        .map((hit) => ({ chunk: byId.get(String(hit.id))!, score: hit.score }));
    },
  };
}
