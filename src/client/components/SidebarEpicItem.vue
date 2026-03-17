<template>
  <div class="epic-item">
    <div
      class="epic-row"
      :class="{ active: isActive }"
      @click="$emit('select')"
    >
      <button
        class="chevron"
        :aria-label="isExpanded ? 'Collapse' : 'Expand'"
        @click.stop="$emit('toggle')"
      >{{ isExpanded ? '▼' : '▶' }}</button>
      <span class="epic-title"><span class="item-id">{{ epic.id }} ·</span> {{ epic.title }}</span>
    </div>
    <div v-if="isExpanded" class="story-list">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Epic } from '../../types/index'

// ─── Props ───
defineProps<{
  epic: Epic
  isExpanded: boolean
  isActive: boolean
}>()

// ─── Emits ───
defineEmits<{
  (e: 'toggle'): void
  (e: 'select'): void
}>()
</script>

<style scoped>
.epic-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  cursor: pointer;
  color: var(--text-1);
  border-left: 2px solid transparent;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background 0.1s;
}

.epic-row:hover {
  background: var(--bg-2);
}

.epic-row.active {
  border-left-color: var(--accent);
  background: var(--accent-dim);
  color: var(--text-0);
}

.chevron {
  background: none;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  font-size: 0.6rem;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  line-height: 1;
  flex-shrink: 0;
}

.chevron:hover {
  color: var(--text-0);
  background: var(--bg-3);
}

.epic-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-id {
  color: var(--text-2);
  font-size: 0.75rem;
  font-weight: 400;
  flex-shrink: 0;
}

.story-list {
  /* story items indent via their own padding-left: 32px */
}
</style>
