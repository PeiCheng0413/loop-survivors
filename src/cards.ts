import { UPGRADE } from "./config";
import type { Editor } from "./editor";
import type { World } from "./game/world";

/**
 * 升級卡。
 *
 * 分兩類（見 docs/DECISIONS.md §7）：
 *   積木卡 → 進工具箱，學生自己決定插在腳本哪一層
 *   數值卡 → 進屬性面板，**不進腳本**
 *
 * 數值卡不進腳本是硬性規定：腳本區只放有控制流的真積木，學生看腳本時
 * 每一塊都跟程式邏輯有關，認知不會被稀釋。
 */
export interface CardContext {
  world: World;
  editor: Editor;
}

export interface Card {
  id: string;
  kind: "block" | "stat";
  name: string;
  desc: string;
  /** 回傳 false 代表這張卡目前不可抽（例如稀有積木已達上限） */
  available(ctx: CardContext): boolean;
  apply(ctx: CardContext): void;
}

/** 同一種稀有積木最多能擁有幾個 */
const RARE_LIMIT = 3;

const CARDS: Card[] = [
  {
    id: "block_homing",
    kind: "block",
    name: "追蹤彈",
    desc: "獲得一塊「子彈改為追蹤」積木。之後發射的子彈會轉向最近的敵人",
    available: (c) => c.editor.rareCount("ls_homing") < RARE_LIMIT,
    apply: (c) => c.editor.unlockBlock("ls_homing"),
  },
  {
    id: "block_explode",
    kind: "block",
    name: "爆裂彈",
    desc: "獲得一塊「子彈改為爆裂」積木。命中時炸開，波及周圍敵人",
    available: (c) => c.editor.rareCount("ls_explode") < RARE_LIMIT,
    apply: (c) => c.editor.unlockBlock("ls_explode"),
  },
  {
    id: "block_split",
    kind: "block",
    name: "分裂彈",
    desc: "獲得一塊「子彈改為分裂」積木。命中後分成兩發往兩側散開",
    available: (c) => c.editor.rareCount("ls_split") < RARE_LIMIT,
    apply: (c) => c.editor.unlockBlock("ls_split"),
  },
  {
    id: "stat_capacity",
    kind: "stat",
    // 容量卡是「程式空間」的成長，跟威力卡競爭 ——
    // 要更多施展空間，還是更強的數值？這個取捨本身就是教學點
    name: `腳本容量 +${UPGRADE.capacity}`,
    desc: "攻擊腳本可以多放兩塊積木",
    available: () => true,
    apply: (c) => c.editor.addCapacity(UPGRADE.capacity),
  },
  {
    id: "stat_damage",
    kind: "stat",
    name: `傷害 +${Math.round(UPGRADE.damage * 100)}%`,
    desc: "所有子彈的傷害提升",
    available: () => true,
    apply: (c) => {
      // 加算而非乘算：乘算疊十幾層會指數爆炸
      c.world.stats.damage += UPGRADE.damage;
    },
  },
  {
    id: "stat_cooldown",
    kind: "stat",
    name: "攻速提升",
    desc: "每輪腳本之間的冷卻縮短（效果遞減，永遠不會歸零）",
    available: () => true,
    apply: (c) => {
      c.world.stats.haste += 1;
      c.world.refreshCooldown();
    },
  },
  {
    id: "stat_move",
    kind: "stat",
    name: `移動速度 +${Math.round(UPGRADE.moveSpeed * 100)}%`,
    desc: "走得更快，也更容易去撿經驗球",
    available: () => true,
    apply: (c) => {
      c.world.stats.moveSpeed += UPGRADE.moveSpeed;
    },
  },
  {
    id: "stat_pickup",
    kind: "stat",
    name: `拾取範圍 +${Math.round(UPGRADE.pickup * 100)}%`,
    desc: "經驗球從更遠的地方就會飛過來",
    available: () => true,
    apply: (c) => {
      c.world.stats.pickup += UPGRADE.pickup;
    },
  },
];

/**
 * 抽三張卡，**保底一張積木卡**。
 *
 * 保底的理由：每次升級都該有「這塊該插哪一層」的思考。若三張全是數值卡，
 * 那次升級就只是數字變大，學生完全不用碰腳本 —— 那是把教學機會浪費掉。
 */
export function drawCards(ctx: CardContext, count = 3): Card[] {
  const pool = CARDS.filter((c) => c.available(ctx));
  const blocks = pool.filter((c) => c.kind === "block");
  const picked: Card[] = [];

  if (blocks.length > 0) picked.push(pickRandom(blocks));

  const rest = pool.filter((c) => !picked.includes(c));
  while (picked.length < count && rest.length > 0) {
    const card = pickRandom(rest);
    picked.push(card);
    rest.splice(rest.indexOf(card), 1);
  }

  // 洗牌，免得積木卡永遠出現在第一張、學生養成無腦按 1 的習慣
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[j]] = [picked[j], picked[i]];
  }
  return picked;
}

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
