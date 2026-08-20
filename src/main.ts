import "./style.css";
import { STEP } from "./config";
import { Input } from "./game/input";
import { World } from "./game/world";
import { Hud } from "./render/hud";
import { Renderer } from "./render/renderer";
import { PRESETS } from "./script/presets";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const hudRoot = document.querySelector<HTMLElement>("#hud")!;

const renderer = new Renderer(canvas);
const hud = new Hud(hudRoot);
const input = new Input();

let presetIndex = 0;
const world = new World(PRESETS[presetIndex]);
hud.setScript(PRESETS[presetIndex]);

let viewW = 0;
let viewH = 0;
let dpr = 1;

function resize(): void {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  // 上限 2：retina 下把每幀像素量砍到四分之一，密集彈幕時差別很大
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(viewW, viewH, dpr);
  world.setViewport(viewW, viewH);
}
window.addEventListener("resize", resize);
resize();

let paused = false;
let last = performance.now();
let accumulator = 0;
let fps = 60;

function frame(now: number): void {
  requestAnimationFrame(frame);

  let dt = (now - last) / 1000;
  last = now;
  // 分頁切回來時 dt 可能是好幾秒。不夾住的話會一次補跑上百步，
  // 畫面瞬間堆滿敵人，玩家莫名其妙就死了。
  if (dt > 0.25) dt = 0.25;
  fps += (1 / Math.max(dt, 1e-6) - fps) * 0.1;

  if (input.justPressed("Space")) paused = !paused;
  if (input.justPressed("KeyR")) world.reset(PRESETS[presetIndex]);
  for (let i = 0; i < PRESETS.length; i++) {
    if (input.justPressed(`Digit${i + 1}`)) {
      presetIndex = i;
      world.reset(PRESETS[i]);
      hud.setScript(PRESETS[i]);
    }
  }

  if (!paused) {
    // 固定步長：物理與腳本時間都必須與畫面更新率脫鉤，
    // 否則 144Hz 螢幕上的攻擊節奏會跟 60Hz 完全不同
    accumulator += dt;
    while (accumulator >= STEP) {
      world.step(STEP, input);
      accumulator -= STEP;
    }
  }

  renderer.draw(world, viewW, viewH, dpr);
  hud.update(world, fps, paused);
  input.endFrame();
}

requestAnimationFrame(frame);
