import { CHARGE, CYCLE_COOLDOWN } from "./config";
import type { AimTarget, Script } from "./script/ast";
import { ScriptRunner, type BulletOpts, type ScriptHost } from "./script/vm";

const DEG = Math.PI / 180;

/** 預覽視野的半徑（世界單位）。子彈飛出去就回收 */
const VIEW_RADIUS = 260;

/** 假想敵的位置，讓「方向設為 最近的敵人」有東西可瞄 */
const DUMMY = { x: 150, y: -80 };

interface PreviewBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  charge: number;
}

/**
 * 試射預覽 —— 沒有敵人、沒有走位壓力，純粹把目前腳本的彈幕形狀循環播放。
 *
 * 為什麼要有它（docs/DECISIONS.md §8）：若只能靠實戰驗證，回饋週期是一整局，
 * 那不是設計，是賭博。而且失敗成本高到學生會傾向「不要亂改，能動就好」——
 * 正好扼殺我們要的實驗行為。預覽把「假設 → 驗證」壓縮到兩秒。
 *
 * 它能存在，是因為 VM 從 M0 起就透過 ScriptHost 介面跟世界溝通，從不直接
 * 碰 World。這裡餵進去的就是一個沒有敵人的假 host。
 */
export class Preview implements ScriptHost {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private runner: ScriptRunner;
  private bullets: PreviewBullet[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("預覽畫布取得 2D context 失敗");
    this.ctx = ctx;
    this.runner = new ScriptRunner({ name: "", capacity: 0, body: [] }, this, CYCLE_COOLDOWN);
  }

  setScript(script: Script): void {
    this.runner.reset(script);
    this.bullets.length = 0;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // 面板收合時不必處理
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
  }

  // ---- ScriptHost ----------------------------------------------------

  fire(dirDeg: number, opts: BulletOpts): void {
    if (this.bullets.length > 600) return;
    const a = dirDeg * DEG;
    const gap = Math.min(1, this.runner.consumeCharge() / CHARGE.fullTime);
    this.bullets.push({
      x: 0,
      y: 0,
      vx: Math.cos(a) * opts.speed,
      vy: Math.sin(a) * opts.speed,
      r: opts.size,
      life: opts.life,
      charge: CHARGE.min + (CHARGE.max - CHARGE.min) * gap,
    });
  }

  aimAngle(target: AimTarget, fallback: number): number {
    switch (target) {
      case "nearest": return Math.atan2(DUMMY.y, DUMMY.x) / DEG;
      // 預覽裡玩家不會動，用固定方向代替，才不會每輪形狀都不一樣
      case "moveDir": return 0;
      case "random": return Math.random() * 360;
      default: return fallback;
    }
  }

  // ---- 更新與繪製 ------------------------------------------------------

  step(dt: number): void {
    if (this.w === 0) return;
    this.runner.update(dt);
    // 預覽自己的執行軌跡不拿來點亮積木（那是主遊戲的工作），
    // 但仍要清掉，否則會一直累積到上限
    this.runner.drainTrace();

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || Math.hypot(b.x, b.y) > VIEW_RADIUS) {
        const last = this.bullets.pop()!;
        if (i < this.bullets.length) this.bullets[i] = last;
      }
    }
  }

  draw(): void {
    if (this.w === 0) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#0c1220";
    ctx.fillRect(0, 0, this.w, this.h);

    // 讓 ±VIEW_RADIUS 的範圍剛好塞滿畫布，形狀才不會被裁掉
    const scale = Math.min(this.w, this.h) / (VIEW_RADIUS * 2);
    ctx.save();
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(scale, scale);

    // 假想敵：標示「方向設為 最近的敵人」會瞄向哪裡
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#ff4d5a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(DUMMY.x, DUMMY.y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "lighter";
    for (const b of this.bullets) {
      ctx.globalAlpha = 0.1 + Math.min(0.38, b.charge * 0.14);
      ctx.fillStyle = "#5ce1ff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = b.charge > 1.7 ? "#ffffff" : "#5ce1ff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (0.92 + b.charge * 0.06), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#e8f4ff";
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
