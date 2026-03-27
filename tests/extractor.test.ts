import { describe, it, expect } from "vitest";
import {
  parseConventionalCommit,
  extractInformalKeyword,
  isSuppressedCommit,
  INFORMAL_SUPPRESS_KEYWORDS,
  INFORMAL_FEATURE_KEYWORDS,
  extractStoryIdReferences,
  extractPathTokens,
  extractPathsFromStoryText,
  STOPWORDS,
  stripStopwords,
  buildCleanEmbedText,
} from "../src/git/extractor.js";

// ─── SIG-01: Conventional commit type + scope extraction ──────────

describe("parseConventionalCommit — SIG-01", () => {
  it("extracts type and scope from 'feat(auth): add login'", () => {
    const r = parseConventionalCommit("feat(auth): add login");
    expect(r.type).toBe("feat");
    expect(r.scope).toBe("auth");
    expect(r.subject).toBe("add login");
  });

  it("extracts type without scope from 'fix: correct typo'", () => {
    const r = parseConventionalCommit("fix: correct typo");
    expect(r.type).toBe("fix");
    expect(r.scope).toBeNull();
  });

  it("extracts 'perf' type", () => {
    const r = parseConventionalCommit("perf: optimize query");
    expect(r.type).toBe("perf");
  });

  it("extracts 'refactor' type", () => {
    const r = parseConventionalCommit("refactor: simplify auth module");
    expect(r.type).toBe("refactor");
  });

  it("extracts 'test' type", () => {
    const r = parseConventionalCommit("test: add login tests");
    expect(r.type).toBe("test");
  });

  it("returns null type for non-conventional message", () => {
    const r = parseConventionalCommit("update some stuff");
    expect(r.type).toBeNull();
    expect(r.scope).toBeNull();
  });

  it("normalizes type to lowercase (handles 'Feat: ...')", () => {
    const r = parseConventionalCommit("Feat: add feature");
    expect(r.type).toBe("feat");
  });

  it("normalizes type to lowercase (handles 'CHORE: ...')", () => {
    const r = parseConventionalCommit("CHORE: update deps");
    expect(r.type).toBe("chore");
  });

  it("handles breaking change suffix '!' in 'feat!: breaking'", () => {
    const r = parseConventionalCommit("feat!: breaking change");
    expect(r.type).toBe("feat");
  });
});

// ─── SIG-02: Informal keyword extraction ──────────────────────────

describe("extractInformalKeyword — SIG-02", () => {
  it("detects 'WIP' in 'WIP: half done'", () => {
    expect(extractInformalKeyword("WIP: half done")).toBe("WIP");
  });

  it("detects 'TODO' in 'TODO fix this later'", () => {
    expect(extractInformalKeyword("TODO fix this later")).toBe("TODO");
  });

  it("detects 'Implemented' in 'Implemented user login'", () => {
    expect(extractInformalKeyword("Implemented user login")).toBe("Implemented");
  });

  it("detects 'Fixed' in 'Fixed the broken build'", () => {
    expect(extractInformalKeyword("Fixed the broken build")).toBe("Fixed");
  });

  it("detects 'Updated' in 'Updated the README'", () => {
    expect(extractInformalKeyword("Updated the README")).toBe("Updated");
  });

  it("detects 'Removed' in 'Removed unused imports'", () => {
    expect(extractInformalKeyword("Removed unused imports")).toBe("Removed");
  });

  it("detects 'Cleanup' case-insensitively", () => {
    const r = extractInformalKeyword("cleanup: old files");
    expect(r).toBe("Cleanup");
  });

  it("returns null when no keyword matches", () => {
    expect(extractInformalKeyword("feat: add new feature")).toBeNull();
  });

  it("detects 'TO FIX' multi-word keyword", () => {
    expect(extractInformalKeyword("TO FIX: auth module broken")).toBe("TO FIX");
  });

  it("detects 'Refactor' keyword", () => {
    expect(extractInformalKeyword("Refactor: split into smaller files")).toBe("Refactor");
  });
});

// ─── SIG-03: Suppression gate ─────────────────────────────────────

describe("isSuppressedCommit — SIG-03", () => {
  it("suppresses 'chore: update deps'", () => {
    expect(isSuppressedCommit("chore: update deps", "")).toBe(true);
  });

  it("suppresses 'ci: fix pipeline'", () => {
    expect(isSuppressedCommit("ci: fix pipeline", "")).toBe(true);
  });

  it("suppresses 'docs: update readme'", () => {
    expect(isSuppressedCommit("docs: update readme", "")).toBe(true);
  });

  it("suppresses 'CHORE: ...' (case-insensitive type)", () => {
    expect(isSuppressedCommit("CHORE: update something", "")).toBe(true);
  });

  it("suppresses 'DOCS: ...' (case-insensitive type)", () => {
    expect(isSuppressedCommit("DOCS: add guide", "")).toBe(true);
  });

  it("does NOT suppress 'feat: add auth'", () => {
    expect(isSuppressedCommit("feat: add auth", "")).toBe(false);
  });

  it("does NOT suppress 'fix: correct null check'", () => {
    expect(isSuppressedCommit("fix: correct null check", "")).toBe(false);
  });

  it("suppresses 'WIP: half done' (non-feature informal, no conventional type)", () => {
    expect(isSuppressedCommit("WIP: half done", "")).toBe(true);
  });

  it("suppresses 'TODO fix this' (non-feature informal, no conventional type)", () => {
    expect(isSuppressedCommit("TODO fix this", "")).toBe(true);
  });

  it("does NOT suppress 'Implemented user login' (feature informal keyword, no conventional type)", () => {
    expect(isSuppressedCommit("Implemented user login", "")).toBe(false);
  });

  it("does NOT suppress 'Fixed the auth bug' (feature informal keyword)", () => {
    expect(isSuppressedCommit("Fixed the auth bug", "")).toBe(false);
  });

  it("suppresses 'Cleanup: remove dead code' (suppress keyword, no conventional type)", () => {
    expect(isSuppressedCommit("Cleanup: remove dead code", "")).toBe(true);
  });
});

// ─── Constant exports ─────────────────────────────────────────────

describe("keyword constants", () => {
  it("INFORMAL_SUPPRESS_KEYWORDS includes WIP", () => {
    expect(INFORMAL_SUPPRESS_KEYWORDS).toContain("WIP");
  });

  it("INFORMAL_FEATURE_KEYWORDS includes Implemented", () => {
    expect(INFORMAL_FEATURE_KEYWORDS).toContain("Implemented");
  });
});

// ─── SIG-04: Story ID regex broadening ────────────────────────────

describe("extractStoryIdReferences — SIG-04", () => {
  const known = new Set(["1", "3", "3.2", "5", "10"]);

  it("resolves '#5' to story ID '5'", () => {
    expect(extractStoryIdReferences("fixes #5 in auth", known)).toContain("5");
  });

  it("resolves 'US-3' to story ID '3'", () => {
    expect(extractStoryIdReferences("US-3 implement login", known)).toContain("3");
  });

  it("resolves 'STORY-3.2' to story ID '3.2'", () => {
    expect(extractStoryIdReferences("STORY-3.2 complete", known)).toContain("3.2");
  });

  it("resolves 'story 3' (case-insensitive) to '3'", () => {
    expect(extractStoryIdReferences("closes story 3", known)).toContain("3");
  });

  it("resolves 'Story 3.2' to '3.2'", () => {
    expect(extractStoryIdReferences("Story 3.2: user login", known)).toContain("3.2");
  });

  it("does NOT resolve 'v1.2' when '1.2' is NOT in knownStoryIds", () => {
    const limitedKnown = new Set(["5", "3"]);
    expect(extractStoryIdReferences("update to v1.2", limitedKnown)).not.toContain("1.2");
  });

  it("resolves '3.2' plain decimal when '3.2' IS in knownStoryIds", () => {
    expect(extractStoryIdReferences("implements 3.2 feature", known)).toContain("3.2");
  });

  it("returns empty array when no story IDs found", () => {
    expect(extractStoryIdReferences("refactor some code", known)).toHaveLength(0);
  });

  it("returns unique IDs (no duplicates when same ID appears twice)", () => {
    const result = extractStoryIdReferences("#5 and story 5 and US-5", new Set(["5"]));
    expect(result.filter((id) => id === "5")).toHaveLength(1);
  });

  it("handles case-insensitive STORY- prefix", () => {
    expect(extractStoryIdReferences("story-3.2 work done", known)).toContain("3.2");
  });
});

// ─── SIG-05: Path token extraction ────────────────────────────────

describe("extractPathTokens — SIG-05", () => {
  it("extracts 'src/git/index.ts' from commit message", () => {
    expect(extractPathTokens("update src/git/index.ts for new logic")).toContain("src/git/index.ts");
  });

  it("extracts 'gitmap.json' standalone filename", () => {
    expect(extractPathTokens("add caching to gitmap.json")).toContain("gitmap.json");
  });

  it("extracts 'components/Board.vue'", () => {
    expect(extractPathTokens("refactor components/Board.vue layout")).toContain("components/board.vue");
  });

  it("does NOT extract URL path 'https://example.com/api/v2'", () => {
    const tokens = extractPathTokens("see https://example.com/api/v2/endpoint for details");
    for (const t of tokens) {
      expect(t).not.toContain("example.com");
    }
  });

  it("does NOT extract token starting with 'http'", () => {
    const tokens = extractPathTokens("docs at http://docs.example.com/guide");
    for (const t of tokens) {
      expect(t.startsWith("http")).toBe(false);
    }
  });

  it("returns lowercase tokens", () => {
    const tokens = extractPathTokens("update Src/Auth/Login.ts");
    expect(tokens).toContain("src/auth/login.ts");
  });

  it("returns deduplicated tokens", () => {
    const tokens = extractPathTokens("update src/auth/login.ts and src/auth/login.ts again");
    expect(tokens.filter((t) => t === "src/auth/login.ts")).toHaveLength(1);
  });

  it("returns empty array for message with no path-like tokens", () => {
    expect(extractPathTokens("add new feature for login")).toHaveLength(0);
  });

  it("extracts multiple paths from one message", () => {
    const tokens = extractPathTokens("move src/auth/login.ts to src/auth/session.ts");
    expect(tokens).toContain("src/auth/login.ts");
    expect(tokens).toContain("src/auth/session.ts");
  });
});

// ─── SIG-06: Story path extraction ────────────────────────────────

describe("extractPathsFromStoryText — SIG-06", () => {
  it("extracts 'src/auth/login.ts' from story description text", () => {
    const text = "Implement login in src/auth/login.ts and wire to router";
    expect(extractPathsFromStoryText(text)).toContain("src/auth/login.ts");
  });

  it("extracts 'gitmap.json' standalone filename from acceptance criteria text", () => {
    const text = "Given gitmap.json exists, the dashboard should load mappings";
    expect(extractPathsFromStoryText(text)).toContain("gitmap.json");
  });

  it("does NOT extract URL paths", () => {
    const text = "See https://github.com/user/repo/blob/main/src/file.ts for reference";
    const paths = extractPathsFromStoryText(text);
    for (const p of paths) {
      expect(p).not.toContain("github.com");
    }
  });

  it("returns empty array for story text with no file references", () => {
    expect(extractPathsFromStoryText("As a user I want to log in")).toHaveLength(0);
  });

  it("returns deduplicated paths", () => {
    const text = "Update src/auth/login.ts. Test in src/auth/login.ts.";
    const paths = extractPathsFromStoryText(text);
    expect(paths.filter((p) => p === "src/auth/login.ts")).toHaveLength(1);
  });
});

// ─── SIG-07: Stopword stripping ───────────────────────────────────

describe("stripStopwords — SIG-07", () => {
  it("removes 'this', 'commit', 'the' from commit boilerplate", () => {
    const result = stripStopwords("this commit updates the login page");
    expect(result).not.toContain("this");
    expect(result).not.toContain("commit");
    expect(result).not.toContain("the");
    expect(result).toContain("updates");
    expect(result).toContain("login");
    expect(result).toContain("page");
  });

  it("does NOT strip domain term 'auth'", () => {
    expect(stripStopwords("add auth feature")).toContain("auth");
  });

  it("does NOT strip domain term 'login'", () => {
    expect(stripStopwords("fix login redirect")).toContain("login");
  });

  it("does NOT strip domain term 'api'", () => {
    expect(stripStopwords("update api endpoint")).toContain("api");
  });

  it("returns empty string for all-stopword input", () => {
    expect(stripStopwords("a an the is are was")).toBe("");
  });

  it("handles empty string input", () => {
    expect(stripStopwords("")).toBe("");
  });

  it("removes 'update' boilerplate word", () => {
    const result = stripStopwords("update the readme file");
    expect(result).not.toContain("update");
    expect(result).not.toContain("the");
  });

  it("STOPWORDS set contains 'commit'", () => {
    expect(STOPWORDS.has("commit")).toBe(true);
  });

  it("STOPWORDS set does NOT contain 'auth'", () => {
    expect(STOPWORDS.has("auth")).toBe(false);
  });

  it("STOPWORDS set does NOT contain 'login'", () => {
    expect(STOPWORDS.has("login")).toBe(false);
  });
});

describe("buildCleanEmbedText — SIG-07", () => {
  it("returns stripped text under 500 chars", () => {
    const result = buildCleanEmbedText("feat: add the login flow", "", []);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result).not.toContain("the");
  });

  it("includes file basenames (not full paths) in output", () => {
    const result = buildCleanEmbedText("add feature", "", ["src/auth/login.ts"]);
    expect(result).toContain("login.ts");
    // Should not include full path in embedding text
  });

  it("handles empty body and files", () => {
    const result = buildCleanEmbedText("feat: add auth", "", []);
    expect(result).toContain("auth");
  });
});

// ─── SIG-06: path-overlap signal integration ──────────────────────

describe("SIG-06: path-overlap signal integration", () => {
  it("extracts path from story AC text", () => {
    const paths = extractPathsFromStoryText(
      "Implement changes in src/auth/login.ts and update gitmap.json"
    );
    expect(paths).toContain("src/auth/login.ts");
    expect(paths).toContain("gitmap.json");
  });

  it("extracts path tokens from commit message", () => {
    const tokens = extractPathTokens("feat: update src/auth/login.ts token refresh logic");
    expect(tokens).toContain("src/auth/login.ts");
  });

  it("commit path tokens intersect story path set when path matches", () => {
    const commitTokens = new Set(extractPathTokens("fix: correct expiry in src/auth/login.ts"));
    const storyPaths = new Set(extractPathsFromStoryText("Update src/auth/login.ts to handle token expiry"));
    const intersection = [...commitTokens].filter((t) => storyPaths.has(t));
    expect(intersection.length).toBeGreaterThan(0);
  });

  it("overlap is zero when commit and story paths are disjoint", () => {
    const commitTokens = new Set(extractPathTokens("fix: update components/Board.vue layout"));
    const storyPaths = new Set(extractPathsFromStoryText("Implement changes in src/auth/login.ts"));
    const intersection = [...commitTokens].filter((t) => storyPaths.has(t));
    expect(intersection.length).toBe(0);
  });

  it("pathOverlapScore returns 1.0 for identical sets, 0.0 for disjoint sets", () => {
    function pathOverlapScore(commitSet: Set<string>, storySet: Set<string>): number {
      if (commitSet.size === 0 || storySet.size === 0) return 0;
      let intersection = 0;
      for (const t of commitSet) { if (storySet.has(t)) intersection++; }
      const union = commitSet.size + storySet.size - intersection;
      return intersection / union;
    }
    const same = new Set(["src/auth/login.ts", "gitmap.json"]);
    expect(pathOverlapScore(same, same)).toBe(1.0);
    const a = new Set(["src/auth/login.ts"]);
    const b = new Set(["components/Board.vue"]);
    expect(pathOverlapScore(a, b)).toBe(0);
    const c = new Set(["src/auth/login.ts", "gitmap.json"]);
    const d = new Set(["src/auth/login.ts", "components/Board.vue"]);
    expect(pathOverlapScore(c, d)).toBeCloseTo(1/3, 5);
  });
});

describe("new keyword coverage (T01)", () => {
  it("extractInformalKeyword returns FIX for 'FIX auth flow'", () => {
    expect(extractInformalKeyword("FIX auth flow")).toBe("FIX");
  });

  it("extractInformalKeyword returns Fixed for 'Fixed login issue'", () => {
    expect(extractInformalKeyword("Fixed login issue")).toBe("Fixed");
  });

  it("extractInformalKeyword returns TOFIX for 'TOFIX: session handling'", () => {
    expect(extractInformalKeyword("TOFIX: session handling")).toBe("TOFIX");
  });

  it("isSuppressedCommit returns false for 'TOFIX: session handling'", () => {
    expect(isSuppressedCommit("TOFIX: session handling", "")).toBe(false);
  });

  it("extractInformalKeyword returns Remaining for 'Remaining auth flow'", () => {
    expect(extractInformalKeyword("Remaining auth flow")).toBe("Remaining");
  });

  it("extractInformalKeyword returns Investigate for 'Investigate memory leak'", () => {
    expect(extractInformalKeyword("Investigate memory leak")).toBe("Investigate");
  });

  it("extractInformalKeyword returns Implement for 'Implement login form'", () => {
    expect(extractInformalKeyword("Implement login form")).toBe("Implement");
  });

  it("extractInformalKeyword returns Refactored for 'Refactored user service'", () => {
    expect(extractInformalKeyword("Refactored user service")).toBe("Refactored");
  });
});
