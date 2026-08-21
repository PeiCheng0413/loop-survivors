import type { EnemyKind } from "../config";

export interface Player {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  /** 上次移動方向（度）。給「方向設為 移動方向」積木用 */
  moveDir: number;
  /** 剩餘無敵時間 */
  invuln: number;
}

export interface Enemy {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  kind: EnemyKind;
  damage: number;
  /** 傷害門檻：單發低於此值完全無效 */
  armor: number;
  /**
   * 魔法護盾：短時間內要命中這麼多次才能破盾，在那之前完全無敵。
   * 0 代表沒有護盾。
   *
   * 與 armor 刻意考不同的東西：armor 考單發威力（空間），
   * 這個考時間內的節奏（時間）—— 兩者要求相反的積木排列。
   */
  shieldHits: number;
  /** 累積命中的有效時間（秒）。超過就歸零重來 */
  shieldWindow: number;
  /** 目前已累積幾次命中 */
  hitsTaken: number;
  /** 距離上次命中過了多久，超過 shieldWindow 就重置 */
  hitTimer: number;
  xp: number;
  /** 受擊閃白的剩餘時間 —— 打到東西的手感有一半來自這個 */
  hit: number;
  /**
   * 傷害被裝甲擋下的閃爍時間。
   *
   * 必須跟一般受擊分開表現：學生要能一眼看出「我打中了但沒有用」，
   * 否則他只會覺得敵人很硬，不會意識到那是門檻機制、更不會想到要改程式。
   */
  blocked: number;
  /** 被護盾彈開的速度，會快速衰減 */
  knockX: number;
  knockY: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  /** 還能穿透幾個敵人。0 = 命中即消失 */
  pierce: number;
  /** 發射當下的蓄力倍率。傷害已經算進去了，這裡留著是為了畫面表現 */
  charge: number;
  life: number;
  homing: boolean;
  explode: boolean;
  split: boolean;
}

/** 敵人掉落的經驗球 */
export interface Gem {
  x: number;
  y: number;
  value: number;
}

/**
 * 升級卡累積出來的角色屬性。全部是倍率，基準 1。
 *
 * 這些數值**不進腳本**（見 docs/DECISIONS.md §7）：腳本區只放有控制流的
 * 真積木，學生看腳本時每一塊都跟程式邏輯有關，認知不被稀釋。
 */
export interface Stats {
  damage: number;
  moveSpeed: number;
  pickup: number;
  /** 攻速堆疊數。冷卻 = 基準 ÷ (1 + haste × 這個值)，遞減但永不歸零 */
  haste: number;
}
