import { ref } from 'vue'
import { defineStore } from 'pinia'

export const themes = Object.freeze([
  'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave',
  'retro', 'cyberpunk', 'valentine', 'halloween', 'garden', 'forest', 'aqua',
  'lofi', 'pastel', 'fantasy', 'wireframe', 'black', 'luxury', 'dracula', 'cmyk',
  'autumn', 'business', 'acid', 'lemonade', 'night', 'coffee', 'winter', 'dim',
  'nord', 'sunset', 'caramellatte', 'abyss', 'silk',
])

export const useUiStore = defineStore('ui', () => {
  const savedTheme = globalThis.localStorage?.getItem('p6vc-theme')
  const theme = ref(themes.includes(savedTheme) ? savedTheme : 'corporate')
  const navigationOpen = ref(false)

  function applyTheme(value) {
    if (!themes.includes(value)) return
    theme.value = value
    document.documentElement.dataset.theme = value
    globalThis.localStorage?.setItem('p6vc-theme', value)
  }

  function closeNavigation() {
    navigationOpen.value = false
  }

  applyTheme(theme.value)
  return { theme, navigationOpen, applyTheme, closeNavigation }
})
