/**
 * 無頭模擬器 —— 不開瀏覽器就能量測腳本的實際輸出。
 *
 * 這是 M4 調平衡的主要工具：眼睛看畫面只能得到「好像太弱」，
 * 這支腳本給的是「每秒 19.2 發、10 秒殺 1 隻」這種可以拿來比較的數字。
 * 改完 config.ts 的任何數值就重跑一次，差異一目瞭然。
 *
 *   npm run sim          預設每張腳本模擬 10 秒
 *   npm run sim -- 30    模擬 30 秒
 *
 * 同時它也是時間成本模型的迴歸測試：若「預測週期」與「實測週期」開始
 * 對不上，代表 VM 的計時邏輯被改壞了（見 docs/DECISIONS.md §3）。
 */
import { BLOCK_COST, CYCLE_COOLDOWN, STEP, UPGRADE } from "../src/config";
import { countBlocks, countExpanded, countFires, type Node, type Script } from "../src/script/ast";
import { World } from "../src/game/world";
import type { Input } from "../src/game/input";
import { PRESETS } from "../src/script/presets";

/**
 * 粗略的自動走位。
 *
 * 站著不動量不到成長曲線 —— 玩家不動就撿不到經驗球，永遠不會升級，
 * 而升級節奏正是最需要打磨的東西。這個 AI 做兩件事：遠離最近的敵人、
 * 靠近最近的經驗球，兩者加權相加。
 *
 * 它當然打不過真人，但**一致**：調整任何數值後重跑，差異來自數值本身
 * 而不是操作好壞。量測要的是可比較，不是最佳解。
 */
function autoPilot(world: World): Input {
  return {
    axis: () => {
      const p = world.player;
      let x = 0;
      let y = 0;

      let nearest = Infinity;
      for (const e of world.enemies) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < nearest) nearest = d;
        if (d < 140 && d > 0) {
          // 越近的敵人推力越強
          const w = (1 - d / 140) ** 2;
          x -= ((e.x - p.x) / d) * w;
          y -= ((e.y - p.y) / d) * w;
        }
      }

      let bestGem = Infinity;
      let gx = 0;
      let gy = 0;
      for (const g of world.gems) {
        const d = Math.hypot(g.x - p.x, g.y - p.y);
        if (d < bestGem) {
          bestGem = d;
          gx = (g.x - p.x) / (d || 1);
          gy = (g.y - p.y) / (d || 1);
        }
      }
      // 沒有立即危險時才去撿球
      const greed = nearest > 90 ? 0.9 : 0.25;
      x += gx * greed;
      y += gy * greed;

      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
    justPressed: () => false,
    endFrame: () => {},
  } as unknown as Input;
}

interface Result {
  name: string;
  blocks: number;
  capacity: number;
  expanded: number;
  firesPerCycle: number;
  cycles: number;
  fired: number;
  damage: number;
  mobility: number;
  kills: number;
  hp: number;
  level: number;
  survived: number;
  predictedCycleMs: number;
  actualCycleMs: number;
  msPerStep: number;
}

function simulate(script: Script, seconds: number): Result {
  const world = new World(script);
  world.setViewport(1280, 720);

  let fired = 0;
  let damage = 0;
  const realFire = world.fire.bind(world);
  world.fire = (dir, opts) => {
    const before = world.bullets.length;
    realFire(dir, opts);
    // 蓄力倍率在 fire() 裡才算出來，只能從剛生出來的子彈上讀回
    if (world.bullets.length > before) {
      fired++;
      damage += world.bullets[world.bullets.length - 1].damage;
    }
  };

  const input = autoPilot(world);
  const steps = Math.round(seconds / STEP);
  const t0 = performance.now();
  let survived = seconds;
  for (let i = 0; i < steps; i++) {
    if (world.dead) {
      survived = world.time;
      break;
    }
    world.step(STEP, input);
    // 模擬玩家會選卡：一律挑第一張，才不會卡在待升級狀態影響後續數據
    while (world.pendingLevelUps > 0) {
      world.pendingLevelUps--;
      // 與實際卡片一致的加算幅度，否則量到的是模擬器自己的通貨膨脹
      world.stats.damage += UPGRADE.damage;
    }
  }
  const elapsed = performance.now() - t0;

  return {
    name: script.name,
    blocks: countBlocks(script.body),
    capacity: script.capacity,
    expanded: countExpanded(script.body),
    firesPerCycle: countFires(script.body),
    cycles: world.runner.cycles,
    fired,
    damage,
    mobility: world.mobilityMultiplier,
    kills: world.kills,
    hp: world.player.hp,
    level: world.level,
    survived,
    predictedCycleMs: predictCycleMs(script.body),
    actualCycleMs: (survived / Math.max(1, world.runner.cycles)) * 1000,
    msPerStep: elapsed / steps,
  };
}

/**
 * 依設計推算一輪腳本該花多久。
 * 注意巢狀迴圈：內層迴圈每次被進入都要付一次進入成本，
 * 所以是 (內層積木數 + 1) × 外層次數，不是單純相加。
 */
function predictCycleMs(nodes: Node[]): number {
  let seconds = CYCLE_COOLDOWN;
  const walk = (list: Node[], mult: number) => {
    for (const node of list) {
      seconds += BLOCK_COST * mult;
      if (node.kind === "wait") seconds += node.seconds * mult;
      if (node.kind === "repeat") walk(node.body, mult * node.times);
    }
  };
  walk(nodes, 1);
  return seconds * 1000;
}

function pad(s: string | number, n: number): string {
  const str = String(s);
  // 中文字在等寬終端機佔兩格，要另外算才對得齊
  const width = [...str].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return str + " ".repeat(Math.max(0, n - width));
}

const seconds = Number(process.argv[2]) || 10;
console.log(`\n積木成本 ${BLOCK_COST * 1000}ms　·　週期冷卻 ${CYCLE_COOLDOWN * 1000}ms　·　每張腳本模擬 ${seconds} 秒\n`);
console.log(
  pad("腳本", 12) + pad("容量", 10) + pad("每輪發數", 10) + pad("展開格數", 10) +
  pad("週期(預測/實測)", 20) + pad("每秒發數", 9) + pad("每發傷害", 10) +
  pad("每秒傷害", 10) + pad("移速", 7) + pad("擊殺", 6) + pad("等級", 6) + pad("存活", 8),
);
console.log("─".repeat(104));

for (const script of PRESETS) {
  const r = simulate(script, seconds);
  console.log(
    pad(r.name, 12) +
    pad(`${r.blocks}/${r.capacity}`, 10) +
    pad(r.firesPerCycle, 10) +
    pad(r.expanded, 10) +
    pad(`${r.predictedCycleMs.toFixed(0)} / ${r.actualCycleMs.toFixed(0)}ms`, 20) +
    pad((r.fired / r.survived).toFixed(1), 9) +
    pad((r.damage / Math.max(1, r.fired)).toFixed(1), 10) +
    pad((r.damage / r.survived).toFixed(1), 10) +
    pad(`${Math.round(r.mobility * 100)}%`, 7) +
    pad(r.kills, 6) +
    pad(r.level, 6) +
    pad(r.survived >= seconds ? "撐完" : `${r.survived.toFixed(0)}s`, 8),
  );
}

// 極端腳本：確認「重複很多次」既不會卡死主執行緒，也不會變成最優解
console.log("\n─ 極端腳本 ─");
const evil: Script = {
  name: "重複 9999 次",
  capacity: 99,
  body: [{ kind: "repeat", id: "e1", times: 9999, body: [{ kind: "fire", id: "e2" }] }],
};
const r = simulate(evil, seconds);
console.log(
  `  ${r.name}：${seconds} 秒內完成 ${r.cycles} 輪、發射 ${r.fired} 發、擊殺 ${r.kills}\n` +
  `  → 次數被 REPEAT_LIMIT 夾住，未卡死主執行緒`,
);

console.log(`\n效能：每步模擬 ${r.msPerStep.toFixed(3)}ms（60fps 的預算是 ${(STEP * 1000).toFixed(1)}ms）\n`);
