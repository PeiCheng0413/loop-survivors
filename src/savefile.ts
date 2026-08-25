import { formatTime } from "./records";
import { describe, type SaveData } from "./save";

/**
 * 存檔檔案（.md）。
 *
 * 為什麼不用複製貼上：五百多字元的隨機字串，學生複製時漏字、
 * 老師轉貼時被編輯器改字，都會讓存檔失效，而且**失敗時看不出哪裡錯**。
 * 檔案沒有這個問題。
 *
 * 為什麼是 Markdown 而不是 JSON：**老師不用開遊戲就能改作業**。
 * 檔案上半部是給人看的 —— 班級座號、成績、以及學生寫的腳本本身，
 * 用縮排排版出來，一眼就看得出他用了幾層迴圈。
 * 下半部才是給機器讀的存檔碼。
 */

/** 存檔碼那一行的開頭，解析時用它定位 */
const CODE_PREFIX = "LSV2";

const RARE_NAME: Record<string, string> = {
  ls_homing: "追蹤彈",
  ls_explode: "爆裂彈",
  ls_split: "分裂彈",
};

export function buildMarkdown(data: SaveData, code: string): string {
  const lines: string[] = [];
  lines.push(`# 迴圈生存者　存檔`);
  lines.push("");
  lines.push(`- **姓名**：${describe(data.id)}`);
  lines.push(`- **產生時間**：${data.at}`);
  lines.push("");

  lines.push("## 玩到的資源");
  lines.push("");
  lines.push(`- 打贏王：**${data.bossKills}** 隻`);
  lines.push(`- 腳本槽：**${data.unlockedSlots}** 個`);

  const rare = Object.entries(data.rareBlocks ?? {}).filter(([, n]) => n > 0);
  if (rare.length > 0) {
    lines.push(`- 稀有積木：`);
    for (const [type, n] of rare) {
      lines.push(`    - ${RARE_NAME[type] ?? type} ×${n}`);
    }
  } else {
    lines.push(`- 稀有積木：還沒有`);
  }

  const best = data.best[0];
  if (best) {
    lines.push("");
    lines.push("## 最佳成績");
    lines.push("");
    lines.push(`- ${formatTime(best.time)}（第 ${best.round} 輪，擊殺 ${best.kills}）`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("**這個存檔不包含腳本。** 資源是玩來的所以幫你留著，");
  lines.push("但程式要自己重寫一次 —— 重寫才會真的記住。");
  lines.push("");
  lines.push("以下是給遊戲讀取用的存檔碼，**請不要修改**：");
  lines.push("");
  lines.push("```");
  lines.push(code);
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

/** 從檔案內容裡找出存檔碼。允許老師在檔案裡加註解，只要那一行還在 */
export function extractCode(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith(CODE_PREFIX) && line.includes(".")) return line;
  }
  return null;
}

/** 觸發瀏覽器下載。純前端，不需要伺服器 */
export function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // 立刻釋放，否則每存一次就漏一份 blob
  URL.revokeObjectURL(url);
}

/** 檔名帶班級座號，老師收到一堆檔案時不必開啟就分得出是誰的 */
export function filenameFor(data: SaveData): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").trim() || "未填";
  return `迴圈生存者-${safe(data.id.klass)}-${safe(data.id.seat)}號.md`;
}
