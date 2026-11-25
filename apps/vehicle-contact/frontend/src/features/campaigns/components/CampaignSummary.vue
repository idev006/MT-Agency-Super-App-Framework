<script setup>
import { computed } from 'vue'
import { campaignDisplayName } from '../../../domain/campaigns/campaign-link.js'
import { formatBangkokDateTime } from '../../../domain/time/bangkok-date-time.js'
import { campaignState } from '../../common/useOneTimeSecretGuard.js'

// D2: the head of the campaign drawer — name, state, window (Bangkok time) and quota.
const props = defineProps({ campaign: { type: Object, required: true } })
const state = computed(() => campaignState(props.campaign))
const progress = computed(() => Math.min(100, Math.round((Number(props.campaign.submittedCount) / Math.max(1, Number(props.campaign.maxSubmissions))) * 100)))
</script>

<template>
  <section class="card card-border bg-base-100 shadow-none"><div class="card-body gap-3 p-5">
    <div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-semibold">{{ campaignDisplayName(campaign) }}</h3><span class="badge" :class="state.tone">{{ state.label }}</span></div>
    <p class="text-sm text-base-content/80">{{ formatBangkokDateTime(campaign.startsAt) }} – {{ formatBangkokDateTime(campaign.endsAt) }} (เวลาไทย)</p>
    <div><div class="flex justify-between text-sm"><span>รับแล้ว</span><span class="font-medium">{{ campaign.submittedCount }} / {{ campaign.maxSubmissions }}</span></div><progress class="progress progress-primary mt-1 w-full" :value="progress" max="100" :aria-label="`รับแล้ว ${campaign.submittedCount} จาก ${campaign.maxSubmissions}`"></progress></div>
  </div></section>
</template>
