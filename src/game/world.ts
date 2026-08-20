import { BULLET, CYCLE_COOLDOWN, ENEMY, MAX_BULLETS, PLAYER, SPAWN } from "../config";
import type { Script } from "../script/ast";
import type { AimTarget } from "../script/ast";
import { ScriptRunner, type BulletOpts, type ScriptHost } from "../script/vm";
import { EnemyGrid } from "./collision";
import type { Bullet, Enemy, Player } from "./types";
import type { Input } from "./input";

const DEG = Math.PI / 180;

/**
 * 遊戲世界。所有狀態變更都發生在這裡 —— renderer 只讀不寫，
 * 這是「換掉渲染層不必動遊戲邏輯」的前提。
 *
 * World 同時是 VM 的 ScriptHost：積木透過這個介面發射子彈、查詢目標。
 */
export class World implements ScriptHost {
  player: Player;
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  runner: ScriptRunner;

  time = 0;
  kills = 0;
  dead = false;

  /** 視窗尺寸，決定敵人要在多遠的畫面外生成 */
  private viewW = 1280;
  private viewH = 720;
  private spawnAccum = 0;
  private grid = new EnemyGrid();

  constructor(script: Script) {
    this.player = {
      x: 0,
      y: 0,
      r: PLAYER.radius,
      hp: PLAYER.maxHp,
      maxHp: PLAYER.maxHp,
      moveDir: 0,
      invuln: 0,
    };
    this.runner = new ScriptRunner(script, this, CYCLE_COOLDOWN);
  }

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  reset(script?: Script): void {
    this.player.x = 0;
    this.player.y = 0;
    this.player.hp = PLAYER.maxHp;
    this.player.invuln = 0;
    this.enemies.length = 0;
    this.bullets.length = 0;
    this.time = 0;
    this.kills = 0;
    this.dead = false;
    this.spawnAccum = 0;
    this.runner.reset(script);
  }

  // ---- ScriptHost ----------------------------------------------------

  fire(dirDeg: number, opts: BulletOpts): void {
    // 硬上限是工程保險，不對學生說明。溢出時直接不生成，
    // 讓效能問題以「火力沒有變強」的形式呈現，而不是掉幀。
    if (this.bullets.length >= MAX_BULLETS) return;
    const a = dirDeg * DEG;
    this.bullets.push({
      x: this.player.x + Math.cos(a) * this.player.r,
      y: this.player.y + Math.sin(a) * this.player.r,
      vx: Math.cos(a) * opts.speed,
      vy: Math.sin(a) * opts.speed,
      r: opts.size,
      damage: BULLET.damage,
      pierce: opts.pierce,
      life: BULLET.life,
    });
  }

  aimAngle(target: AimTarget, fallback: number): number {
    switch (target) {
      case "moveDir":
        return this.player.moveDir;
      case "random":
        return Math.random() * 360;
      case "nearest": {
        const e = this.nearestEnemy();
        // 找不到敵人時保留原方向：腳本永遠不該因為場上沒目標就卡住或亂射
        if (!e) return fallback;
        return Math.atan2(e.y - this.player.y, e.x - this.player.x) / DEG;
      }
    }
  }

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      const d = (e.x - this.player.x) ** 2 + (e.y - this.player.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // ---- 模擬 ----------------------------------------------------------

  step(dt: number, input: Input): void {
    if (this.dead) return;
    this.time += dt;

    this.movePlayer(dt, input);
    this.spawn(dt);
    this.grid.rebuild(this.enemies);
    this.moveEnemies(dt);
    this.runner.update(dt); // 腳本推進 —— 子彈就是在這裡生出來的
    this.moveBullets(dt);
    this.hitEnemies();
    this.hurtPlayer(dt);
  }

  private movePlayer(dt: number, input: Input): void {
    const a = input.axis();
    if (a.x !== 0 || a.y !== 0) {
      this.player.x += a.x * PLAYER.speed * dt;
      this.player.y += a.y * PLAYER.speed * dt;
      this.player.moveDir = Math.atan2(a.y, a.x) / DEG;
    }
  }

  private spawn(dt: number): void {
    const rate = Math.min(SPAWN.cap, SPAWN.base + this.time * SPAWN.growth);
    this.spawnAccum += rate * dt;
    const radius = Math.hypot(this.viewW, this.viewH) / 2 + SPAWN.margin;
    while (this.spawnAccum >= 1) {
      this.spawnAccum -= 1;
      const a = Math.random() * Math.PI * 2;
      this.enemies.push({
        x: this.player.x + Math.cos(a) * radius,
        y: this.player.y + Math.sin(a) * radius,
        r: ENEMY.radius,
        hp: ENEMY.hp,
        speed: ENEMY.speed * (0.85 + Math.random() * 0.3),
        hit: 0,
      });
    }
  }

  private moveEnemies(dt: number): void {
    const { x: px, y: py } = this.player;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      let dx = px - e.x;
      let dy = py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;

      // 互相推擠：沒有這個的話所有敵人會疊成一顆球，看起來像只有一隻，
      // 玩家也無法用走位把敵群拉開 —— 那正是這類遊戲的核心樂趣。
      let sx = 0;
      let sy = 0;
      this.grid.forEachNear(e.x, e.y, e.r * 2, (j) => {
        if (j === i) return;
        const o = this.enemies[j];
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od > 0 && od < e.r + o.r) {
          sx += (ox / od) * (1 - od / (e.r + o.r));
          sy += (oy / od) * (1 - od / (e.r + o.r));
        }
      });

      e.x += (dx * e.speed + sx * ENEMY.separation) * dt;
      e.y += (dy * e.speed + sy * ENEMY.separation) * dt;
      if (e.hit > 0) e.hit -= dt;
    }
  }

  private moveBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) this.swapRemove(this.bullets, i);
    }
  }

  private hitEnemies(): void {
    this.grid.rebuild(this.enemies);
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let consumed = false;
      this.grid.forEachNear(b.x, b.y, b.r + ENEMY.radius, (j) => {
        if (consumed) return;
        const e = this.enemies[j];
        if (!e || e.hp <= 0) return;
        const rr = (b.r + e.r) ** 2;
        if ((b.x - e.x) ** 2 + (b.y - e.y) ** 2 > rr) return;
        e.hp -= b.damage;
        e.hit = 0.08;
        if (b.pierce > 0) b.pierce -= 1;
        else consumed = true;
      });
      if (consumed) this.swapRemove(this.bullets, i);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].hp <= 0) {
        this.swapRemove(this.enemies, i);
        this.kills++;
      }
    }
  }

  private hurtPlayer(dt: number): void {
    if (this.player.invuln > 0) {
      this.player.invuln -= dt;
      return;
    }
    const p = this.player;
    for (const e of this.enemies) {
      const rr = (p.r + e.r) ** 2;
      if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 <= rr) {
        p.hp -= ENEMY.damage;
        p.invuln = PLAYER.invulnerable;
        if (p.hp <= 0) {
          p.hp = 0;
          this.dead = true;
        }
        return;
      }
    }
  }

  /** 用尾端元素覆蓋被刪的位置。順序無關的陣列這樣刪最快 */
  private swapRemove<T>(arr: T[], i: number): void {
    const last = arr.pop()!;
    if (i < arr.length) arr[i] = last;
  }
}
