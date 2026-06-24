import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // <--- 必须引入
import path from "path"


export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // <--- 必须在插件列表中启用
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // 暂时移除 alias 配置，等你接入 Assistant UI 时再加回来
  build: {
    target: 'esnext',
  },
})
