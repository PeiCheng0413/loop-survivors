/**
 * 敵人與階段輪替。
 *
 * 敵人的差異刻意做成**結構性**而非數值性 —— 每一種都逼出一種積木排列，
 * 這是本作的核心賣點（見 docs/DECISIONS.md §9a）。新增敵人時請先確認
 * 它逼出的排列與既有的不重複，否則只是多一種血量不同的靶子。
 */

export const ENEMY = {
  radius: 13,
  speed: 62,
  hp: 12,
  damage: 8,
  /**
   * 敵人血量每分鐘的成長倍率。
   *
   * 血量固定的話，蓄力與高規格子彈的優勢永遠發揮不出來 —— 打 12 血的雜魚，
   * 15 點傷害有兩成溢出浪費，多打的部分完全沒有意義，於是「多而弱」
   * 永遠優於「少而強」，build 分化就死了一半。血量隨時間長大之後，
   * 高單發流才有登場的舞台（見 docs/DECISIONS.md §5b 的但書）。
   */
  hpGrowthPerMinute: 0.28,
  /** 敵人互相推擠的力道，避免全部疊在同一點變成一顆球 */
  separation: 90,
};

/** 生成節奏：每秒生成數 = base + time * growth，並受 cap 限制 */
export type EnemyKind = "swarm" | "armor" | "boss";

/**
 * 敵人原型。差異刻意做成**結構性**的，而不只是血量高低 ——
 * 只有質變（完全打不動）才逼得動玩家去改程式排列（見 docs/DECISIONS.md §9a）。
 */
export const ENEMY_KINDS: Record<EnemyKind, {
  radius: number;
  speed: number;
  hp: number;
  damage: number;
  /** 傷害門檻：低於此值的單發傷害**完全無效**，不是減傷 */
  armor: number;
  xp: number;
}> = {
  // 數量取勝，血極少 —— 散射迴圈一次掃一片
  swarm: { radius: 11, speed: 76, hp: 9, damage: 6, armor: 0, xp: 1 },
  // 傷害門檻 9：連射流的弱子彈完全打不動，必須用等待蓄力換單發威力
  armor: { radius: 18, speed: 38, hp: 60, damage: 14, armor: 9, xp: 5 },
  // 單一目標 —— 散射有七成子彈射進空氣，定向連射才打得動
  boss: { radius: 44, speed: 30, hp: 2600, damage: 26, armor: 14, xp: 60 },
};

export interface Phase {
  /** 這個階段從第幾秒開始 */
  at: number;
  name: string;
  /** 預告時給玩家的提示 —— 直接說出該怎麼改排列，不要讓學生猜 */
  hint: string;
  kind: EnemyKind;
  /** 生成速率相對基準的倍率 */
  rateMul: number;
  /** 只生成固定數量（王） */
  once?: number;
}

/**
 * 階段輪替。每次切換都是一個重新編程的時刻，一局四次。
 *
 * §9 原本是「五分鐘到出王」，那樣整局只換一次排列，不足以成為節奏。
 */
export const PHASES: Phase[] = [
  {
    at: 0,
    name: "蟲群",
    hint: "數量多、血量低。散射迴圈能一次掃到一片",
    kind: "swarm",
    rateMul: 1,
  },
  {
    at: 90,
    name: "裝甲兵",
    hint: "傷害低於門檻完全無效。把「等待」放進迴圈蓄力，換少而重的子彈",
    kind: "armor",
    rateMul: 0.22,
  },
  {
    at: 130,
    name: "蟲群再臨",
    hint: "更密集的蟲群。把旋轉拖回迴圈，重新掃射",
    kind: "swarm",
    rateMul: 1.35,
  },
  {
    at: 215,
    name: "裝甲部隊",
    hint: "裝甲兵變多了。單發威力不夠就完全打不動",
    kind: "armor",
    rateMul: 0.34,
  },
  {
    at: 250,
    name: "王",
    hint: "只有一個目標。用「方向設為最近的敵人」＋純發射迴圈，別讓子彈射進空氣",
    kind: "boss",
    rateMul: 0,
    once: 1,
  },
];

export const SPAWN = {
  base: 3,
  growth: 0.34,
  cap: 30,
  /** 生成距離 = 螢幕對角線一半 + 這個緩衝，確保在畫面外出現 */
  margin: 80,
};
