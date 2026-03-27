import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CURRENT_PIPELINE_VERSION,
  loadGitMap,
  saveGitMap,
} from "../src/git/index.js";
import type { CommitMapping, SignalBreakdown } from "../src/types/index.js";

// ─── Helpers ────────────────────────────────────────────────────────

/** The assignment decision extracted from the pipeline for unit testing. */
function resolveStoryId(
  idBoost: number,
  finalScore: number,
  threshold = 0.38
): string | null {
  const storyId = "story-1";
  return idBoost === 1.0 || finalScore >= threshold ? storyId : null;
}

/** Build a minimal CommitMapping that the pipeline would produce. */
function makeMapping(
  opts: Partial<CommitMapping> & { signalBreakdown: SignalBreakdown }
): CommitMapping {
  return {
    sha: opts.sha ?? "abc123",
    message: opts.message ?? "test commit",
    body: opts.body ?? "",
    files: opts.files ?? [],
    date: opts.date ?? "2024-01-01",
    storyId: opts.storyId ?? null,
    score: opts.score ?? 0,
    signalBreakdown: opts.signalBreakdown,
    pipeline_version: opts.pipeline_version ?? CURRENT_PIPELINE_VERSION,
  };
}

// ─── Hard gate ──────────────────────────────────────────────────────

describe("Hard gate: story ID reference always assigns", () => {
  it("assigns when idBoost === 1.0 even if finalScore is below threshold", () => {
    const result = resolveStoryId(1.0, 0.1); // 0.1 < 0.38
    expect(result).not.toBeNull();
  });

  it("assigns when finalScore >= threshold (no ID reference needed)", () => {
    const result = resolveStoryId(0, 0.5); // 0.5 >= 0.38
    expect(result).not.toBeNull();
  });
});

// ─── No-match abstention ─────────────────────────────────────────────

describe("No-match abstention", () => {
  it("returns null when idBoost is 0 and finalScore is below threshold", () => {
    const result = resolveStoryId(0, 0.2); // 0.2 < 0.38
    expect(result).toBeNull();
  });

  it("threshold boundary: 0.38 exactly is assigned", () => {
    const result = resolveStoryId(0, 0.38);
    expect(result).not.toBeNull();
  });

  it("threshold boundary: 0.3799 is abstained", () => {
    const result = resolveStoryId(0, 0.3799);
    expect(result).toBeNull();
  });
});

// ─── Breakdown shape ────────────────────────────────────────────────

describe("Signal breakdown shape", () => {
  it("CommitMapping has signalBreakdown with all 7 numeric keys", () => {
    const mapping = makeMapping({
      storyId: "story-1",
      score: 0.5,
      signalBreakdown: {
        storyIdMatch: 1.0,
        typeGate: 0,
        pathOverlap: 0.3,
        keyword: 0.4,
        embedding: 0.6,
        nli: 0.55,
        diffSignal: 0.1,
      },
    });

    const bd = mapping.signalBreakdown!;
    expect(typeof bd.storyIdMatch).toBe("number");
    expect(typeof bd.typeGate).toBe("number");
    expect(typeof bd.pathOverlap).toBe("number");
    expect(typeof bd.keyword).toBe("number");
    expect(typeof bd.embedding).toBe("number");
    expect(typeof bd.nli).toBe("number");
    expect(typeof bd.diffSignal).toBe("number");
    expect(Object.keys(bd)).toEqual(
      expect.arrayContaining(["storyIdMatch", "typeGate", "pathOverlap", "keyword", "embedding", "nli", "diffSignal"])
    );
  });
});

// ─── Diff extraction logic ───────────────────────────────────────────

describe("extractDiffPlusLines logic", () => {
  it("filters + lines and excludes +++ headers", () => {
    const raw = `diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1,2 +1,3 @@\n+const x = 1;\n+const y = 2;\n unchanged`;
    const lines = raw.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('+const x = 1;');
  });

  it("caps at 300 chars", () => {
    const longLine = '+' + 'a'.repeat(400);
    const lines = [longLine];
    const result = lines.join(' ').slice(0, 300);
    expect(result.length).toBe(300);
  });

  it("returns empty string when no + lines present", () => {
    const raw = `diff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n unchanged line`;
    const lines = raw.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
    expect(lines).toHaveLength(0);
    expect(lines.join(' ').slice(0, 300)).toBe('');
  });
});

// ─── Pipeline version ────────────────────────────────────────────────

describe("Pipeline version", () => {
  it("CURRENT_PIPELINE_VERSION is 3.0.0", () => {
    expect(CURRENT_PIPELINE_VERSION).toBe("3.0.0");
  });

  it("CommitMapping has pipeline_version matching CURRENT_PIPELINE_VERSION", () => {
    const mapping = makeMapping({
      signalBreakdown: { storyIdMatch: 0, typeGate: 0, pathOverlap: 0, keyword: 0, embedding: 0, nli: 0, diffSignal: 0 },
      pipeline_version: CURRENT_PIPELINE_VERSION,
    });
    expect(mapping.pipeline_version).toBe(CURRENT_PIPELINE_VERSION);
    expect(mapping.pipeline_version).toBe("3.0.0");
  });
});

// ─── Cache invalidation ──────────────────────────────────────────────

describe("loadGitMap cache invalidation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bmad-test-"));
    // loadGitMap expects path.join(projectDir, "bmad-visio", "gitmap.json")
    fs.mkdirSync(path.join(tmpDir, "bmad-visio"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("drops entries with stale pipeline_version", () => {
    const gitmap = {
      version: 2,
      mappings: {
        stale_sha: {
          sha: "stale_sha",
          message: "old commit",
          body: "",
          files: [],
          date: "2024-01-01",
          storyId: "story-1",
          score: 0.5,
          pipeline_version: "1.0.0", // stale
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, "bmad-visio", "gitmap.json"),
      JSON.stringify(gitmap),
      "utf-8"
    );

    const loaded = loadGitMap(tmpDir);
    expect(loaded.mappings["stale_sha"]).toBeUndefined();
  });

  it("keeps entries with current pipeline_version", () => {
    const gitmap = {
      version: 2,
      mappings: {
        current_sha: {
          sha: "current_sha",
          message: "current commit",
          body: "",
          files: [],
          date: "2024-01-01",
          storyId: "story-2",
          score: 0.6,
          pipeline_version: CURRENT_PIPELINE_VERSION,
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, "bmad-visio", "gitmap.json"),
      JSON.stringify(gitmap),
      "utf-8"
    );

    const loaded = loadGitMap(tmpDir);
    expect(loaded.mappings["current_sha"]).toBeDefined();
    expect(loaded.mappings["current_sha"].storyId).toBe("story-2");
  });

  it("drops stale but keeps current in a mixed gitmap", () => {
    const gitmap = {
      version: 2,
      mappings: {
        stale_sha: {
          sha: "stale_sha",
          message: "old commit",
          body: "",
          files: [],
          date: "2024-01-01",
          storyId: "story-1",
          score: 0.4,
          pipeline_version: "1.9.0",
        },
        current_sha: {
          sha: "current_sha",
          message: "new commit",
          body: "",
          files: [],
          date: "2024-01-02",
          storyId: "story-2",
          score: 0.7,
          pipeline_version: CURRENT_PIPELINE_VERSION,
        },
      },
    };
    fs.writeFileSync(
      path.join(tmpDir, "bmad-visio", "gitmap.json"),
      JSON.stringify(gitmap),
      "utf-8"
    );

    const loaded = loadGitMap(tmpDir);
    expect(loaded.mappings["stale_sha"]).toBeUndefined();
    expect(loaded.mappings["current_sha"]).toBeDefined();
  });

  it("returns empty mappings when gitmap does not exist", () => {
    const loaded = loadGitMap(tmpDir);
    expect(loaded.mappings).toEqual({});
    expect(loaded.version).toBe(2);
  });
});
