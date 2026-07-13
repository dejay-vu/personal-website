export function findBlockedPaths(paths: string[]): string[];
export function parsePublicDocsAllowlist(source: string): string[];
export function comparePublicDocs(
  paths: string[],
  allowedDocs: string[],
): string[];
export function findAgentNoteMarkers(
  markdownFiles: Array<[path: string, content: string]>,
): string[];
export function checkPublicTree(options?: { tree?: string | null }): {
  pathCount: number;
  tree: string;
};
