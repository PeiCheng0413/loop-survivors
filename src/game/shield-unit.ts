import { SHIELD } from "../config";
import type { Script } from "../script/ast";
import { buildShield, distanceToSegment, type ShieldShape } from "./shield";
import type { Enemy, Player } from "./types";

/**
 * 幾何護盾 —— **獨立於武器的插件**（見 docs/DECISIONS.md §9b）。
 *
 * 不論裝備哪一把武器，護盾都存在，形狀由它自己的那段積木腳本決定。
 * 所以它自成一個模組，不依賴任何武器或攻擊腳本的狀態 ——
 * 之後新增武器時，這裡完全不需要跟著改。
 *
 * 它只需要知道「玩家在哪」與「敵人有哪些」，其餘一概不管。
 */
export class ShieldUnit {
  /** 目前的形狀。null 代表還沒有腳本 */
  shape: ShieldShape | null = null;
  hp = SHIELD.maxHp;
  /** 破盾後的剩餘恢復時間。> 0 代表護盾目前不存在 */
  down = 0;
  /** 剛擋下敵人時的閃光殘量，純視覺 */
  flash = 0;

  /**
   * 形狀是靜態幾何，只在腳本改動時算一次頂點 ——
   * 不需要每幀執行 VM，這也是護盾優於原本「飛行箭矢」設計的地方。
   */
  setScript(script: Script): void {
    this.shape = buildShield(script);
  }

  reset(): void {
    this.hp = SHIELD.maxHp;
    this.down = 0;
    this.flash = 0;
  }

  /** 形狀是否閉合。沒閉合就完全沒有護盾，不是「有缺口的護盾」 */
  get closed(): boolean {
    return this.shape !== null && this.shape.gap <= SHIELD.closeTolerance;
  }

  /** 護盾目前是否生效（有邊、沒破、且形狀閉合） */
  get active(): boolean {
    return this.shape !== null && this.shape.sides > 0 && this.down <= 0 && this.closed;
  }

  /**
   * 護盾提供的傷害加成。
   *
   * 邊數越多越強 —— 正 N 邊形的轉角是 360 ÷ N，邊數越多越難算，
   * 強度掛在邊數上剛好對應難度。
   */
  get damageBuff(): number {
    if (!this.active) return 1;
    return 1 + this.shape!.sides * SHIELD.buffPerSide;
  }

  /**
   * 把靠近的敵人彈開。
   *
   * 判定用「敵人離某條邊夠近」而不是多邊形內外 —— 缺口因此自然成立：
   * 沒有邊的地方就擋不住。不過閉合才會生效，所以缺口在正式遊戲中
   * 不會發生，這個寫法純粹是讓規則自洽、少一組特例。
   */
  update(dt: number, player: Player, enemies: Enemy[]): void {
    // 閃光每幀衰減，與護盾是否存在無關
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);

    if (this.down > 0) {
      this.down -= dt;
      if (this.down <= 0) this.hp = SHIELD.maxHp;
      return;
    }

    const shape = this.shape;
    if (!shape || shape.sides === 0 || !this.closed) return;

    const reach = shape.radius + 40;
    for (const e of enemies) {
      if (Math.hypot(e.x - player.x, e.y - player.y) > reach) continue;

      for (let i = 1; i < shape.points.length; i++) {
        const a = shape.points[i - 1];
        const b = shape.points[i];
        const hit = distanceToSegment(e.x - player.x, e.y - player.y, a.x, a.y, b.x, b.y);
        if (hit.dist > e.r + SHIELD.thickness) continue;

        // 推出邊界並彈開
        const push = e.r + SHIELD.thickness - hit.dist;
        e.x += hit.nx * push;
        e.y += hit.ny * push;
        e.knockX = hit.nx * SHIELD.knockback;
        e.knockY = hit.ny * SHIELD.knockback;

        this.hp -= SHIELD.hitCost * dt * 60;
        this.flash = 1;
        if (this.hp <= 0) {
          this.hp = 0;
          this.down = SHIELD.regenDelay;
          return;
        }
        break; // 一個敵人一幀只被一條邊彈開
      }
    }
  }
}
