// src/git/extractor.ts
// Phase 1 — Signal extraction module (pure functions, no I/O, no ML calls)
// DO NOT modify scoring weights or ML pipeline (Phase 2 work).

// ─── Conventional commit types ────────────────────────────────────

// Based on https://www.conventionalcommits.org/en/v1.0.0/
// Regex: type(scope)!: subject  — case-insensitive, scope optional, ! optional
const CONV_COMMIT_RE = /^(\w+)(?:\(([^)]+)\))?!?:\s+(.+)/i;

// All recognized conventional commit types (per conventionalcommits.org + common extensions)
const KNOWN_CONVENTIONAL_TYPES = new Set([
  "feat", "fix", "chore", "ci", "docs", "refactor", "test",
  "perf", "build", "style", "revert",
]);

// Commit types that suppress ML inference entirely (SIG-03)
const SUPPRESSED_TYPES = new Set(["chore", "ci", "docs"]);

// ─── Informal keyword dictionaries ───────────────────────────────

// Non-feature keywords: when found WITHOUT a conventional type, suppress ML
export const INFORMAL_SUPPRESS_KEYWORDS = [
  "TODO", "TO INVESTIGATE", "WIP", "Cleanup",
] as const;

// Feature keywords: presence does NOT suppress (commit is likely feature work)
export const INFORMAL_FEATURE_KEYWORDS = [
  "Implemented", "Added", "Fixed", "Updated", "Removed", "Refactored", "Refactor",
  "TOFIX", "TO FIX", "FIX", "Implement", "Remaining",
  "Investigation", "Investigate",
] as const;

// Combined lookup structures for fast matching
// Keys are uppercase for case-insensitive matching
const SUPPRESS_KW_UPPER = new Map<string, string>(
  [...INFORMAL_SUPPRESS_KEYWORDS].map((kw) => [kw.toUpperCase(), kw])
);
const FEATURE_KW_UPPER = new Map<string, string>(
  [...INFORMAL_FEATURE_KEYWORDS].map((kw) => [kw.toUpperCase(), kw])
);

// ─── Interfaces ───────────────────────────────────────────────────

export interface ParsedConventionalCommit {
  type: string | null;         // normalized to lowercase: "feat" | "fix" | "chore" | ...
  scope: string | null;        // e.g. "auth" from "feat(auth): ..."
  subject: string | null;      // text after the colon
  isSuppressedType: boolean;   // true if type is in SUPPRESSED_TYPES
}

/** Top-level signal bag — grows in Plans 02 and 03 */
export interface CommitSignals {
  conventionalType: string | null;
  conventionalScope: string | null;
  informalKeyword: string | null;
  isSuppressed: boolean;
  referencedStoryIds: string[];    // added Plan 02
  pathTokens: string[];            // added Plan 02
  cleanEmbedText: string;          // added Plan 03
}

// ─── SIG-01: Conventional commit parser ──────────────────────────

export function parseConventionalCommit(message: string): ParsedConventionalCommit {
  const match = message.match(CONV_COMMIT_RE);
  if (!match) {
    return { type: null, scope: null, subject: null, isSuppressedType: false };
  }
  const type = match[1].toLowerCase();
  // Only treat as a conventional commit if the type is a known conventional keyword.
  // "WIP:", "Cleanup:", etc. match the regex syntactically but are not conventional types.
  if (!KNOWN_CONVENTIONAL_TYPES.has(type)) {
    return { type: null, scope: null, subject: null, isSuppressedType: false };
  }
  return {
    type,
    scope: match[2] ?? null,
    subject: match[3],
    isSuppressedType: SUPPRESSED_TYPES.has(type),
  };
}

// ─── SIG-02: Informal keyword extractor ──────────────────────────
//
// Returns the first matching keyword (canonical casing), or null.
// Checks suppress keywords first (matches both suppress and feature sets).
// Case-insensitive matching — normalizes against uppercase map.

export function extractInformalKeyword(message: string): string | null {
  const upper = message.toUpperCase();

  // Check multi-word suppress keywords first (e.g. "TO FIX" before "TO")
  for (const [kwUpper, kwCanonical] of SUPPRESS_KW_UPPER) {
    if (upper.includes(kwUpper)) return kwCanonical;
  }

  // Check feature keywords
  for (const [kwUpper, kwCanonical] of FEATURE_KW_UPPER) {
    if (upper.includes(kwUpper)) return kwCanonical;
  }

  return null;
}

// ─── SIG-03: Suppression gate ─────────────────────────────────────
//
// Returns true if this commit should be suppressed (skip ML inference, return "no match").
//
// Suppression rules:
//   1. Conventional type is in SUPPRESSED_TYPES (chore, ci, docs)
//   2. No conventional type AND an informal suppress keyword is present
//      (e.g. "WIP: half done", "TODO fix later")
//
// NOT suppressed:
//   - feat/fix/refactor/test/perf type commits (even with informal keywords)
//   - Commits with feature informal keywords and no conventional type (e.g. "Implemented X")

export function isSuppressedCommit(message: string, _body: string): boolean {
  const parsed = parseConventionalCommit(message);

  // Rule 1: Type-based suppression
  if (parsed.isSuppressedType) return true;

  // Rule 2: No conventional type + suppress keyword present
  if (parsed.type === null) {
    const keyword = extractInformalKeyword(message);
    if (keyword !== null) {
      // Only suppress if the matched keyword is in the suppress list (not feature list)
      const isSuppress = INFORMAL_SUPPRESS_KEYWORDS.includes(keyword as typeof INFORMAL_SUPPRESS_KEYWORDS[number]);
      if (isSuppress) return true;
    }
  }

  return false;
}

// ─── Composite signal extractor ───────────────────────────────────
//
// Plans 02 and 03 will extend this function's return value.
// Currently provides SIG-01, SIG-02, SIG-03 signals only.

export function extractCommitSignals(
  message: string,
  body: string,
  knownStoryIds: Set<string>
): CommitSignals {
  const parsed = parseConventionalCommit(message);
  const informalKeyword = extractInformalKeyword(message);
  const suppressed = isSuppressedCommit(message, body);

  return {
    conventionalType: parsed.type,
    conventionalScope: parsed.scope,
    informalKeyword,
    isSuppressed: suppressed,
    referencedStoryIds: extractStoryIdReferences(`${message} ${body}`, knownStoryIds),
    pathTokens: extractPathTokens(`${message} ${body}`),
    cleanEmbedText: buildCleanEmbedText(message, body, []),
  };
}

// ─── SIG-04: Broadened story ID extraction ───────────────────────
//
// Matches: #5, US-3, STORY-3.2, story 3, 3.2 (plain decimal)
// All candidates verified against knownStoryIds to prevent false positives
// (e.g. version numbers like v1.2 are excluded unless 1.2 is an actual story ID)

const STORY_ID_PATTERNS: RegExp[] = [
  /\bSTORY-(\d+(?:\.\d+)*)\b/gi,     // STORY-3.2  or  story-3.2
  /\bUS-(\d+(?:\.\d+)*)\b/gi,         // US-3
  /#(\d+(?:\.\d+)*)\b/g,              // #5  or  #3.2
  /\bstory\s+(\d+(?:\.\d+)*)\b/gi,   // story 3  or  story 3.2
  /\b(\d+\.\d+)\b/g,                  // 3.2 — plain decimal; filtered by knownStoryIds
];

export function extractStoryIdReferences(
  text: string,
  knownStoryIds: Set<string>
): string[] {
  const found = new Set<string>();
  for (const pattern of STORY_ID_PATTERNS) {
    pattern.lastIndex = 0; // reset for global/sticky regexes reused across calls
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const candidate = m[1];
      if (knownStoryIds.has(candidate)) found.add(candidate);
    }
  }
  return [...found];
}

// ─── SIG-05: Filename/path token extraction ──────────────────────
//
// Matches: src/git/index.ts, gitmap.json, components/Board.vue
// Excludes: URLs (starts with http), strings longer than 120 chars

const PATH_RE = /\b([\w.-]+(?:\/[\w.-]+)+|[\w-]+\.\w{2,5})\b/g;

export function extractPathTokens(text: string): string[] {
  const tokens: string[] = [];
  PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_RE.exec(text)) !== null) {
    const token = m[1];
    if (token.startsWith("http") || token.length > 120) continue;
    // Exclude tokens that appear immediately after "://" (URL host/path components)
    const matchStart = m.index;
    if (matchStart >= 3 && text.slice(matchStart - 3, matchStart) === "://") continue;
    tokens.push(token.toLowerCase());
  }
  return [...new Set(tokens)];
}

// ─── SIG-06: Story path extraction from markdown text ────────────
//
// Scans story description/AC text for file path references.
// Used to build a set of story-referenced paths for path-overlap scoring (Phase 2).
// Callers pass: story.description + story.acceptanceCriteria.map(ac => ac.description).join(" ")

export function extractPathsFromStoryText(text: string): string[] {
  const PATH_STORY_RE = /\b([\w.-]+(?:\/[\w.-]+)+|[\w-]+\.\w{2,5})\b/g;
  const paths: string[] = [];
  PATH_STORY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PATH_STORY_RE.exec(text)) !== null) {
    const token = m[1];
    if (token.startsWith("http") || token.length > 120) continue;
    // Exclude tokens that appear immediately after "://" (URL host/path components)
    const matchStart = m.index;
    if (matchStart >= 3 && text.slice(matchStart - 3, matchStart) === "://") continue;
    paths.push(token.toLowerCase());
  }
  return [...new Set(paths)];
}

// ─── SIG-07: Stopword stripping ───────────────────────────────────
//
// Removes common English stopwords and commit boilerplate from text
// before it is passed to the embedding model.
//
// SAFETY: Do NOT remove domain terms (auth, login, api, user, session, etc.)
// Only remove function words and generic commit boilerplate.
// Short words (length <= 1) are also filtered.

export const STOPWORDS = new Set([
  // Articles and determiners
  "a", "an", "the",
  // Auxiliary verbs
  "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might",
  "shall", "can", "need", "ought",
  // Prepositions
  "to", "of", "in", "on", "at", "by", "for", "with",
  "about", "against", "between", "into", "through",
  "during", "before", "after", "above", "below",
  "from", "up", "down", "out", "off", "over", "under",
  // Conjunctions and pronouns
  "and", "but", "or", "nor", "so", "yet",
  "both", "either", "neither",
  "this", "that", "these", "those",
  "again", "further", "then", "once",
  "used",
  // Commit boilerplate
  "commit", "update", "change", "changes", "modify", "modified",
]);

export function stripStopwords(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

// Builds clean embedding text from commit message, body, and file list.
// Applies stopword stripping to produce higher-signal input for the model.
// Files are lowercased basenames only (path noise excluded from embedding).

export function buildCleanEmbedText(
  message: string,
  body: string,
  files: string[]
): string {
  const parts = [message];
  if (body) parts.push(body);
  const filePart = files
    .slice(0, 10)
    .map((f) => f.split("/").pop() ?? f)   // basename only for embedding
    .join(" ");
  if (filePart) parts.push(filePart);
  return stripStopwords(parts.join(" ")).slice(0, 500);
}
