// Stub for core/indexing/refreshIndex
// These functions are used by AutocompleteLruCache for refreshing codebase index
// In standalone mode, we don't need actual indexing

export function refreshIndexForFile(filepath: string) {
  // no-op
}

export function getFileLastModified(filepath: string): number {
  return 0;
}

export function markFileAsIndexed(filepath: string) {
  // no-op
}
