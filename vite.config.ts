import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // <--- 必须引入
import { viteStaticCopy } from 'vite-plugin-static-copy' // <--- Typst 必需
import path from "path"


export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // <--- 必须在插件列表中启用

    // ★★★ 这一段必须保留，否则 Typst 引擎无法启动 ★★★
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm',
          dest: 'assets'
        },
        {
          src: 'node_modules/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm',
          dest: 'assets'
        }
      ]
    }),
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