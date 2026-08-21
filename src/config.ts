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

/**
 * 蓄力：子彈傷害隨「距上一發的間隔」成長。
 *
 * 這是「等待」積木的存在理由。在此之前它是唯一放了就純虧的積木 ——
 * 散彈手加一塊迴圈內的等待 0.1 秒，週期從 418ms 變 1218ms，DPS 掉到三分之一，
 * 沒有任何補償，於是永遠不會有人用，八塊積木實際只有七塊。
 *
 * 它的教學價值在於**位置會產生巨大差異**：等待放在迴圈內，每一發都滿蓄力；
 * 放在迴圈外，只有第一發受惠。這跟巢狀迴圈教的是同一件事，換了個維度。
 */
export const CHARGE = {
  /** 連續發射（間隔趨近 0）時的傷害倍率下限 */
  min: 0.45,
  /** 蓄滿時的傷害倍率上限 */
  max: 2.6,
  /** 蓄滿所需的間隔（秒）。超過這個時間再等也不會更強 */
  fullTime: 0.3,
};

/**
 * 火力換機動：子彈規格越高，角色移動越慢。
 *
 * 在此之前速度／大小／穿透三塊積木都是「設到最大就對了」，沒有取捨就沒有
 * 策略，學生拖完一次就再也不會思考它們。現在提高規格要用生存能力支付 ——
 * 而且反向也成立：自願降規格可以換到更快的走位。
 *
 * 負載取腳本中**出現過的最高值**，不是實際發射時的值：這樣學生無法用
 * 「設高再設回來」鑽漏洞，規則也維持可預測（拖積木當下就看得到移速變化）。
 */
export const MOBILITY = {
  /** 各項規格對負載的權重 */
  speedWeight: 0.5,
  sizeWeight: 0.6,
  pierceWeight: 1.15,
  /** 存活時間換算射程，一樣要付機動代價 */
  lifeWeight: 0.55,
  /** 負載換算成移速的比率。懲罰與獎勵不對稱，降規格的回報較高 */
  penaltyPerLoad: 0.12,
  bonusPerLoad: 0.25,
  minMultiplier: 0.4,
  maxMultiplier: 1.3,
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

/** 碰撞用均勻網格的格寬。約為敵人直徑的 2～3 倍最有效率 */
export const GRID_CELL = 64;

/**
 * 積木高亮的餘輝衰減時間（秒）。積木被執行時熱度衝到 1，然後在這段時間內退回 0。
 *
 * 為什麼需要餘輝：一塊積木只佔 4ms，畫面每 16.7ms 才畫一次 —— 實測每幀跑掉
 * 6 塊積木，直接畫「當前積木」等於每幀隨機抽一塊來亮，六分之五的執行是隱形的。
 *
 * 0.2 是實際比對 0／0.12／0.2／0.3／0.45 後選定的，理由見 docs/DECISIONS.md §3a。
 *
 * 現在由左上角的監視器使用（render/monitor.ts）。Blockly 那側不再做餘輝 ——
 * 積木面板只在暫停時出現，而暫停時 VM 沒有執行，那條路徑走不到。
 */
export const HEAT_DECAY = 0.2;

/** 積木編輯器面板寬度（px） */
export const EDITOR_WIDTH = 400;

/**
 * 經驗球：敵人死亡後掉落，玩家要走過去撿。
 *
 * 為什麼不自動入袋：撿球讓「走位」從純粹的閃避變成資源獲取手段 ——
 * 玩家必須在「安全地待著」與「衝進敵群撿球」之間做取捨，
 * 而這正是走位有樂趣的來源。
 */
export const GEM = {
  radius: 5,
  /** 磁吸範圍。進入後會自己飛過來，避免玩家為了一顆球做像素級走位 */
  magnetRadius: 74,
  magnetSpeed: 460,
  value: 1,
};

/**
 * 升級卡的堆疊幅度。**一律用加算而非乘算。**
 *
 * 乘算會指數爆炸：傷害每級 ×1.2 疊 18 層是 26 倍，攻速 ×0.85 疊 18 層等於
 * 快 20 倍 —— 實測就是這樣把每秒傷害推到 1231。加算是線性成長，
 * 後期仍有感但不會失控。
 */
export const UPGRADE = {
  damage: 0.22,
  moveSpeed: 0.09,
  pickup: 0.3,
  /** 攻速用遞減式：冷卻 = 基準 ÷ (1 + haste × 堆疊數)，永遠不會歸零 */
  haste: 0.16,
  capacity: 2,
};

/**
 * 升級所需經驗：level 級升到下一級要幾顆球。
 *
 * 曲線要夠陡。每次升等都會暫停遊戲跳卡片，太頻繁的話一局會被打斷幾十次，
 * 節奏全毀 —— 而且學生根本來不及思考「這塊插哪」，升等反而變成干擾。
 * 目標是五分鐘一局升 15～20 級。
 */
export function xpForLevel(level: number): number {
  return 8 + level * 9;
}

/** 追蹤彈的最大轉向速率（度／秒）。太高會變成無腦制導，失去佈陣的意義 */
export const HOMING_TURN_RATE = 260;

/** 分裂彈：命中後往兩側各分出一發較小的子彈 */
export const SPLIT = {
  angle: 34,
  sizeRatio: 0.7,
  damageRatio: 0.5,
  lifeRatio: 0.6,
};

/** 爆裂彈的範圍與傷害比例 */
export const EXPLODE = {
  radius: 62,
  /** 相對於子彈本身傷害的比例 */
  damageRatio: 0.6,
};

/**
 * 幾何護盾（§9b）。學生畫出的封閉多邊形就是防禦邊界。
 *
 * 形狀是靜態的 —— 只在腳本改動時算一次頂點，不需要每幀運算。
 */
export const SHIELD = {
  /** 邊的厚度，也是碰撞判定的容差 */
  thickness: 7,
  /** 每擋下一個敵人消耗的血量 */
  hitCost: 4,
  maxHp: 60,
  /** 破盾後的恢復時間（秒） */
  regenDelay: 6,
  /** 敵人被彈開的速度 */
  knockback: 260,
  /** 路徑腳本的容量，與攻擊腳本各自獨立（見 §9b） */
  capacity: 10,
  /**
   * 每一條邊提供的傷害加成。邊數越多的正多邊形越難算
   * （轉角 = 360 ÷ N），所以強度直接掛在邊數上。
   */
  buffPerSide: 0.04,
  /**
   * 判定閉合的容差（像素）。超過就沒有 buff。
   *
   * 缺口本身已經有代價（敵人穿得過來），但若照樣給滿 buff，
   * 等於告訴學生「算錯也沒差」—— 幾何練習的意義就沒了。
   * 給不給是二分的，因為配合「還差幾度」的提示，
   * 明確的過與不過比模糊的部分給分更好教。
   */
  closeTolerance: 8,
};

/** 「前進 N」在攻擊腳本裡仍需要一個速度基準來計時 */
export const ARROW = {
  speed: 210,
};
