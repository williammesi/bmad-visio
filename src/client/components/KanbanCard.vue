<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import type { UserStory } from '../../types/index'

// ─── Props ───
const props = defineProps<{ story: UserStory; epicId: string }>()

// ─── Drag State ───
const isDragging = ref(false)

function onDragStart(event: DragEvent): void {
  isDragging.value = true
  event.dataTransfer!.setData('text/plain', `${props.epicId}|${props.story.id}`)
  event.dataTransfer!.effectAllowed = 'move'
}

function onDragEnd(): void {
  isDragging.value = false
}

// ─── Navigation ───
const router = useRouter()

function onClick(): void {
  router.push({ name: 'storyDetail', params: { epicId: props.epicId, storyId: props.story.id } })
}

// ─── Status Color ───
const STATUS_COLOR: Record<string, string> = {
  todo:   '--todo',
  active: '--active',
  review: '--review',
  done:   '--done',
}

function statusColorVar(status: string | undefined): string {
  return STATUS_COLOR[status ?? 'todo'] ?? '--todo'
}
</script>

<template>
  <div
    class="kanban-card"
    :class="{ 'is-dragging': isDragging }"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
    @click="onClick"
    :title="story.title"
  >
    <span
      class="status-dot"
      :style="{ background: `var(${statusColorVar(story.status)})` }"
    />
    <span class="card-title">{{ story.title }}</span>
  </div>
</template>

<style scoped>
.kanban-card {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.625rem 0.75rem;
  cursor: grab;
  transition: border-color 0.15s, opacity 0.15s;
  overflow: hidden;
  user-select: none;
}

.kanban-card:hover {
  border-color: var(--border-hover);
}

.kanban-card.is-dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.card-title {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
