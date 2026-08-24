/**
 * 本機成績紀錄（docs/DECISIONS.md §11：v1 零後端，存 localStorage）。
 *
 * 無盡模式的成績是**存活時間** —— 一條可以一直推的線，而推線的方法
 * 只有把程式寫得更好（走位的上限很快就到頂）。沒有紀錄的話，
 * 死亡就只是結束，不會變成「再來一局」的動機。
 */

const STORAGE_KEY = "ls.records";
/** 保留幾筆。太多會讓學生只看得到自己很久以前的成績，失去追趕感 */
const KEEP = 5;

export interface RunRecord {
  /** 存活秒數 —— 主要的排名依據 */
  time: number;
  kills: number;
  level: number;
  /** 撐過第幾輪循環 */
  round: number;
  /** 用的是哪張角色卡 */
  script: string;
  /** ISO 日期，只取到分鐘 */
  at: string;
}

export function loadRecords(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 舊格式或手動改壞的資料不該讓遊戲崩掉，過濾掉不合格的項目
    return parsed.filter(
      (r): r is RunRecord => typeof r === "object" && r !== null && typeof (r as RunRecord).time === "number",
    );
  } catch {
    return [];
  }
}

/** 存入一筆成績，回傳排序後的紀錄與這一筆的名次（0 代表新的最佳） */
export function saveRecord(record: RunRecord): { records: RunRecord[]; rank: number } {
  const records = [...loadRecords(), record].sort((a, b) => b.time - a.time).slice(0, KEEP);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 無痕模式或配額用盡：成績存不下來不該影響遊戲本身
  }
  return { records, rank: records.indexOf(record) };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * 併入外部來源的成績（分享碼帶進來的）。
 *
 * 合併而非覆蓋：學生換電腦讀檔時，兩邊的紀錄都該留著 ——
 * 直接覆蓋會讓他在這台機器上的成績憑空消失。
 */
export function mergeRecords(incoming: RunRecord[]): RunRecord[] {
  const seen = new Set<string>();
  const merged = [...loadRecords(), ...incoming]
    .filter((r) => {
      const key = `${r.at}|${r.time}|${r.script}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, KEEP);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // 同上：存不下來不影響遊戲
  }
  return merged;
}
