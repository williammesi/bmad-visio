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

export interface CommitMapping {
  sha: string;
  message: string;
  body: string;
  files: string[];
  date: string;
  storyId: string | null;
  score: number;
}

export interface BmadProject {
  name: string;
  epics: Epic[];
  raw: Record<string, string>;
  commitMappings?: CommitMapping[];
}
