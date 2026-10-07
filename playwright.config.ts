import {defineConfig} from "@playwright/test";
export default defineConfig({
 testDir:"./e2e",
 timeout:20_000,
 use:{baseURL:"http://127.0.0.1:4174",headless:true},
 webServer:{command:"npm run universal:web:build && node scripts/universal-web-server.mjs",url:"http://127.0.0.1:4174",reuseExistingServer:!process.env.CI,timeout:120_000},
});
