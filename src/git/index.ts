import fs from "node:fs";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { BmadProject, CommitMapping, UserStory } from "../types/index.js";
import { extractCommitSignals, extractPathsFromStoryText } from "./extractor.js";

export const CURRENT_PIPELINE_VERSION = "3.0.0";

// ─── Types ──────────────────────────────────────────────────────────

export interface GitMapFile {
  version: 2;
  mappings: Record<string, CommitMapping>;
}

interface EmbedFn {
  (texts: string[]): Promise<number[][]>;
}

interface ClassifyFn {
  (text: string, labels: string[]): Promise<{ label: string; score: number }[]>;
}

interface Candidate {
  storyId: string;
  embeddingScore: number;
  idBoost: number;
  keywordScore: number;   // Jaccard on text tokens (unchanged)
  pathOverlapScore: number; // NEW: Jaccard on file path tokens (tracked separately)
  nliScore: number;
  diffSignal: number;
  finalScore: number;
}

// ─── Math helpers ───────────────────────────────────────────────────

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// ─── Keyword overlap (Jaccard on lowercased tokens) ─────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) { if (b.has(t)) intersection++; }
  return intersection / (a.size + b.size - intersection);
}

// ─── Build text for embedding / matching ────────────────────────────

function storyEmbedText(story: UserStory): string {
  const parts = [`Story ${story.id}: ${story.title}`];
  if (story.description) parts.push(story.description);
  if (story.acceptanceCriteria.length > 0) {
    parts.push(story.acceptanceCriteria.map((ac) => ac.description).join(". "));
  }
  return parts.join(" — ").slice(0, 500);
}

/** Short label for zero-shot NLI — just title */
function storyLabel(story: UserStory): string {
  return `This commit implements ${story.title}`;
}

function commitEmbedText(message: string, body: string, files: string[]): string {
  const parts = [message];
  if (body) parts.push(body);
  const filePart = files.slice(0, 10).join(", ");
  if (filePart) parts.push(`[files: ${filePart}]`);
  return parts.join(" ").slice(0, 500);
}

function commitNliText(message: string, body: string): string {
  const parts = [message];
  if (body) parts.push(body);
  return parts.join(". ").slice(0, 200);
}

async function extractDiffPlusLines(sha: string, git: SimpleGit): Promise<string> {
  try {
    const raw = await git.raw(['show', '--format=', '-U0', sha]);
    const lines = raw.split('\n').filter((l: string) => l.startsWith('+') && !l.startsWith('+++'));
    return lines.join(' ').slice(0, 300);
  } catch {
    return '';
  }
}

// ─── Gitmap file I/O ────────────────────────────────────────────────

function getGitMapPath(projectDir: string): string {
  return path.join(projectDir, "bmad-visio", "gitmap.json");
}

export function loadGitMap(projectDir: string): GitMapFile {
  const p = getGitMapPath(projectDir);
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (data.version === 1) return { version: 2, mappings: data.mappings ?? {} };
      // Drop entries from old pipeline versions
      for (const [sha, entry] of Object.entries(data.mappings ?? {})) {
        if ((entry as any).pipeline_version !== CURRENT_PIPELINE_VERSION) {
          console.log(`  Dropping stale cache entry ${sha} (pipeline_version mismatch)`);
          delete data.mappings[sha];
        }
      }
      return data;
    } catch { /* corrupted */ }
  }
  return { version: 2, mappings: {} };
}

export function saveGitMap(projectDir: string, gitmap: GitMapFile): void {
  const p = getGitMapPath(projectDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ version: 2, mappings: gitmap.mappings }, null, 2), "utf-8");
}

// ─── Model loaders (lazy, cached) ───────────────────────────────────

let _embedFn: EmbedFn | null = null;
let _classifyFn: ClassifyFn | null = null;
let _transformersAvailable: boolean | null = null;

async function checkTransformers(): Promise<boolean> {
  if (_transformersAvailable !== null) return _transformersAvailable;
  try {
    await import("@huggingface/transformers");
    _transformersAvailable = true;
  } catch {
    _transformersAvailable = false;
  }
  return _transformersAvailable;
}

async function getEmbedFn(): Promise<EmbedFn> {
  if (_embedFn) return _embedFn;
  console.log("  Loading embedding model...");
  const { pipeline } = await import("@huggingface/transformers");
  const extractor = await pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", { dtype: "q8" });
  console.log("  Embedding model loaded");

  _embedFn = async (texts: string[]): Promise<number[][]> => {
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const batch = texts.slice(i, i + 16);
      const output = await extractor(batch, { pooling: "mean", normalize: true });
      results.push(...(output.tolist() as number[][]));
    }
    return results;
  };
  return _embedFn;
}

async function getClassifyFn(): Promise<ClassifyFn> {
  if (_classifyFn) return _classifyFn;
  console.log("  Loading zero-shot classifier for re-ranking...");
  const { pipeline } = await import("@huggingface/transformers");
  const classifier = await pipeline(
    "zero-shot-classification",
    "Xenova/nli-deberta-v3-small",
    { dtype: "q8" }
  );
  console.log("  Classifier loaded");

  _classifyFn = async (text: string, labels: string[]): Promise<{ label: string; score: number }[]> => {
    const result = await classifier(text, labels, { multi_label: true }) as any;
    // Result shape: { sequence, labels: string[], scores: number[] }
    return result.labels.map((label: string, i: number) => ({
      label,
      score: result.scores[i] as number,
    }));
  };
  return _classifyFn;
}

// ─── Scoring weights ────────────────────────────────────────────────
//
// Three-stage pipeline for the report:
//   Stage 1 — Bi-encoder embedding: fast retrieval, narrows to top K
//   Stage 2 — Heuristics: story ID regex + keyword overlap
//   Stage 3 — Zero-shot NLI: re-ranks ambiguous candidates
//
// Final score = weighted combination of all signals.

const WEIGHTS = {
  embedding:  0.35,
  keyword:    0.15,
  idBoost:    0.20,  // only when an ID is detected
  nli:        0.25,
  diffSignal: 0.05,
};

const MATCH_THRESHOLD = 0.38;     // on the combined scale
const RERANK_TOP_K = 3;           // send top K to the NLI classifier
const RERANK_AMBIGUITY = 0.12;    // trigger re-rank if gap between #1 and #2 is below this
const RERANK_CEILING = 0.55;      // always re-rank if top score is below this

// ─── Main: match commits to stories ─────────────────────────────────

export async function matchCommitsToStories(
  project: BmadProject,
  projectDir: string,
  opts?: { skipEmbedding?: boolean }
): Promise<CommitMapping[]> {
  const allStories: UserStory[] = [];
  for (const epic of project.epics) allStories.push(...epic.stories);
  if (allStories.length === 0) return [];

  // ── Git log ──
  const git = simpleGit(projectDir);
  let commits: { sha: string; message: string; body: string; date: string; files: string[] }[];
  try {
    const log = await git.log(["--name-only"]);
    commits = log.all.map((entry: any) => ({
      sha: entry.hash, message: entry.message,
      body: entry.body?.trim() ?? "", date: entry.date,
      files: (entry.diff?.files?.map((f: any) => f.file) ?? []),
    }));
  } catch {
    console.log("  Not a git repository or git not available");
    return [];
  }
  if (commits.length === 0) return [];

  // ── Load gitmap, find new commits ──
  const gitmap = loadGitMap(projectDir);
  const newCommits = commits.filter((c) => !gitmap.mappings[c.sha]);
  if (newCommits.length === 0) {
    console.log("  All commits already mapped");
    return Object.values(gitmap.mappings);
  }
  if (opts?.skipEmbedding) return Object.values(gitmap.mappings);

  // Check if @huggingface/transformers is installed (it's an optional dep)
  if (!(await checkTransformers())) {
    console.log("  @huggingface/transformers not installed — run: npm install @huggingface/transformers");
    console.log("     Skipping AI commit matching. Dashboard will work without it.");
    return Object.values(gitmap.mappings);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STAGE 1: Bi-encoder embedding — fast retrieval
  // ═══════════════════════════════════════════════════════════════════
  const embed = await getEmbedFn();
  const storyIds = allStories.map((s) => s.id);
  const storyIdSet = new Set(storyIds);
  const storyTexts = allStories.map((s) => storyEmbedText(s));
  const storyLabels = allStories.map((s) => storyLabel(s));
  const storyTokens = storyTexts.map((t) => tokenize(t));
  // SIG-06: pre-build path sets for each story (used in per-commit path-overlap scoring)
  const storyPathSets: Map<string, Set<string>> = new Map(
    allStories.map((s) => {
      const storyText = [
        s.description,
        ...s.acceptanceCriteria.map((ac) => ac.description),
      ].join(" ");
      return [s.id, new Set(extractPathsFromStoryText(storyText))];
    })
  );

  console.log(`  Embedding ${storyTexts.length} stories...`);
  const storyVecs = await embed(storyTexts);

  console.log(`  Matching ${newCommits.length} new commits...`);
  // Phase 1: pre-extract signals for all commits (needed for embed text + suppression gate)
  const allSignals = newCommits.map((c) => extractCommitSignals(c.message, c.body, storyIdSet));
  // SIG-07: Use clean embed text (stopword-stripped) instead of raw commitEmbedText
  const commitTexts = allSignals.map((s) => s.cleanEmbedText);
  const commitVectors = await embed(commitTexts);

  // Diff signal: extract +lines from each new commit's diff
  console.log(`  Extracting diff +lines for ${newCommits.length} commits...`);
  const diffTexts: string[] = await Promise.all(
    newCommits.map((c) => extractDiffPlusLines(c.sha, git))
  );

  // ═══════════════════════════════════════════════════════════════════
  // STAGE 2: Score each commit against all stories (embedding + heuristics)
  // ═══════════════════════════════════════════════════════════════════
  interface CommitCandidates {
    commit: typeof newCommits[0];
    candidates: Candidate[];
    needsRerank: boolean;
  }

  const allCandidates: CommitCandidates[] = [];

  for (let ci = 0; ci < newCommits.length; ci++) {
    const commit = newCommits[ci];

    // Phase 1: signals already extracted above
    const signals = allSignals[ci];

    // SIG-03: Suppression gate — skip ML entirely for chore/ci/docs and non-feature informal commits
    if (signals.isSuppressed) {
      gitmap.mappings[commit.sha] = {
        sha: commit.sha,
        message: commit.message,
        body: commit.body,
        files: commit.files,
        date: commit.date,
        storyId: null,
        score: 0,
        signalBreakdown: { storyIdMatch: 0, typeGate: 0, pathOverlap: 0, keyword: 0, embedding: 0, nli: 0, diffSignal: 0 },
        pipeline_version: CURRENT_PIPELINE_VERSION,
      };
      allCandidates.push({ commit, candidates: [], needsRerank: false });
      continue;
    }

    const cVec = commitVectors[ci];
    const fullText = `${commit.message} ${commit.body}`;
    const commitTokens = tokenize(fullText);

    // SIG-04: Use broadened story ID extraction from extractor (replaces inline idPattern)
    const referencedIds = new Set<string>(signals.referencedStoryIds);

    const commitPathSet = new Set(signals.pathTokens);
    const candidates: Candidate[] = storyIds.map((sid, si) => {
      const storyPathSet = storyPathSets.get(sid) ?? new Set<string>();
      // SIG-06: path-overlap score (Jaccard on file path tokens)
      let pathOverlapScore = 0;
      if (commitPathSet.size > 0 && storyPathSet.size > 0) {
        let intersection = 0;
        for (const t of commitPathSet) { if (storyPathSet.has(t)) intersection++; }
        const union = commitPathSet.size + storyPathSet.size - intersection;
        pathOverlapScore = intersection / union;
      }
      return {
        storyId: sid,
        embeddingScore: dotProduct(cVec, storyVecs[si]),
        idBoost: referencedIds.has(sid) ? 1.0 : 0.0,
        // keywordScore takes the higher of word-token Jaccard and path-token Jaccard (SIG-06)
        keywordScore: Math.max(jaccardSimilarity(commitTokens, storyTokens[si]), pathOverlapScore),
        pathOverlapScore,
        nliScore: 0,    // filled in stage 3
        diffSignal: 0,  // filled in stage 2
        finalScore: 0,  // computed after all stages
      };
    });

    // Pre-compute score without NLI to determine if re-rank is needed
    for (const c of candidates) {
      const storyPathArr = storyPathSets.get(c.storyId) ? [...storyPathSets.get(c.storyId)!] : [];
      c.diffSignal = jaccardSimilarity(tokenize(diffTexts[ci] ?? ''), new Set(storyPathArr));
      c.finalScore = c.embeddingScore * (WEIGHTS.embedding + WEIGHTS.nli) // NLI weight goes to embedding when skipped
        + c.keywordScore * WEIGHTS.keyword
        + c.idBoost * WEIGHTS.idBoost
        + c.diffSignal * WEIGHTS.diffSignal;
    }
    candidates.sort((a, b) => b.finalScore - a.finalScore);

    // Decide if we need NLI re-ranking
    const top = candidates[0];
    const second = candidates[1];
    const gap = top && second ? top.finalScore - second.finalScore : 1;
    const needsRerank = top.finalScore < RERANK_CEILING || gap < RERANK_AMBIGUITY;

    allCandidates.push({ commit, candidates, needsRerank });
  }

  // ═══════════════════════════════════════════════════════════════════
  // STAGE 3: Zero-shot NLI re-ranking (only for ambiguous matches)
  // ═══════════════════════════════════════════════════════════════════
  const ambiguous = allCandidates.filter((cc) => cc.needsRerank);

  if (ambiguous.length > 0) {
    console.log(`  Re-ranking ${ambiguous.length}/${newCommits.length} ambiguous commits with NLI...`);
    const classify = await getClassifyFn();

    for (const cc of ambiguous) {
      const topK = cc.candidates.slice(0, RERANK_TOP_K);
      const commitText = commitNliText(cc.commit.message, cc.commit.body);
      const labels = topK.map((c) => {
        const idx = storyIds.indexOf(c.storyId);
        return storyLabels[idx];
      });

      try {
        const nliResults = await classify(commitText, labels);

        // Map NLI scores back to candidates
        for (const c of topK) {
          const idx = storyIds.indexOf(c.storyId);
          const label = storyLabels[idx];
          const nliResult = nliResults.find((r) => r.label === label);
          c.nliScore = nliResult?.score ?? 0;
        }
      } catch (err: any) {
        console.log(`  NLI failed for "${cc.commit.message.slice(0, 40)}": ${err.message}`);
        // Fall back — NLI scores stay at 0, embedding carries full weight
      }

      // Recompute final scores with NLI
      for (const c of cc.candidates) {
        c.finalScore =
          c.embeddingScore * WEIGHTS.embedding +
          c.keywordScore * WEIGHTS.keyword +
          c.idBoost * WEIGHTS.idBoost +
          c.nliScore * WEIGHTS.nli +
          c.diffSignal * WEIGHTS.diffSignal;
      }
      cc.candidates.sort((a, b) => b.finalScore - a.finalScore);
    }
  } else {
    console.log(`  All matches confident, NLI re-ranking skipped`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Build final mappings
  // ═══════════════════════════════════════════════════════════════════
  for (const cc of allCandidates) {
    if (cc.candidates.length === 0) continue; // already written by suppression gate
    const best = cc.candidates[0];
    const score = Math.min(Math.round(best.finalScore * 100) / 100, 1.0);

    gitmap.mappings[cc.commit.sha] = {
      sha: cc.commit.sha,
      message: cc.commit.message,
      body: cc.commit.body,
      files: cc.commit.files,
      date: cc.commit.date,
      storyId: best.idBoost === 1.0 || score >= MATCH_THRESHOLD ? best.storyId : null,
      score,
      signalBreakdown: {
        storyIdMatch: best.idBoost,
        typeGate: 0,
        pathOverlap: best.pathOverlapScore,
        keyword: best.keywordScore,
        embedding: best.embeddingScore,
        nli: best.nliScore,
        diffSignal: best.diffSignal,
      },
      pipeline_version: CURRENT_PIPELINE_VERSION,
    };
  }

  saveGitMap(projectDir, gitmap);

  const allMappings = Object.values(gitmap.mappings);
  const matched = allMappings.filter((m) => m.storyId !== null).length;
  const reranked = ambiguous.length;
  console.log(`  ${matched}/${allMappings.length} commits matched (${reranked} re-ranked by NLI)`);

  return allMappings;
}
