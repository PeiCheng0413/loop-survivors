import type { Script } from "./script/ast";
import type { Identity } from "./sharecode";
import type { RunRecord } from "./records";

/**
 * 分享碼裡存什麼。
 *
 * ## 存「跨局的進度」，不存單局的即時狀態
 *
 * 存的是**學生寫過的程式與拿到的能力**：腳本槽、護盾形狀、解鎖數、最佳紀錄。
 * 不存等級、屬性、場上敵人這些單局狀態。
 *
 * 理由是 roguelike 的一局本身就是挑戰，中途存檔再讀回來會讓它失去意義；
 * 而且「讀檔後從第三輪的難度開始、血量全滿」在遊戲上也說不通。
 *
 * 學生真正怕失去的是**自己寫的腳本** —— 那可能花了整節課。換一台電腦、
 * 下週再上課，只要腳本和解鎖還在，就不算重頭來。
 */
export interface SaveData {
  /** 格式版本。之後改結構時用來判斷要不要轉換 */
  v: 1;
  id: Identity;
  /** 攻擊腳本的各個槽位（未解鎖的為 null） */
  slots: (Script | null)[];
  activeSlot: number;
  unlockedSlots: number;
  /** 護盾形狀的腳本 */
  shield: Script | null;
  /** 已擊殺的王數量 —— 解鎖進度的依據 */
  bossKills: number;
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
 * 示範存檔的內容。
 *
 * 直接在程式裡組出來，不必經過分享碼的字串傳遞 —— 長字串靠人工複製
 * 極易出錯（實測就發生過：同樣長度、同樣字元集，只錯一個字元）。
 * 老師課堂示範、或想快速看到「有兩個腳本槽長怎樣」時用得上。
 */
export function demoSave(shield: Script): SaveData {
  let n = 0;
  const id = () => `demo${++n}`;
  const spread: Script = {
    name: "散射流",
    capacity: 14,
    body: [
      {
        kind: "repeat", id: id(), times: 8,
        body: [
          { kind: "turn", id: id(), degrees: 45 },
          { kind: "fire", id: id() },
        ],
      },
    ],
  };
  const charged: Script = {
    name: "蓄力流",
    capacity: 14,
    body: [
      { kind: "aim", id: id(), target: "nearest" },
      {
        kind: "repeat", id: id(), times: 3,
        body: [
          { kind: "fire", id: id() },
          { kind: "wait", id: id(), seconds: 0.35 },
        ],
      },
    ],
  };

  return {
    v: 1,
    id: { klass: "示範班", seat: "0" },
    slots: [spread, charged, null],
    activeSlot: 0,
    unlockedSlots: 2,
    shield,
    bossKills: 2,
    best: [],
    at: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
}
