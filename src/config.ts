/**
 * 所有可調常數集中在此。散落各處的魔術數字會讓平衡調整變成考古工作。
 */

/** 固定步長。遊戲邏輯一律以此推進，與畫面更新率脫鉤 */
export const STEP = 1 / 60;

/**
 * 每塊積木的執行成本（秒）。**本專案最重要的一個數字**。
 *
 * 一幀 16.67ms ÷ 4ms ≈ 每幀執行約 4 塊積木。
 * 小數字幾乎無感（8 次迴圈 ≈ 64ms，看起來是同時噴出的一朵花），
 * 大數字急速懲罰（9999 次要 80 秒，一輪都跑不完）。
 *
 * 規則線性、體感非線性 —— 學生不需被告知任何規則就會自己收斂到合理範圍。
 * 調整前請先讀 docs/DECISIONS.md §3 的成本曲線表。
 */
export const BLOCK_COST = 0.004;

/** 一輪腳本跑完後的冷卻（秒）。這讓「攻速」數值有意義 */
export const CYCLE_COOLDOWN = 0.35;

/** 迴圈次數上限。初始 8，之後由「迴圈上限 +2」升級卡提升 */
export const REPEAT_LIMIT = 8;

/** 全域子彈硬上限。工程保險，不對學生說明，純粹防止瀏覽器被打爆 */
export const MAX_BULLETS = 2000;

export const PLAYER = {
  radius: 12,
  speed: 220,
  maxHp: 100,
  /** 被敵人碰到後的無敵時間，避免一秒內被扣光 */
  invulnerable: 0.5,
};

export const BULLET = {
  speed: 420,
  size: 4,
  pierce: 0,
  damage: 6,
  /** 存活秒數。射程上限，也是清理離場子彈的保險 */
  life: 1.6,
};

export const ENEMY = {
  radius: 13,
  speed: 62,
  hp: 12,
  damage: 8,
  /** 敵人互相推擠的力道，避免全部疊在同一點變成一顆球 */
  separation: 90,
};

/** 生成節奏：每秒生成數 = base + time * growth，並受 cap 限制 */
export const SPAWN = {
  base: 2,
  growth: 0.35,
  cap: 26,
  /** 生成距離 = 螢幕對角線一半 + 這個緩衝，確保在畫面外出現 */
  margin: 80,
};

/** 碰撞用均勻網格的格寬。約為敵人直徑的 2～3 倍最有效率 */
export const GRID_CELL = 64;
