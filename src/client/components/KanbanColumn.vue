<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '../stores/project'
import KanbanCard from './KanbanCard.vue'
import type { UserStory } from '../../types/index'

// ─── Props ───
const props = defineProps<{
  status: string
  label: string
  colorVar: string
  stories: UserStory[]
  epicId: string
}>()

// ─── Drop Zone State ───
const store = useProjectStore()
const isDragOver = ref(false)

function onDragEnter(event: DragEvent): void {
  event.preventDefault()
  isDragOver.value = true
}

function onDragLeave(event: DragEvent): void {
  // Only clear highlight if leaving the column entirely, not entering a child element
  if (!( event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
    isDragOver.value = false
  }
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  event.dataTransfer!.dropEffect = 'move'
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  isDragOver.value = false
  const payload = event.dataTransfer!.getData('text/plain')
  if (!payload) return
  const [epicId, storyId] = payload.split('|')
  if (!epicId || !storyId) return
  // Guard no-op drop (same column)
  const story = props.stories.find(s => s.id === storyId)
  if (story && story.status === props.status) return
  await store.updateStoryStatus(epicId, storyId, props.status)
}

// ─── Column story count ───
const storyCount = computed(() => props.stories.length)
</script>

<template>
  <div class="kanban-col">
    <div class="kanban-col-header">
      <span class="col-dot" :style="{ background: `var(${colorVar})` }" />
      <span class="col-label">{{ label }}</span>
      <span class="col-count">{{ storyCount }}</span>
    </div>
    <div
      class="kanban-col-body"
      :class="{ 'drag-over': isDragOver }"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      <KanbanCard
        v-for="story in stories"
        :key="story.id"
        :story="story"
        :epic-id="epicId"
      />
      <div v-if="stories.length === 0" class="col-empty">No stories</div>
    </div>
  </div>
</template>

<style scoped>
.kanban-col {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 180px;
  background: var(--bg-1);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.kanban-col-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border);
}

.col-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.col-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-1);
  flex: 1;
}

.col-count {
  font-size: 0.75rem;
  color: var(--text-2);
  background: var(--bg-3);
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
}

.kanban-col-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  flex: 1;
  min-height: 80px;
  transition: background 0.15s;
}

.kanban-col-body.drag-over {
  background: var(--accent-dim);
}

.col-empty {
  font-size: 0.78rem;
  color: var(--text-2);
  text-align: center;
  padding: 1rem 0;
}
</style>
