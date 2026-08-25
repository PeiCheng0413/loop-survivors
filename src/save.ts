import type { Identity } from "./sharecode";
import type { RunRecord } from "./records";

/**
 * 存檔裡存什麼。
 *
 * ## 只存「玩來的資源」，不存「怎麼運用資源」
 *
 * 存：打贏幾隻王、拿到幾個腳本槽、各種稀有積木有幾個。
 * **不存腳本本身。**
 *
 * 理由是教學的：**重寫才會記住**。學生下一節課重新把迴圈拖出來，
 * 是在做提取練習（retrieval practice），那正是記憶形成的地方 ——
 * 存下腳本等於幫他跳過最有價值的那一段。
 *
 * 而資源是「玩」換來的，重玩一次要再花好幾分鐘，重複拿沒有學習意義，
 * 所以該存。**分界線是：靠時間換到的存起來，靠思考換到的重做一遍。**
 */
export interface SaveData {
  /** 格式版本。v1 存過腳本，v2 起只存資源 */
  v: 2;
  id: Identity;
  /** 已擊殺的王數量 —— 解鎖進度的依據 */
  bossKills: number;
  /** 已解鎖幾個腳本槽 */
  unlockedSlots: number;
  /** 各稀有積木的擁有量，例如 { ls_homing: 2 } */
  rareBlocks: Record<string, number>;
  best: RunRecord[];
  /** 產生時間，給老師核對用 */
  at: string;
}

const ID_KEY = "ls.identity";

/** 班級座號存在本機，學生只要填一次 */
export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(ID_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Identity;
      if (typeof parsed?.klass === "string" && typeof parsed?.seat === "string") return parsed;
    }
  } catch {
    // 壞掉就當作沒填過
  }
  return { klass: "", seat: "" };
}

export function saveIdentity(id: Identity): void {
  try {
    localStorage.setItem(ID_KEY, JSON.stringify(id));
  } catch {
    // 存不下來不影響這一次產生分享碼
  }
}

/** 分享碼裡的身分敘述，用來核對是不是本人的 */
export function describe(id: Identity): string {
  const klass = id.klass.trim() || "（未填班級）";
  const seat = id.seat.trim() || "（未填座號）";
  return `${klass} ${seat} 號`;
}

/**
 * 示範存檔：直接給資源，不給腳本。
 *
 * 課堂示範時用來跳過「先玩十分鐘賺解鎖」的步驟，直接展示
 * 兩個腳本槽與稀有積木長什麼樣 —— 但腳本仍然要當場寫，
 * 那正是要示範的東西。
 */
export function demoSave(): SaveData {
  return {
    v: 2,
    id: { klass: "示範班", seat: "0" },
    bossKills: 2,
    unlockedSlots: 2,
    rareBlocks: { ls_homing: 1, ls_explode: 1 },
    best: [],
    at: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
}
