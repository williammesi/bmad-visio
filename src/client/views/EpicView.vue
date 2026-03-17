<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '../stores/project'
import KanbanBoard from '../components/KanbanBoard.vue'

// ─── Derive epic from route param ───
const route = useRoute()
const store = useProjectStore()

const epic = computed(() =>
  store.epics.find(e => e.id === route.params.epicId) ?? null
)
</script>

<template>
  <KanbanBoard :epic="epic" />
</template>
