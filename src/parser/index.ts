import fs from "node:fs";
import path from "node:path";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import type { Root, Content, Heading, List, ListItem } from "mdast";
import type {
  Epic, UserStory, AcceptanceCriteria, Task, BmadProject,
} from "../types/index.js";

// ─── Helpers ────────────────────────────────────────────────────────

function parseMarkdown(content: string): Root {
  return unified().use(remarkParse).use(remarkGfm).parse(content) as Root;
}

function findMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) results.push(full);
  }
  return results;
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function extractMetadata(nodes: Content[]): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const node of nodes) {
    if (node.type !== "paragraph") continue;
    const text = toString(node);
    for (const line of text.split("\n")) {
      // Match both "**Key:** Value" and "Key: Value"
      const m = line.match(/^\s*\**([^*:]+?)\**:\s*(.+)/);
      if (m) meta[m[1].trim()] = m[2].trim();
    }
  }
  return meta;
}

function splitByHeading(nodes: Content[], level: number): { heading: string; children: Content[] }[] {
  const sections: { heading: string; children: Content[] }[] = [];
  let current: { heading: string; children: Content[] } | null = null;
  for (const node of nodes) {
    if (node.type === "heading" && (node as Heading).depth === level) {
      if (current) sections.push(current);
      current = { heading: toString(node), children: [] };
    } else if (current) {
      current.children.push(node);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function extractUserStoryText(nodes: Content[]): string {
  const lines: string[] = [];
  for (const node of nodes) {
    if (node.type !== "paragraph") continue;
    const text = toString(node);
    if (text.includes("As a") || text.includes("I want to") || text.includes("So that")) {
      lines.push(text);
    }
  }
  return lines.join("\n").trim();
}

// ─── Status mapping ─────────────────────────────────────────────────
// BMAD: backlog, ready-for-dev → todo | in-progress → active | review → review | done → done

export const BOARD_COLUMNS = ["todo", "active", "review", "done"] as const;
export type BoardStatus = (typeof BOARD_COLUMNS)[number];

function parseStatus(raw: string): BoardStatus {
  const lower = raw.toLowerCase();
  if (lower.includes("done") || lower.includes("✅")) return "done";
  if (lower.includes("review")) return "review";
  if (lower.includes("in-progress") || lower.includes("in progress") || lower.includes("active") || lower.includes("🔄")) return "active";
  return "todo";
}

function statusToMarkdown(status: BoardStatus): string {
  switch (status) {
    case "done": return "done";
    case "review": return "review";
    case "active": return "in-progress";
    case "todo": default: return "ready-for-dev";
  }
}

// ─── AC extraction ──────────────────────────────────────────────────

/** Extract GFM checkbox items (old BMAD format) */
function extractCheckboxes(nodes: Content[]): AcceptanceCriteria[] {
  const criteria: AcceptanceCriteria[] = [];
  let idx = 1;
  for (const node of nodes) {
    if (node.type === "list") {
      for (const item of (node as List).children) {
        const li = item as ListItem;
        if (li.checked === null || li.checked === undefined) continue;
        let text = toString(li).trim().replace(/^\[[ xX]\]\s*/i, "").replace(/\s*-\s*DONE\s*$/i, "").trim();
        if (!text) continue;
        criteria.push({ id: `AC-${idx++}`, description: text, done: li.checked === true });
      }
    }
  }
  return criteria;
}

/** Extract numbered paragraph-style ACs (new BMAD format: "1. **Given** ...") */
function extractNumberedAC(nodes: Content[]): AcceptanceCriteria[] {
  const criteria: AcceptanceCriteria[] = [];
  let idx = 1;
  for (const node of nodes) {
    if (node.type === "list" && (node as List).ordered) {
      for (const item of (node as List).children) {
        const text = toString(item).trim();
        if (text) {
          criteria.push({ id: `AC-${idx++}`, description: text, done: false });
        }
      }
    }
  }
  return criteria;
}

/** Extract task checkboxes from ## Tasks / Subtasks */
function extractTasks(nodes: Content[]): Task[] {
  const tasks: Task[] = [];
  let idx = 1;
  for (const node of nodes) {
    if (node.type !== "list") continue;
    for (const item of (node as List).children) {
      const li = item as ListItem;
      if (li.checked === null || li.checked === undefined) continue;
      // Get only the first line of text (task description), not subtasks
      const firstChild = li.children[0];
      const text = firstChild ? toString(firstChild).trim().replace(/^\[[ xX]\]\s*/i, "") : "";
      if (!text) continue;

      // Check for nested list (subtasks)
      const subtasks: Task[] = [];
      let subIdx = 1;
      for (const child of li.children) {
        if (child.type === "list") {
          for (const subItem of (child as List).children) {
            const subLi = subItem as ListItem;
            const subText = toString(subLi).trim().replace(/^\[[ xX]\]\s*/i, "");
            if (subText) {
              subtasks.push({ id: `T${idx}.${subIdx++}`, description: subText, done: subLi.checked === true });
            }
          }
        }
      }

      tasks.push({ id: `T${idx++}`, description: text, done: li.checked === true, subtasks: subtasks.length > 0 ? subtasks : undefined });
    }
  }
  return tasks;
}

function extractNodesAfterLabel(nodes: Content[], label: string): Content[] {
  const lowerLabel = label.toLowerCase();
  let capturing = false;
  const result: Content[] = [];
  for (const node of nodes) {
    if (node.type === "paragraph") {
      const text = toString(node).trim();
      if (text.toLowerCase().includes(lowerLabel)) { capturing = true; continue; }
      if (capturing && text.endsWith(":") && text.length < 80) break;
    }
    if (capturing) result.push(node);
  }
  return result;
}

// ─── New BMAD story parser ──────────────────────────────────────────
// Files like: 1-1-user-registration.md
// Status is plain: "Status: ready-for-dev"
// AC are numbered paragraphs, Tasks are checkboxes

function parseNewStoryFile(content: string, filePath: string): UserStory | null {
  const tree = parseMarkdown(normalizeContent(content));
  const nodes = tree.children;

  const h1 = nodes.find((n) => n.type === "heading" && (n as Heading).depth === 1);
  if (!h1) return null;
  const titleText = toString(h1);
  const titleMatch = titleText.match(/^Story\s+([\d.]+):\s*(.+)/i);
  if (!titleMatch) return null;

  // Status is plain text: "Status: ready-for-dev"
  let status: BoardStatus = "todo";
  for (const node of nodes) {
    if (node.type !== "paragraph") continue;
    const text = toString(node);
    const statusMatch = text.match(/^Status:\s*(.+)/i);
    if (statusMatch) { status = parseStatus(statusMatch[1]); break; }
  }

  const sections = splitByHeading(nodes, 2);

  // User story text (## Story)
  const storySection = sections.find((s) =>
    s.heading.toLowerCase() === "story" || s.heading.toLowerCase().includes("user story")
  );
  const description = storySection ? extractUserStoryText(storySection.children) : "";

  // Acceptance criteria
  const acSection = sections.find((s) => s.heading.toLowerCase().includes("acceptance criteria"));
  let acceptanceCriteria: AcceptanceCriteria[] = [];
  if (acSection) {
    // Try numbered AC first (new format), fall back to checkboxes (old format)
    acceptanceCriteria = extractNumberedAC(acSection.children);
    if (acceptanceCriteria.length === 0) {
      const subSections = splitByHeading(acSection.children, 3);
      if (subSections.length > 0) {
        for (const sub of subSections) acceptanceCriteria.push(...extractCheckboxes(sub.children));
      } else {
        acceptanceCriteria = extractCheckboxes(acSection.children);
      }
    }
  }

  // Tasks
  const taskSection = sections.find((s) => s.heading.toLowerCase().includes("task"));
  const tasks = taskSection ? extractTasks(taskSection.children) : [];

  const meta = extractMetadata(nodes);

  return {
    id: titleMatch[1],
    title: titleMatch[2].trim(),
    description,
    acceptanceCriteria,
    tasks,
    status,
    priority: meta["Priority"],
    epicRef: meta["Epic"],
    sourceFile: filePath,
  };
}

// ─── Old BMAD story parser ──────────────────────────────────────────
// Backward compat with the Portalyr-style files

function parseOldStoryFile(content: string, filePath: string): UserStory | null {
  const tree = parseMarkdown(normalizeContent(content));
  const nodes = tree.children;

  const h1 = nodes.find((n) => n.type === "heading" && (n as Heading).depth === 1);
  if (!h1) return null;
  const titleText = toString(h1);
  const titleMatch = titleText.match(/^Story\s+([\d.]+):\s*(.+)/i);
  if (!titleMatch) return null;

  const meta = extractMetadata(nodes);
  const sections = splitByHeading(nodes, 2);

  const userStorySection = sections.find((s) => s.heading.toLowerCase().includes("user story") || s.heading.toLowerCase() === "story");
  const description = userStorySection ? extractUserStoryText(userStorySection.children) : "";

  const acSection = sections.find((s) => s.heading.toLowerCase().includes("acceptance criteria"));
  let acceptanceCriteria: AcceptanceCriteria[] = [];
  if (acSection) {
    const subSections = splitByHeading(acSection.children, 3);
    if (subSections.length > 0) {
      for (const sub of subSections) acceptanceCriteria.push(...extractCheckboxes(sub.children));
    } else {
      acceptanceCriteria = extractCheckboxes(acSection.children);
    }
  }

  return {
    id: titleMatch[1],
    title: titleMatch[2].trim(),
    description,
    acceptanceCriteria,
    tasks: [],
    status: parseStatus(meta["Status"] ?? ""),
    priority: meta["Priority"],
    epicRef: meta["Epic"],
    sourceFile: filePath,
  };
}

function parseStoryFile(content: string, filePath: string): UserStory | null {
  // Detect format: new BMAD has plain "Status: xxx", old has "**Status:** xxx"
  const hasPlainStatus = /^Status:\s/m.test(content);
  if (hasPlainStatus) return parseNewStoryFile(content, filePath);
  return parseOldStoryFile(content, filePath);
}

// ─── Epic parsers ───────────────────────────────────────────────────

/** New BMAD: single epics.md with ## Epic N: and ### Story X.Y: */
function parseEpicsFile(content: string, filePath: string): Epic[] {
  const tree = parseMarkdown(normalizeContent(content));
  const h2Sections = splitByHeading(tree.children, 2);
  const epics: Epic[] = [];

  for (const section of h2Sections) {
    const epicMatch = section.heading.match(/^Epic\s+(\d+):\s*(.+)/i);
    if (!epicMatch) continue;

    const epicNum = epicMatch[1];
    const epicId = `EPIC-${epicNum.padStart(2, "0")}`;
    const description = section.children
      .filter((n) => n.type === "paragraph")
      .map((n) => toString(n))
      .filter((t) => !t.includes("As a") && !t.includes("I want to") && !t.includes("Acceptance Criteria"))
      .slice(0, 1)
      .join("\n")
      .trim();

    const h3Sections = splitByHeading(section.children, 3);
    const stories: UserStory[] = [];

    for (const ss of h3Sections) {
      const storyMatch = ss.heading.match(/^Story\s+([\d.]+):\s*(.+)/i);
      if (!storyMatch) continue;
      const storyDesc = extractUserStoryText(ss.children);
      const storyMeta = extractMetadata(ss.children);
      const acNodes = extractNodesAfterLabel(ss.children, "acceptance criteria");
      let ac: AcceptanceCriteria[] = [];
      if (acNodes.length > 0) {
        ac = extractNumberedAC(acNodes);
        if (ac.length === 0) ac = extractCheckboxes(acNodes);
      }

      stories.push({
        id: storyMatch[1],
        title: storyMatch[2].trim(),
        description: storyDesc,
        acceptanceCriteria: ac,
        tasks: [],
        status: parseStatus(storyMeta["Status"] ?? ""),
        priority: storyMeta["Priority"],
        sourceFile: filePath,
      });
    }

    epics.push({ id: epicId, title: epicMatch[2].trim(), description, stories });
  }

  return epics;
}

/** Old BMAD: separate epic files with # Epic N: */
function parseOldEpicFile(content: string, filePath: string): Epic | null {
  const tree = parseMarkdown(normalizeContent(content));
  const nodes = tree.children;
  const h1 = nodes.find((n) => n.type === "heading" && (n as Heading).depth === 1);
  if (!h1) return null;
  const titleText = toString(h1);
  const epicMatch = titleText.match(/^Epic\s+(\d+):\s*(.+)/i);
  if (!epicMatch) return null;

  const meta = extractMetadata(nodes);
  const h2Sections = splitByHeading(nodes, 2);
  const summarySection = h2Sections.find((s) => s.heading.toLowerCase().includes("epic summary"));
  const description = summarySection
    ? summarySection.children.filter((n) => n.type === "paragraph").map((n) => toString(n)).join("\n").trim()
    : "";

  const storiesSection = h2Sections.find((s) => s.heading.toLowerCase().includes("user stories"));
  const inlineStories: UserStory[] = [];
  if (storiesSection) {
    const h3Sections = splitByHeading(storiesSection.children, 3);
    for (const ss of h3Sections) {
      const storyMatch = ss.heading.match(/^Story\s+([\d.]+):\s*(.+)/i);
      if (!storyMatch) continue;
      const storyMeta = extractMetadata(ss.children);
      const storyDesc = extractUserStoryText(ss.children);
      const acNodes = extractNodesAfterLabel(ss.children, "acceptance criteria");
      const ac = extractCheckboxes(acNodes.length > 0 ? acNodes : ss.children);
      inlineStories.push({
        id: storyMatch[1], title: storyMatch[2].trim(), description: storyDesc,
        acceptanceCriteria: ac, tasks: [], status: parseStatus(storyMeta["Status"] ?? ""),
        priority: storyMeta["Priority"], sourceFile: filePath,
      });
    }
  }

  return {
    id: meta["Epic ID"] ?? `EPIC-${epicMatch[1].padStart(2, "0")}`,
    title: epicMatch[2].trim(), description, stories: inlineStories,
  };
}

// ─── Structure detection & main entry ───────────────────────────────

export interface ParseOptions { dir: string; mode?: "auto" | "bmad-new" | "bmad-old" | "flat"; }

function detectStructure(dir: string): "bmad-new" | "bmad-old" | "flat" {
  if (fs.existsSync(path.join(dir, "_bmad-output", "planning-artifacts"))) return "bmad-new";
  if (fs.existsSync(path.join(dir, "docs", "sprint-artifacts"))) return "bmad-old";
  return "flat";
}

export function parseBmadProject(opts: ParseOptions): BmadProject {
  const { dir } = opts;
  const mode = opts.mode === "auto" || !opts.mode ? detectStructure(dir) : opts.mode;
  const raw: Record<string, string> = {};
  const epics: Epic[] = [];
  const standaloneStories: UserStory[] = [];

  if (mode === "bmad-new") {
    const planDir = path.join(dir, "_bmad-output", "planning-artifacts");
    const implDir = path.join(dir, "_bmad-output", "implementation-artifacts");

    // Parse epics.md (single file with all epics)
    const epicsFile = path.join(planDir, "epics.md");
    if (fs.existsSync(epicsFile)) {
      const content = fs.readFileSync(epicsFile, "utf-8");
      raw[path.relative(dir, epicsFile)] = content;
      epics.push(...parseEpicsFile(content, epicsFile));
    }

    // Parse standalone story files
    for (const file of findMarkdownFiles(implDir)) {
      const content = fs.readFileSync(file, "utf-8");
      raw[path.relative(dir, file)] = content;
      const story = parseStoryFile(content, file);
      if (story) standaloneStories.push(story);
    }

  } else if (mode === "bmad-old") {
    const sprintDir = path.join(dir, "docs", "sprint-artifacts");
    for (const file of findMarkdownFiles(path.join(sprintDir, "epics"))) {
      const content = fs.readFileSync(file, "utf-8");
      raw[path.relative(dir, file)] = content;
      const epic = parseOldEpicFile(content, file);
      if (epic) epics.push(epic);
    }
    for (const file of findMarkdownFiles(path.join(sprintDir, "stories"))) {
      const content = fs.readFileSync(file, "utf-8");
      raw[path.relative(dir, file)] = content;
      const story = parseStoryFile(content, file);
      if (story) standaloneStories.push(story);
    }

  } else {
    for (const file of findMarkdownFiles(dir)) {
      const content = fs.readFileSync(file, "utf-8");
      raw[path.relative(dir, file)] = content;
      // Try as epic file first
      const parsedEpics = parseEpicsFile(content, file);
      if (parsedEpics.length > 0) { epics.push(...parsedEpics); continue; }
      const epic = parseOldEpicFile(content, file);
      if (epic) { epics.push(epic); continue; }
      const story = parseStoryFile(content, file);
      if (story) standaloneStories.push(story);
    }
  }

  // Merge standalone stories into parent epics
  for (const story of standaloneStories) {
    const epicNum = story.id.split(".")[0];
    const parentEpic = epics.find((e) => {
      const eNum = e.id.replace(/\D/g, "").replace(/^0+/, "");
      return eNum === epicNum;
    });
    if (parentEpic) {
      const existingIdx = parentEpic.stories.findIndex((s) => s.id === story.id);
      if (existingIdx >= 0) {
        const existing = parentEpic.stories[existingIdx];
        if (!story.status || story.status === "todo") story.status = existing.status;
        parentEpic.stories[existingIdx] = story;
      } else {
        parentEpic.stories.push(story);
      }
    }
  }

  for (const epic of epics) {
    epic.stories.sort((a, b) => {
      const aParts = a.id.split(".").map(Number);
      const bParts = b.id.split(".").map(Number);
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  }

  return { name: path.basename(path.resolve(dir)), epics, raw };
}

// ─── Write-back: status ─────────────────────────────────────────────

export function updateStoryStatus(
  project: BmadProject, epicId: string, storyId: string, newStatus: BoardStatus
): { ok: boolean; error?: string } {
  const epic = project.epics.find((e) => e.id === epicId);
  if (!epic) return { ok: false, error: "Epic not found" };
  const story = epic.stories.find((s) => s.id === storyId);
  if (!story) return { ok: false, error: "Story not found" };
  const filePath = story.sourceFile;
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: "Source file not found" };

  let content = fs.readFileSync(filePath, "utf-8");
  const hasWindows = content.includes("\r\n");
  const norm = content.replace(/\r\n/g, "\n");
  const mdStatus = statusToMarkdown(newStatus);

  let updated: string;
  // Try plain "Status: xxx" (new format)
  if (/^Status:\s/m.test(norm)) {
    updated = norm.replace(/^(Status:\s*)[^\n]*$/m, `$1${mdStatus}`);
  } else if (/^\*\*Status:\*\*/m.test(norm)) {
    updated = norm.replace(/^(\*\*Status:\*\*\s*)[^\n]*$/m, `$1${mdStatus}`);
  } else {
    // Insert status line after H1
    const lines = norm.split("\n");
    const h1Idx = lines.findIndex((l) => /^#\s+Story/i.test(l));
    if (h1Idx >= 0) {
      lines.splice(h1Idx + 1, 0, "", `Status: ${mdStatus}`);
      updated = lines.join("\n");
    } else {
      updated = norm;
    }
  }

  fs.writeFileSync(filePath, hasWindows ? updated.replace(/\n/g, "\r\n") : updated, "utf-8");
  story.status = newStatus;
  return { ok: true };
}

// ─── Write-back: toggle AC ──────────────────────────────────────────

export function toggleAcceptanceCriteria(
  project: BmadProject, epicId: string, storyId: string, acIndex: number, done: boolean
): { ok: boolean; error?: string } {
  const epic = project.epics.find((e) => e.id === epicId);
  if (!epic) return { ok: false, error: "Epic not found" };
  const story = epic.stories.find((s) => s.id === storyId);
  if (!story) return { ok: false, error: "Story not found" };
  const ac = story.acceptanceCriteria.find((a) => a.id === `AC-${acIndex}`);
  if (!ac) return { ok: false, error: `AC-${acIndex} not found` };
  const filePath = story.sourceFile;
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: "Source file not found" };

  let content = fs.readFileSync(filePath, "utf-8");
  const hasWindows = content.includes("\r\n");
  const norm = content.replace(/\r\n/g, "\n");
  const lines = norm.split("\n");
  const checkboxRe = /^(\s*-\s*)\[([ xX])\](.*)$/;
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(checkboxRe);
    if (m) {
      count++;
      if (count === acIndex) {
        lines[i] = m[1] + "[" + (done ? "x" : " ") + "]" + m[3];
        const updated = lines.join(hasWindows ? "\r\n" : "\n");
        fs.writeFileSync(filePath, updated, "utf-8");
        ac.done = done;
        return { ok: true };
      }
    }
  }
  return { ok: false, error: "Checkbox not found in file" };
}

// ─── Write-back: toggle Task ────────────────────────────────────────

export function toggleTask(
  project: BmadProject, epicId: string, storyId: string, taskId: string, done: boolean
): { ok: boolean; error?: string } {
  const epic = project.epics.find((e) => e.id === epicId);
  if (!epic) return { ok: false, error: "Epic not found" };
  const story = epic.stories.find((s) => s.id === storyId);
  if (!story) return { ok: false, error: "Story not found" };

  // Find task (might be a subtask like T1.2)
  let task: Task | undefined;
  for (const t of story.tasks) {
    if (t.id === taskId) { task = t; break; }
    if (t.subtasks) {
      const sub = t.subtasks.find((s) => s.id === taskId);
      if (sub) { task = sub; break; }
    }
  }
  if (!task) return { ok: false, error: `Task ${taskId} not found` };

  const filePath = story.sourceFile;
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: "Source file not found" };

  // Find the Nth checkbox that matches this task's description
  let content = fs.readFileSync(filePath, "utf-8");
  const hasWindows = content.includes("\r\n");
  const norm = content.replace(/\r\n/g, "\n");
  const lines = norm.split("\n");
  const checkboxRe = /^(\s*-\s*)\[([ xX])\](.*)$/;

  // Match by description text since task IDs are generated
  const descStart = task.description.slice(0, 40);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(checkboxRe);
    if (m && m[3].includes(descStart.slice(0, 20))) {
      lines[i] = m[1] + "[" + (done ? "x" : " ") + "]" + m[3];
      const updated = lines.join(hasWindows ? "\r\n" : "\n");
      fs.writeFileSync(filePath, updated, "utf-8");
      task.done = done;
      return { ok: true };
    }
  }
  return { ok: false, error: "Checkbox not found in file" };
}
