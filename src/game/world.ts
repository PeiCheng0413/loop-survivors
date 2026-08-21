import {
  BULLET, CHARGE, CYCLE_COOLDOWN, ENEMY, EXPLODE, GEM, HOMING_TURN_RATE,
  ENEMY_KINDS, MAX_BULLETS, MOBILITY, PHASES, PLAYER, SPAWN, SPLIT, UPGRADE, xpForLevel,
  type Phase,
} from "../config";
import { scriptSpec, type Script } from "../script/ast";
import type { AimTarget } from "../script/ast";
import { ScriptRunner, type BulletOpts, type ScriptHost } from "../script/vm";
import { ArrowUnit } from "./arrow";
import { EnemyGrid } from "./collision";
import type { Bullet, Enemy, Gem, Player, Stats } from "./types";
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
  gems: Gem[] = [];
  runner: ScriptRunner;

  time = 0;
  kills = 0;
  dead = false;

  level = 1;
  xp = 0;
  /** 還沒被玩家處理掉的升級次數。主迴圈看到 > 0 就暫停並跳卡片 */
  pendingLevelUps = 0;
  stats: Stats = { damage: 1, moveSpeed: 1, pickup: 1, haste: 0 };

  /** 視窗尺寸，決定敵人要在多遠的畫面外生成 */
  private viewW = 1280;
  private viewH = 720;
  private spawnAccum = 0;
  private grid = new EnemyGrid();
  private phaseIndex = -1;
  /** 剛切換到的階段，等主迴圈取走去做預告與自動暫停 */
  private phaseAlert: Phase | null = null;
  private onceSpawned = 0;
  /** 王的參考，給 HUD 畫血條 */
  boss: Enemy | null = null;
  /** 飛行箭矢（§9b 驗證原型）。尚未做成解鎖，開局就存在 */
  arrow: ArrowUnit | null = null;
  /** 由腳本規格換算出的移動速度倍率。火力換機動 */
  private mobility = 1;

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
    this.mobility = computeMobility(script);
  }

  /** 設定箭矢的路徑腳本。第一次呼叫時才建立箭矢 */
  setArrowScript(script: Script): void {
    if (!this.arrow) this.arrow = new ArrowUnit(this, script);
    else this.arrow.setScript(script);
  }

  /** 腳本一改就要重算機動性，讓學生拖積木的當下就看得到移速變化 */
  setScript(script: Script): void {
    this.runner.reset(script);
    this.mobility = computeMobility(script);
  }

  /** 目前的移動速度倍率（火力換機動 × 升級卡加成），給 HUD 顯示 */
  get mobilityMultiplier(): number {
    return this.mobility * this.stats.moveSpeed;
  }

  get phase(): Phase {
    return PHASES[Math.max(0, this.phaseIndex)];
  }

  /**
   * 取走「階段剛切換」的通知。主迴圈用它來自動暫停並顯示預告。
   *
   * 不自動暫停的話，多數學生會硬打到死，根本不會發現可以改程式 ——
   * 而那正是整個機制的價值所在（見 docs/DECISIONS.md §9a）。
   */
  consumePhaseAlert(): Phase | null {
    const p = this.phaseAlert;
    this.phaseAlert = null;
    return p;
  }

  /** 屬性變動後要把冷卻同步進 runner */
  refreshCooldown(): void {
    // 遞減式：堆疊越多加成越小，但永遠不會把冷卻壓到零
    this.runner.setCooldown(CYCLE_COOLDOWN / (1 + UPGRADE.haste * this.stats.haste));
  }

  /** 升到下一級還需要多少經驗 */
  get xpNeeded(): number {
    return xpForLevel(this.level);
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
    this.gems.length = 0;
    this.level = 1;
    this.xp = 0;
    this.pendingLevelUps = 0;
    this.stats = { damage: 1, moveSpeed: 1, pickup: 1, haste: 0 };
    this.time = 0;
    this.kills = 0;
    this.dead = false;
    this.spawnAccum = 0;
    this.phaseIndex = -1;
    this.phaseAlert = null;
    this.onceSpawned = 0;
    this.boss = null;
    this.runner.reset(script);
    if (script) this.mobility = computeMobility(script);
  }

  // ---- ScriptHost ----------------------------------------------------

  fire(dirDeg: number, opts: BulletOpts): void {
    const a = dirDeg * DEG;
    const charge = chargeMultiplier(this.runner.consumeCharge());
    this.emitBullet(
      this.player.x + Math.cos(a) * this.player.r,
      this.player.y + Math.sin(a) * this.player.r,
      a,
      BULLET.damage * this.stats.damage,
      opts,
      charge,
    );
  }

  /**
   * 生成一發子彈。玩家與箭矢共用這條路徑，確保碰撞、上限、視覺
   * 三者的規則只有一份。
   */
  emitBullet(
    x: number,
    y: number,
    angleRad: number,
    damage: number,
    opts: BulletOpts,
    charge: number,
  ): void {
    // 硬上限是工程保險，不對學生說明。溢出時直接不生成，
    // 讓效能問題以「火力沒有變強」的形式呈現，而不是掉幀。
    if (this.bullets.length >= MAX_BULLETS) return;
    this.bullets.push({
      x,
      y,
      vx: Math.cos(angleRad) * opts.speed,
      vy: Math.sin(angleRad) * opts.speed,
      r: opts.size,
      damage: damage * charge,
      pierce: opts.pierce,
      life: opts.life,
      charge,
      homing: opts.homing,
      explode: opts.explode,
      split: opts.split,
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

  /** 給箭矢用的公開版本 */
  nearestEnemyTo(x: number, y: number): Enemy | null {
    return this.findNearest(x, y);
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
    this.arrow?.update(dt);
    this.moveBullets(dt);
    this.hitEnemies();
    this.collectGems(dt);
    this.hurtPlayer(dt);
  }

  private movePlayer(dt: number, input: Input): void {
    const a = input.axis();
    if (a.x !== 0 || a.y !== 0) {
      const speed = PLAYER.speed * this.mobility * this.stats.moveSpeed;
      this.player.x += a.x * speed * dt;
      this.player.y += a.y * speed * dt;
      this.player.moveDir = Math.atan2(a.y, a.x) / DEG;
    }
  }

  private spawn(dt: number): void {
    // 階段推進：找出目前時間所屬的階段，變了就發預告
    let index = 0;
    for (let i = 0; i < PHASES.length; i++) {
      if (this.time >= PHASES[i].at) index = i;
    }
    if (index !== this.phaseIndex) {
      this.phaseIndex = index;
      this.onceSpawned = 0;
      // 第一個階段是開局狀態，不需要預告打斷
      if (index > 0) this.phaseAlert = PHASES[index];
    }

    const phase = PHASES[index];
    const proto = ENEMY_KINDS[phase.kind];
    const radius = Math.hypot(this.viewW, this.viewH) / 2 + SPAWN.margin;

    // 一次性生成（王）
    if (phase.once) {
      while (this.onceSpawned < phase.once) {
        this.onceSpawned++;
        const e = this.makeEnemy(phase, proto, radius);
        this.enemies.push(e);
        if (phase.kind === "boss") this.boss = e;
      }
      return;
    }

    const rate =
      Math.min(SPAWN.cap, SPAWN.base + this.time * SPAWN.growth) * phase.rateMul;
    this.spawnAccum += rate * dt;
    while (this.spawnAccum >= 1) {
      this.spawnAccum -= 1;
      this.enemies.push(this.makeEnemy(phase, proto, radius));
    }
  }

  private makeEnemy(
    phase: Phase,
    proto: (typeof ENEMY_KINDS)[keyof typeof ENEMY_KINDS],
    radius: number,
  ): Enemy {
    const a = Math.random() * Math.PI * 2;
    // 血量隨時間成長，讓高單發傷害的 build 到中後期才有舞台
    const hp = proto.hp * (1 + (this.time / 60) * ENEMY.hpGrowthPerMinute);
    return {
      x: this.player.x + Math.cos(a) * radius,
      y: this.player.y + Math.sin(a) * radius,
      r: proto.radius,
      hp,
      maxHp: hp,
      kind: phase.kind,
      damage: proto.damage,
      armor: proto.armor,
      xp: proto.xp,
      speed: proto.speed * (0.85 + Math.random() * 0.3),
      hit: 0,
      blocked: 0,
    };
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
      if (e.blocked > 0) e.blocked -= dt;
    }
  }

  private moveBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (b.homing) this.steer(b, dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) this.swapRemove(this.bullets, i);
    }
  }

  /**
   * 追蹤彈轉向最近的敵人。
   *
   * 限制轉向速率而非直接指向目標：無腦制導會讓「方向旋轉」「面向敵人」
   * 這些積木全部失去意義，佈陣的樂趣也一起消失。有轉向上限的話，
   * 追蹤是「補正」而不是「代替瞄準」。
   */
  private steer(b: Bullet, dt: number): void {
    const target = this.findNearest(b.x, b.y);
    if (!target) return;
    const desired = Math.atan2(target.y - b.y, target.x - b.x);
    const current = Math.atan2(b.vy, b.vx);
    let delta = desired - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const maxTurn = HOMING_TURN_RATE * DEG * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, delta));
    const speed = Math.hypot(b.vx, b.vy);
    const next = current + turn;
    b.vx = Math.cos(next) * speed;
    b.vy = Math.sin(next) * speed;
  }

  private findNearest(x: number, y: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    this.grid.forEachNear(x, y, 320, (i) => {
      const e = this.enemies[i];
      if (!e) return;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    });
    return best;
  }

  /**
   * 分裂彈命中後往兩側各分出一發。
   *
   * 分出來的子彈 split 為 false —— 否則會無限連鎖分裂，一發變成指數爆炸，
   * 瞬間打爆子彈上限也打爆效能。
   */
  private splitAt(b: Bullet): void {
    const base = Math.atan2(b.vy, b.vx);
    const speed = Math.hypot(b.vx, b.vy);
    for (const sign of [-1, 1]) {
      if (this.bullets.length >= MAX_BULLETS) return;
      const a = base + sign * SPLIT.angle * DEG;
      this.bullets.push({
        x: b.x,
        y: b.y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: Math.max(1, b.r * SPLIT.sizeRatio),
        damage: b.damage * SPLIT.damageRatio,
        pierce: 0,
        life: b.life * SPLIT.lifeRatio,
        charge: b.charge,
        homing: b.homing,
        explode: false,
        split: false,
      });
    }
  }

  /** 爆裂彈命中時波及周圍敵人 */
  private explodeAt(x: number, y: number, damage: number): void {
    const rr = EXPLODE.radius ** 2;
    this.grid.forEachNear(x, y, EXPLODE.radius, (i) => {
      const e = this.enemies[i];
      if (!e || e.hp <= 0) return;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > rr) return;
      e.hp -= damage * EXPLODE.damageRatio;
      e.hit = 0.08;
    });
  }

  /**
   * 撿經驗球。進入磁吸範圍就會自己飛過來 ——
   * 玩家該煩惱的是「要不要衝進敵群」，不是像素級的對準。
   */
  private collectGems(dt: number): void {
    const p = this.player;
    const magnet = GEM.magnetRadius * this.stats.pickup;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < magnet) {
        // 越靠近吸得越快，看起來像被吞進去而不是等速滑行
        const pull = GEM.magnetSpeed * (1 - d / magnet) * dt + 60 * dt;
        g.x += (dx / d) * pull;
        g.y += (dy / d) * pull;
      }
      if (d < p.r + GEM.radius) {
        this.xp += g.value;
        this.swapRemove(this.gems, i);
        while (this.xp >= this.xpNeeded) {
          this.xp -= this.xpNeeded;
          this.level++;
          this.pendingLevelUps++;
        }
      }
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
        // 傷害門檻是質變不是減傷：打不動就是完全打不動，
        // 學生才會意識到要改程式而不是繼續硬打
        if (b.damage < e.armor) {
          e.blocked = 0.12;
          consumed = b.pierce <= 0;
          if (b.pierce > 0) b.pierce -= 1;
          return;
        }
        e.hp -= b.damage;
        e.hit = 0.08;
        if (b.explode) this.explodeAt(b.x, b.y, b.damage);
        if (b.split) this.splitAt(b);
        if (b.pierce > 0) b.pierce -= 1;
        else consumed = true;
      });
      if (consumed) this.swapRemove(this.bullets, i);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].hp <= 0) {
        const e = this.enemies[i];
        if (e === this.boss) this.boss = null;
        this.gems.push({ x: e.x, y: e.y, value: e.xp });
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
        p.hp -= e.damage;
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

/**
 * 間隔換算成傷害倍率。連射趨近下限，等待滿 fullTime 達到上限。
 *
 * 這讓「等待」從純虧的積木變成真正的工具：少而強 vs 多而弱，兩種 build
 * 的總輸出接近，靠覆蓋面與單體威力分化 —— 打成群小兵要爆發，打硬目標要精準。
 */
function chargeMultiplier(gap: number): number {
  const t = Math.min(1, gap / CHARGE.fullTime);
  return CHARGE.min + (CHARGE.max - CHARGE.min) * t;
}

/**
 * 由腳本規格換算移動速度倍率。
 *
 * 負載為 0（全部維持預設規格）時倍率為 1。提高規格要用機動性支付，
 * 降低規格則換到更快的走位 —— 後者是完全正當的另一種 build，不是懲罰。
 */
function computeMobility(script: Script): number {
  const spec = scriptSpec(script.body, {
    speed: BULLET.speed,
    size: BULLET.size,
    pierce: BULLET.pierce,
    life: BULLET.life,
  });

  const load =
    MOBILITY.speedWeight * ((spec.speed - BULLET.speed) / BULLET.speed) +
    MOBILITY.sizeWeight * ((spec.size - BULLET.size) / BULLET.size) +
    (MOBILITY.pierceWeight * (spec.pierce - BULLET.pierce)) / 2 +
    MOBILITY.lifeWeight * ((spec.life - BULLET.life) / BULLET.life);

  const rate = load >= 0 ? MOBILITY.penaltyPerLoad : MOBILITY.bonusPerLoad;
  return Math.max(MOBILITY.minMultiplier, Math.min(MOBILITY.maxMultiplier, 1 - load * rate));
}
