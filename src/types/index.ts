export interface AcceptanceCriteria {
  id: string;
  description: string;
  done: boolean;
}

export interface Task {
  id: string;
  description: string;
  done: boolean;
  subtasks?: Task[];
}

export interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriteria[];
  tasks: Task[];
  status?: string;      // "todo" | "active" | "review" | "done"
  priority?: string;
  epicRef?: string;
  sourceFile?: string;
}

export interface Epic {
  id: string;
  title: string;
  description: string;
  stories: UserStory[];
}

export interface SignalBreakdown {
  storyIdMatch: number;   // 1.0 if story ID referenced, else 0
  typeGate: number;       // 1.0 if conventional type matches, 0.5 if informal feature, else 0
  pathOverlap: number;    // Jaccard on file path tokens
  keyword: number;        // Jaccard on text tokens
  embedding: number;      // cosine similarity
  nli: number;            // zero-shot NLI score (0 if skipped)
  diffSignal: number;     // Jaccard on diff +line tokens vs story path tokens
}

export interface CommitMapping {
  sha: string;
  message: string;
  body: string;
  files: string[];
  date: string;
  storyId: string | null;
  score: number;
  signalBreakdown: SignalBreakdown;
  pipeline_version: string;
}

export interface BmadProject {
  name: string;
  epics: Epic[];
  raw: Record<string, string>;
  commitMappings?: CommitMapping[];
}
