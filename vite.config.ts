import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 数据由 `pnpm sync` 写入 public/，开发与构建都直接以静态文件提供。
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
