<script setup lang="ts">
import { computed } from 'vue'
import KanbanColumn from './KanbanColumn.vue'
import type { Epic, UserStory } from '../../types/index'

// ─── Props ───
const props = defineProps<{ epic: Epic | null }>()

// ─── Column Definitions ───
const COLUMNS = [
  { key: 'todo',   label: 'To Do',       colorVar: '--todo'   },
  { key: 'active', label: 'In Progress',  colorVar: '--active' },
  { key: 'review', label: 'Review',       colorVar: '--review' },
  { key: 'done',   label: 'Done',         colorVar: '--done'   },
] as const

type StatusKey = typeof COLUMNS[number]['key']

// ─── Stories grouped by status ───
const storiesByStatus = computed<Record<StatusKey, UserStory[]>>(() => {
  const groups: Record<string, UserStory[]> = { todo: [], active: [], review: [], done: [] }
  if (!props.epic) return groups as Record<StatusKey, UserStory[]>
  for (const story of props.epic.stories) {
    const key = story.status ?? 'todo'
    if (key in groups) groups[key].push(story)
    else groups['todo'].push(story)   // fallback for unknown status
  }
  return groups as Record<StatusKey, UserStory[]>
})
</script>

<template>
  <div v-if="epic" class="kanban-board">
    <KanbanColumn
      v-for="col in COLUMNS"
      :key="col.key"
      :status="col.key"
      :label="col.label"
      :color-var="col.colorVar"
      :stories="storiesByStatus[col.key]"
      :epic-id="epic.id"
    />
  </div>
  <div v-else class="board-empty">
    Select an epic from the sidebar
  </div>
</template>

<style scoped>
.kanban-board {
  display: flex;
  gap: 1rem;
  padding: 1.5rem;
  height: 100%;
  overflow-x: auto;
}

.board-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-2);
  font-size: 0.9rem;
}
</style>
