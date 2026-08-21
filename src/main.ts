import "./style.css";
import { STEP } from "./config";
import { Editor } from "./editor";
import { Input } from "./game/input";
import { World } from "./game/world";
import { Hud } from "./render/hud";
import { Renderer } from "./render/renderer";
import { Splitter } from "./splitter";
import { SHAPE_TOOLBOX } from "./blocks/toolbox";
import { Preview } from "./preview";
import { LevelUp } from "./levelup";
import { drawCards, type CardContext } from "./cards";
import { SHIELD_PRESET, PRESETS } from "./script/presets";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const hudRoot = document.querySelector<HTMLElement>("#hud")!;
const editorRoot = document.querySelector<HTMLElement>("#editor")!;
const blocklyRoot = document.querySelector<HTMLElement>("#blockly")!;
const shapeRoot = document.querySelector<HTMLElement>("#blockly-shape")!;
const tabs = document.querySelector<HTMLElement>("#editor-tabs")!;
const shapeStatus = document.querySelector<HTMLElement>("#shape-status")!;
const previewCanvas = document.querySelector<HTMLCanvasElement>("#preview-canvas")!;
const previewPanel = document.querySelector<HTMLElement>("#preview")!;
const levelUpRoot = document.querySelector<HTMLElement>("#levelup")!;
const splitterRoot = document.querySelector<HTMLElement>("#splitter")!;

/**
 * 所有可變狀態集中宣告在這裡，且必須在任何函式被呼叫之前。
 *
 * 這個檔案是 top-level 直線執行，而 `let` 有 TDZ —— 只要有函式在宣告之前
 * 被呼叫且讀到這些變數，就會拋 ReferenceError。而它拋在模組初始化階段，
 * rAF 迴圈根本不會開始，症狀是整頁空白卡死。這個坑在本專案踩過兩次，
 * 新增狀態一律加在這一區，不要就近宣告。
 */
let viewW = 0;
let viewH = 0;
let dpr = 1;
let paused = false;
let last = performance.now();
let accumulator = 0;
let fps = 60;

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
  hud.setScript(script, editor.used(), world.mobilityMultiplier);
});

/**
 * 護盾形狀的編輯器（§9b）。
 *
 * 與攻擊腳本共用同一個 Editor 類別，只是換一套工具箱與容量。
 * 護盾是靜態幾何，所以這裡改動時只需要重算一次頂點。
 */
const shapeEditor = new Editor(
  shapeRoot,
  () => {
    world.setShieldScript(shapeEditor.read());
    preview.setShape(world.shield);
    updateShapeStatus();
  },
  SHAPE_TOOLBOX,
);

/**
 * 護盾形狀的即時回饋。
 *
 * 「還差幾度」是這個練習的核心 —— 只說「沒有生效」的話，學生只能亂試；
 * 說出差額，他才有辦法自己算出正確的轉角。
 */
function updateShapeStatus(): void {
  const shape = world.shield;
  if (!shape || shape.sides === 0) {
    shapeStatus.className = "warn";
    shapeStatus.textContent = "還沒有形狀 —— 用「前進」與「右轉」畫一個封閉圖形";
    return;
  }
  if (world.shieldClosed) {
    shapeStatus.className = "ok";
    shapeStatus.textContent =
      `✅ 護盾閉合　${shape.sides} 邊形　傷害 +${Math.round(shape.sides * 4)}%`;
    return;
  }
  const short = 360 - (((shape.turnTotal % 360) + 360) % 360);
  shapeStatus.className = "warn";
  shapeStatus.textContent =
    `⚠️ 有缺口 ${shape.gap.toFixed(0)}px，敵人穿得過來，也拿不到加成　·　` +
    `轉角總和 ${shape.turnTotal}°，還差 ${short}°`;
}
shapeEditor.load(SHIELD_PRESET);

// 分頁切換。隱藏的工作區量測會得到 0，切回來時必須重新 resize
tabs.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  const isShape = btn.dataset.tab === "shape";
  blocklyRoot.classList.toggle("hidden", isShape);
  shapeRoot.classList.toggle("hidden", !isShape);
  shapeStatus.classList.toggle("hidden", !isShape);
  // 暫停預覽跟著分頁切換內容：看護盾就顯示形狀，看攻擊就顯示彈幕
  preview.setMode(isShape ? "shape" : "attack");
  for (const b of tabs.querySelectorAll("button")) {
    b.classList.toggle("active", b === btn);
  }
  (isShape ? shapeEditor : editor).resize();
});

function loadPreset(i: number): void {
  editor.load(PRESETS[i]); // 觸發 onChange，腳本會自動套用
}
loadPreset(0);

const cardContext: CardContext = { world, editor };

/**
 * 選完卡不自動繼續 —— 學生需要時間把新積木插進腳本。
 * 那個「該放外層還是內層」的思考才是升級的教學意義（DECISIONS.md §2）。
 */
const levelUp = new LevelUp(levelUpRoot, (card) => {
  card.apply(cardContext);
  world.pendingLevelUps--;
  // 積木卡會改變工具箱與容量，指標要重算
  hud.setScript(editor.read(), editor.used(), world.mobilityMultiplier);
});

// 分隔線負責決定編輯器寬度；每次變動都要讓畫布與 Blockly 一起重新量測
const splitter = new Splitter(splitterRoot, editorRoot, () => resize());

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
    shapeEditor.resize();
    if (paused) preview.resize();
  }
}
window.addEventListener("resize", resize);
resize();

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

function frame(now: number): void {
  requestAnimationFrame(frame);

  let dt = (now - last) / 1000;
  last = now;
  // 分頁切回來時 dt 可能是好幾秒。不夾住的話會一次補跑上百步，
  // 畫面瞬間堆滿敵人，玩家莫名其妙就死了。
  if (dt > 0.25) dt = 0.25;
  fps += (1 / Math.max(dt, 1e-6) - fps) * 0.1;

  // 階段切換強制暫停並預告 —— 這是「依敵人改排列」機制的觸發點，
  // 不強制的話多數學生會硬打到死，根本不會發現可以改程式
  const alert = world.consumePhaseAlert();
  if (alert) {
    setPaused(true);
    hud.showTelegraph(alert);
  }

  // 升等時強制暫停並跳卡片。多次升等會排隊，一張一張選
  if (world.pendingLevelUps > 0 && !levelUp.isOpen) {
    setPaused(true);
    levelUp.open(drawCards(cardContext), world.level);
  }

  // 在積木欄位裡打字時，按鍵不該被當成遊戲操作
  const typing = document.activeElement?.tagName === "INPUT";
  if (!typing) {
    if (levelUp.isOpen) {
      // 卡片開著時數字鍵是選卡，不是換角色
      for (let i = 0; i < 3; i++) {
        if (input.justPressed(`Digit${i + 1}`)) levelUp.pick(i);
      }
    } else {
      if (input.justPressed("Space")) {
        hud.clearTelegraph();
        setPaused(!paused);
      }
      if (input.justPressed("KeyR")) world.reset(editor.read());
      for (let i = 0; i < PRESETS.length; i++) {
        if (input.justPressed(`Digit${i + 1}`)) loadPreset(i);
      }
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
