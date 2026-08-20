import { defineConfig } from "vite";

export default defineConfig({
  // 相對路徑：GitHub Pages 的專案站點在 /loop-survivors/ 子路徑下，
  // 用 './' 就不必為了部署環境切換設定，本機、Pages、NAS 都同一份建置產物。
  // 這招成立的前提是本專案沒有前端路由（只有一個頁面）。
  base: "./",
});
