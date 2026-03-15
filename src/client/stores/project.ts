import { defineStore } from 'pinia'
import type { BmadProject } from '../../types/index'

// ─── Project Store ───
export const useProjectStore = defineStore('project', {
  state: () => ({
    project: null as BmadProject | null,
    selectedEpicId: null as string | null,
  }),
  getters: {
    epics: (state) => state.project?.epics ?? [],
    selectedEpic: (state) =>
      state.project?.epics.find((e) => e.id === state.selectedEpicId) ?? null,
    commitMappings: (state) => state.project?.commitMappings ?? [],
  },
  actions: {
    setProject(data: BmadProject) {
      this.project = data
      if (data.epics.length > 0 && !this.selectedEpicId) {
        this.selectedEpicId = data.epics[0].id
      }
    },
    selectEpic(epicId: string) {
      this.selectedEpicId = epicId
    },
    async updateStoryStatus(epicId: string, storyId: string, status: string): Promise<void> {
      // ─── Optimistic Update ───
      const epic = this.project?.epics.find(e => e.id === epicId)
      const story = epic?.stories.find(s => s.id === storyId)
      if (!story) return
      const previousStatus = story.status
      story.status = status
      // ─── API Sync ───
      try {
        const res = await fetch(
          `/api/epics/${encodeURIComponent(epicId)}/stories/${encodeURIComponent(storyId)}/status`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
          }
        )
        if (!res.ok) {
          story.status = previousStatus
        }
      } catch {
        story.status = previousStatus
      }
    },
    async toggleAC(epicId: string, storyId: string, acIndex: number, done: boolean): Promise<void> {
      // ─── Optimistic Update ───
      const epic = this.project?.epics.find(e => e.id === epicId)
      const story = epic?.stories.find(s => s.id === storyId)
      const ac = story?.acceptanceCriteria[acIndex]
      if (!ac) return
      const previousDone = ac.done
      ac.done = done
      // ─── API Sync ───
      // Server uses 1-based index matching AC-1, AC-2 … so add 1 to the 0-based array index
      const apiIndex = acIndex + 1
      try {
        const res = await fetch(
          `/api/epics/${encodeURIComponent(epicId)}/stories/${encodeURIComponent(storyId)}/ac/${apiIndex}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) }
        )
        if (!res.ok) { ac.done = previousDone }
      } catch {
        ac.done = previousDone
      }
    },
    async toggleTask(epicId: string, storyId: string, taskId: string, done: boolean): Promise<void> {
      // ─── Optimistic Update ───
      const epic = this.project?.epics.find(e => e.id === epicId)
      const story = epic?.stories.find(s => s.id === storyId)
      // Search top-level tasks first, then nested subtasks
      let task = story?.tasks.find(t => t.id === taskId)
      if (!task && story) {
        for (const t of story.tasks) {
          const sub = t.subtasks?.find(s => s.id === taskId)
          if (sub) { task = sub; break }
        }
      }
      if (!task) return
      const previousDone = task.done
      task.done = done
      // ─── API Sync ───
      try {
        const res = await fetch(
          `/api/epics/${encodeURIComponent(epicId)}/stories/${encodeURIComponent(storyId)}/task/${encodeURIComponent(taskId)}`,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) }
        )
        if (!res.ok) { task.done = previousDone }
      } catch {
        task.done = previousDone
      }
    },
  },
})
