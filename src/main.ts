import "./style.css";
import { STEP } from "./config";
import { Editor } from "./editor";
import { Input } from "./game/input";
import { World } from "./game/world";
import { Hud } from "./render/hud";
import { Renderer } from "./render/renderer";
import { Splitter } from "./splitter";
import { Preview } from "./preview";
import { PRESETS } from "./script/presets";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const hudRoot = document.querySelector<HTMLElement>("#hud")!;
const editorRoot = document.querySelector<HTMLElement>("#editor")!;
const blocklyRoot = document.querySelector<HTMLElement>("#blockly")!;
const previewCanvas = document.querySelector<HTMLCanvasElement>("#preview-canvas")!;
const previewPanel = document.querySelector<HTMLElement>("#preview")!;
const splitterRoot = document.querySelector<HTMLElement>("#splitter")!;

const renderer = new Renderer(canvas);
const hud = new Hud(hudRoot);
const input = new Input();
const preview = new Preview(previewCanvas);

const world = new World(PRESETS[0]);

/** 在積木欄位打字時，用這個假輸入讓角色停住，避免 WASD 同時觸發移動 */
const IDLE = { axis: () => ({ x: 0, y: 0 }), justPressed: () => false, endFrame: () => {} } as unknown as Input;

/**
 * 積木一改動就立刻套用到戰場上，不需要按「執行」。
 *
 * 即時回饋是這個專案的核心賭注：把積木從迴圈外拖到迴圈內，畫面上的彈幕
 * 當場變形 —— 「假設 → 驗證」的迴路壓縮到一次拖曳，學生才會願意亂試。
 */
const editor = new Editor(blocklyRoot, () => {
  const script = editor.read();
  world.setScript(script);
  preview.setScript(script);
  hud.setScript(script, editor.used(), editor.used() > editor.capacity(), world.mobilityMultiplier);
});

function loadPreset(i: number): void {
  editor.load(PRESETS[i]); // 觸發 onChange，腳本會自動套用
}
loadPreset(0);

// 分隔線負責決定編輯器寬度；每次變動都要讓畫布與 Blockly 一起重新量測
const splitter = new Splitter(splitterRoot, editorRoot, () => resize());

let viewW = 0;
let viewH = 0;
let dpr = 1;

function resize(): void {
  viewW = window.innerWidth - splitter.width;
  viewH = window.innerHeight;
  // 上限 2：retina 下把每幀像素量砍到四分之一，密集彈幕時差別很大
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(viewW, viewH, dpr);
  world.setViewport(viewW, viewH);
  // 收合時容器是 display:none，量測會得到 0，跳過即可
  if (splitter.width > 0) {
    editor.resize();
    if (paused) preview.resize();
  }
}
window.addEventListener("resize", resize);
resize();

let paused = false;

/**
 * 試射預覽只在暫停時出現（docs/DECISIONS.md §8）。
 *
 * 平時藏起來有兩個好處：積木區多出將近 200px 的高度，而戰場上本來就
 * 看得到彈幕、不需要第二份。暫停時才是真正需要它的時刻 —— 學生停下來想
 * 「這塊插哪裡」，那時戰場是靜止的，只剩預覽在動。
 */
function setPaused(next: boolean): void {
  paused = next;
  previewPanel.classList.toggle("hidden", !paused);
  if (paused) {
    // 從頭跑一輪：否則會看到藏起來期間殘留的子彈，形狀是亂的
    preview.resize();
    preview.setScript(editor.read());
  }
  // 預覽收合會改變積木區高度，Blockly 要重新量測
  if (splitter.width > 0) editor.resize();
}

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

  // 在積木欄位裡打字時，按鍵不該被當成遊戲操作
  const typing = document.activeElement?.tagName === "INPUT";
  if (!typing) {
    if (input.justPressed("Space")) setPaused(!paused);
    if (input.justPressed("KeyR")) world.reset(editor.read());
    for (let i = 0; i < PRESETS.length; i++) {
      if (input.justPressed(`Digit${i + 1}`)) loadPreset(i);
    }
  }

  if (!paused) {
    // 固定步長：物理與腳本時間都必須與畫面更新率脫鉤，
    // 否則 144Hz 螢幕上的攻擊節奏會跟 60Hz 完全不同
    accumulator += dt;
    while (accumulator >= STEP) {
      world.step(STEP, typing ? IDLE : input);
      accumulator -= STEP;
    }
  }

  if (paused) {
    preview.step(dt);
    preview.draw();
  }

  renderer.draw(world, viewW, viewH, dpr);
  // 暫停時傳 dt=0 凍結餘輝 —— 空白鍵就成了「定格檢視腳本跑到哪」的工具
  editor.updateHeat(world.runner.drainTrace(), paused ? 0 : dt, world.runner.cycles);
  hud.update(world, fps, paused);
  input.endFrame();
}

setPaused(false); // 初始把預覽收起來。必須在 paused 宣告之後，否則會 TDZ
requestAnimationFrame(frame);
