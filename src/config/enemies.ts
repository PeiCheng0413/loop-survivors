/**
 * 敵人與階段輪替。
 *
 * 敵人的差異刻意做成**結構性**而非數值性 —— 每一種都逼出一種積木排列，
 * 這是本作的核心賣點（見 docs/DECISIONS.md §9a）。新增敵人時請先確認
 * 它逼出的排列與既有的不重複，否則只是多一種血量不同的靶子。
 */

export type EnemyKind = "swarm" | "armor" | "shielded" | "rush" | "boss";

export const ENEMY = {
  radius: 13,
  speed: 62,
  hp: 12,
  damage: 8,
  /**
   * 敵人血量每分鐘的成長倍率。
   *
   * 血量固定的話，蓄力與高規格子彈的優勢永遠發揮不出來 —— 打 12 血的雜魚，
   * 15 點傷害有兩成溢出浪費，於是「多而弱」永遠優於「少而強」，
   * build 分化就死了一半。
   */
  hpGrowthPerMinute: 0.28,
  /** 敵人互相推擠的力道，避免全部疊在同一點變成一顆球 */
  separation: 90,
};

export const ENEMY_KINDS: Record<
  EnemyKind,
  {
    radius: number;
    speed: number;
    hp: number;
    damage: number;
    /** 傷害門檻：低於此值的單發傷害**完全無效**，不是減傷 */
    armor: number;
    /**
     * 魔法護盾：短時間內要命中這麼多次才能破盾，否則完全無敵。
     * 0 代表沒有護盾。
     */
    shieldHits: number;
    /** 累積命中的有效時間（秒）。超過就歸零重來 */
    shieldWindow: number;
    xp: number;
  }
> = {
  // 數量取勝，血極少 —— 散射迴圈一次掃一片
  swarm: {
    radius: 11, speed: 76, hp: 9, damage: 6,
    armor: 0, shieldHits: 0, shieldWindow: 0, xp: 1,
  },

  // 傷害門檻：連射流的弱子彈完全打不動，必須用等待蓄力換單發威力。
  // 考的是**單發威力**，屬於空間維度
  armor: {
    radius: 18, speed: 38, hp: 60, damage: 14,
    armor: 9, shieldHits: 0, shieldWindow: 0, xp: 5,
  },

  // 魔法護盾：短時間內命中三次才破盾。
  // 考的是**時間內的節奏**，屬於時間維度 —— 與裝甲兵要求相反的排列，
  // 所以兩者必須分在不同階段（見 docs/DECISIONS.md §9a）
  shielded: {
    radius: 16, speed: 52, hp: 42, damage: 12,
    armor: 0, shieldHits: 3, shieldWindow: 1.1, xp: 6,
  },

  // 極快、極多、極脆 —— 逼出「最多方向 × 最多子彈」的覆蓋型排列
  rush: {
    radius: 8, speed: 148, hp: 5, damage: 4,
    armor: 0, shieldHits: 0, shieldWindow: 0, xp: 1,
  },

  // 單一目標 —— 散射有七成子彈射進空氣，定向連射才打得動
  boss: {
    radius: 44, speed: 30, hp: 2600, damage: 26,
    armor: 14, shieldHits: 0, shieldWindow: 0, xp: 60,
  },
};

export interface Phase {
  name: string;
  /** 預告時給玩家的提示 —— 直接說出該怎麼改排列，不要讓學生猜 */
  hint: string;
  kind: EnemyKind;
  /** 這個階段持續幾秒 */
  duration: number;
  /** 生成速率相對基準的倍率 */
  rateMul: number;
  /** 只生成固定數量（王） */
  once?: number;
}

/**
 * 階段循環。跑完一輪就從頭再來，強度提升（見 docs/DECISIONS.md §9 無盡模式）。
 *
 * 王不是結局而是**節拍器**：每輪出現一次，標記「你又撐過一輪」。
 *
 * 第一輪的難度屬於**教學設施而非遊戲平衡** —— 撐不到第一隻王的學生
 * 就看不到核心賣點，所以前段刻意做得緩，王在兩分半內出現。
 */
export const PHASE_CYCLE: Phase[] = [
  {
    name: "蟲群",
    hint: "數量多、血量低。散射迴圈能一次掃到一片",
    kind: "swarm",
    duration: 55,
    rateMul: 1,
  },
  {
    name: "裝甲兵",
    hint: "傷害低於門檻完全無效。把「等待」放進迴圈蓄力，換少而重的子彈",
    kind: "armor",
    duration: 35,
    rateMul: 0.22,
  },
  {
    name: "疾行群",
    hint: "又快又多但很脆。要的是覆蓋面 —— 朝越多方向射出越多子彈越好",
    kind: "rush",
    duration: 30,
    rateMul: 1.5,
  },
  {
    name: "護盾兵",
    hint: "短時間內要命中三次才能破盾。用「方向設為最近的敵人」＋「重複 3 次發射」",
    kind: "shielded",
    duration: 32,
    rateMul: 0.3,
  },
  {
    name: "王",
    hint: "只有一個目標。定向連射，別讓子彈射進空氣",
    kind: "boss",
    duration: 45,
    rateMul: 0,
    once: 1,
  },
];

/**
 * 每完成一輪循環，敵人的血量與生成速率乘上這個倍率。
 *
 * 無盡模式需要無上限的成長，但成長太快會讓第二輪就變成撞牆 ——
 * 1.35 大約是「明顯變難但還能適應」的幅度。
 */
export const CYCLE_ESCALATION = 1.35;

/** 生成節奏：每秒生成數 = base + time * growth，並受 cap 限制 */
export const SPAWN = {
  base: 3,
  growth: 0.34,
  cap: 30,
  /** 生成距離 = 螢幕對角線一半 + 這個緩衝，確保在畫面外出現 */
  margin: 80,
};
