import { ENEMY, ENEMY_KINDS, PHASES, SPAWN, type Phase } from "../config";
import type { Enemy, Player } from "./types";

/**
 * 敵人生成與階段輪替。
 *
 * 這是**調難度曲線時唯一要看的地方**：什麼時候換階段、每秒生幾隻、
 * 血量怎麼隨時間長大，全部在這裡。實際數值在 config/enemies.ts，
 * 這個檔案只負責「怎麼用那些數值」。
 *
 * 之所以從 World 抽出來：World 原本同時負責生成、移動、碰撞、經驗、護盾，
 * 而調平衡時真正要改的只有生成這一塊 —— 混在六百行裡很難找。
 */
export interface SpawnContext {
  /** 遊戲已經過的秒數。階段推進與血量成長都以它為準 */
  time: number;
  player: Player;
  viewW: number;
  viewH: number;
  /** 生成的敵人直接推進這個陣列 */
  enemies: Enemy[];
}

export class Spawner {
  private phaseIndex = -1;
  private alert: Phase | null = null;
  /** 一次性生成（王）已經生了幾隻。換階段時歸零 */
  private onceSpawned = 0;
  /** 生成速率的累積量，滿 1 就生一隻 */
  private accum = 0;

  get phase(): Phase {
    return PHASES[Math.max(0, this.phaseIndex)];
  }

  /**
   * 取走「階段剛切換」的通知。主迴圈用它來自動暫停並顯示預告。
   *
   * 不自動暫停的話，多數學生會硬打到死，根本不會發現可以改程式 ——
   * 而那正是整個機制的價值所在（見 docs/DECISIONS.md §9a）。
   */
  consumeAlert(): Phase | null {
    const p = this.alert;
    this.alert = null;
    return p;
  }

  reset(): void {
    this.phaseIndex = -1;
    this.alert = null;
    this.onceSpawned = 0;
    this.accum = 0;
  }

  /**
   * 推進階段並生成敵人。
   *
   * @returns 這一幀生成的王，沒有則為 null（World 要留著它畫血條）
   */
  update(dt: number, ctx: SpawnContext): Enemy | null {
    this.advancePhase(ctx.time);

    const phase = this.phase;
    const proto = ENEMY_KINDS[phase.kind];
    // 生成距離取螢幕對角線一半再加緩衝，確保敵人在畫面外出現
    const radius = Math.hypot(ctx.viewW, ctx.viewH) / 2 + SPAWN.margin;

    // 一次性生成（王）
    if (phase.once) {
      let boss: Enemy | null = null;
      while (this.onceSpawned < phase.once) {
        this.onceSpawned++;
        const e = this.makeEnemy(phase, proto, radius, ctx);
        ctx.enemies.push(e);
        if (phase.kind === "boss") boss = e;
      }
      return boss;
    }

    const rate = Math.min(SPAWN.cap, SPAWN.base + ctx.time * SPAWN.growth) * phase.rateMul;
    this.accum += rate * dt;
    while (this.accum >= 1) {
      this.accum -= 1;
      ctx.enemies.push(this.makeEnemy(phase, proto, radius, ctx));
    }
    return null;
  }

  /** 找出目前時間所屬的階段，變了就發預告 */
  private advancePhase(time: number): void {
    let index = 0;
    for (let i = 0; i < PHASES.length; i++) {
      if (time >= PHASES[i].at) index = i;
    }
    if (index === this.phaseIndex) return;

    this.phaseIndex = index;
    this.onceSpawned = 0;
    // 第一個階段是開局狀態，不需要預告打斷
    if (index > 0) this.alert = PHASES[index];
  }

  private makeEnemy(
    phase: Phase,
    proto: (typeof ENEMY_KINDS)[keyof typeof ENEMY_KINDS],
    radius: number,
    ctx: SpawnContext,
  ): Enemy {
    const a = Math.random() * Math.PI * 2;
    // 血量隨時間成長，讓高單發傷害的 build 到中後期才有舞台
    const hp = proto.hp * (1 + (ctx.time / 60) * ENEMY.hpGrowthPerMinute);
    return {
      x: ctx.player.x + Math.cos(a) * radius,
      y: ctx.player.y + Math.sin(a) * radius,
      r: proto.radius,
      hp,
      maxHp: hp,
      kind: phase.kind,
      damage: proto.damage,
      armor: proto.armor,
      xp: proto.xp,
      // 速度加一點隨機，敵群才不會像方陣一樣整齊推進
      speed: proto.speed * (0.85 + Math.random() * 0.3),
      hit: 0,
      blocked: 0,
      knockX: 0,
      knockY: 0,
    };
  }
}
