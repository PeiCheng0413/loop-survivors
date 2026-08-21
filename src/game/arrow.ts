import { ARROW, BULLET, CYCLE_COOLDOWN } from "../config";
import type { Script } from "../script/ast";
import { ScriptRunner, type BulletOpts, type ScriptHost } from "../script/vm";
import type { World } from "./world";

const DEG = Math.PI / 180;

export interface TrailPoint {
  x: number;
  y: number;
  life: number;
}

/**
 * 飛行箭矢 —— 第二個可程式化的實體（見 docs/DECISIONS.md §9b）。
 *
 * **這一版是技術驗證原型**，目的只有一個：回答「雙腳本能不能運作」。
 * 正 n 邊形的判定與增益尚未實作。
 *
 * 它自動攻擊靠近的敵人，但**移動路徑**由一段獨立的積木腳本決定。
 * 位置以「相對玩家的偏移」儲存，這樣玩家走動時整個圖形會跟著平移，
 * 而不是被拖成一條線 —— 學生畫的形狀必須在移動中仍然看得出來。
 */
export class ArrowUnit implements ScriptHost {
  /** 相對玩家的偏移 */
  ox = 70;
  oy = 0;
  /** 目前朝向（度） */
  dir = 0;
  readonly runner: ScriptRunner;
  trail: TrailPoint[] = [];

  private world: World;
  private moveLeft = 0;
  private moveDir = 0;
  private fireTimer = 0;

  constructor(world: World, script: Script) {
    this.world = world;
    this.runner = new ScriptRunner(script, this, CYCLE_COOLDOWN);
  }

  get x(): number {
    return this.world.player.x + this.ox;
  }

  get y(): number {
    return this.world.player.y + this.oy;
  }

  setScript(script: Script): void {
    this.runner.reset(script);
    this.moveLeft = 0;
    this.trail.length = 0;
    // 回到起點，否則改腳本後圖形會從半途接下去，看不出形狀
    this.ox = 70;
    this.oy = 0;
    this.dir = 0;
  }

  // ---- ScriptHost ----------------------------------------------------

  /** 箭矢的自動攻擊不經過腳本，所以這裡不做事 */
  fire(): void {}

  aimAngle(_target: unknown, fallback: number): number {
    return fallback;
  }

  forward(distance: number): void {
    this.moveLeft = Math.abs(distance);
    // 負值代表後退
    this.moveDir = distance >= 0 ? this.dir : this.dir + 180;
  }

  right(degrees: number): void {
    this.dir += degrees;
  }

  // ---- 更新 -----------------------------------------------------------

  update(dt: number): void {
    this.runner.update(dt);
    this.runner.drainTrace();

    // VM 對「前進 N」計了 N ÷ speed 的時間，這裡以同樣的速度移動，
    // 兩者因此自然同步，不需要額外的對時機制
    if (this.moveLeft > 0) {
      const step = Math.min(this.moveLeft, ARROW.speed * dt);
      this.moveLeft -= step;
      this.ox += Math.cos(this.moveDir * DEG) * step;
      this.oy += Math.sin(this.moveDir * DEG) * step;
    }

    this.updateTrail(dt);
    this.autoFire(dt);
  }

  private updateTrail(dt: number): void {
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }
    const last = this.trail[this.trail.length - 1];
    // 只在移動足夠距離後才記點，避免靜止時堆積成一團
    if (!last || Math.hypot(last.x - this.x, last.y - this.y) > 6) {
      this.trail.push({ x: this.x, y: this.y, life: ARROW.trailLife });
    }
  }

  /**
   * 自動攻擊最近的敵人。
   *
   * 刻意不讓腳本控制開火：箭矢的腳本要專心處理「移動路徑」這一件事，
   * 混入發射會讓它變成第二把武器，而不是幾何練習。
   */
  private autoFire(dt: number): void {
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;

    const target = this.world.nearestEnemyTo(this.x, this.y);
    if (!target) return;

    this.fireTimer = ARROW.fireInterval;
    const a = Math.atan2(target.y - this.y, target.x - this.x);
    const opts: BulletOpts = {
      speed: ARROW.bulletSpeed,
      size: ARROW.bulletSize,
      pierce: 0,
      homing: false,
      explode: false,
      split: false,
      life: BULLET.life,
    };
    this.world.emitBullet(this.x, this.y, a, ARROW.damage, opts, 1);
  }
}
