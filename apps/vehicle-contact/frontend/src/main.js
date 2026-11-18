import { createApp } from 'vue'
import App from './App.vue'
import { pinia } from './app/pinia.js'
import { router } from './router/index.js'
import './styles.css'

createApp(App).use(pinia).use(router).mount('#app')

if (import.meta.env.DEV && import.meta.env.VITE_UI_PREVIEW === 'true') {
  import('axe-core').then(({ default: axe }) => { globalThis.axe = axe })
}
