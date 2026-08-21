import "./style.css";
import { SHIELD, STEP } from "./config";
import { Editor } from "./editor";
import { countExpanded, countFires } from "./script/ast";
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
const panelStatus = document.querySelector<HTMLElement>("#panel-status")!;
const headAttack = document.querySelector<HTMLElement>("#head-attack")!;
const headShape = document.querySelector<HTMLElement>("#head-shape")!;
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
/** 是否已經開始過。開局停在準備狀態，讓學生先看到自己的腳本 */
let started = false;
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
  updatePanelStatus();
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
    updatePanelStatus();
  },
  SHAPE_TOOLBOX,
);

/** 目前在哪個分頁。狀態列與預覽都跟著它換內容 */
let shapeTab = false;
/** 上次寫進狀態列的內容。護盾血量會在戰鬥中變動，靠比對避免每幀重建 DOM */
let lastStatusHtml = "";

/**
 * 面板狀態列。兩個分頁共用同一列，內容依分頁而定。
 *
 * 護盾那側的「還差幾度」是整個幾何練習的核心 —— 只說「沒有生效」的話，
 * 學生只能亂試；說出差額，他才有辦法自己算出正確的轉角。
 */
function updatePanelStatus(): void {
  const { cls, html } = buildStatus();
  if (html === lastStatusHtml) return;
  lastStatusHtml = html;
  panelStatus.className = cls;
  panelStatus.innerHTML = html;
}

function buildStatus(): { cls: string; html: string } {
  if (shapeTab) {
    const shape = world.shield;
    if (!shape || shape.sides === 0) {
      return {
        cls: "warn",
        html:
          `<div class="status-main">還沒有形狀</div>` +
          `<div class="status-sub">用「前進」與「右轉」畫一個封閉圖形</div>`,
      };
    }
    if (world.shieldClosed) {
      const hp = Math.max(0, Math.round(world.shieldHp));
      return {
        cls: "ok",
        html:
          `<div class="status-main">✅ 護盾閉合　${shape.sides} 邊形</div>` +
          `<div class="status-sub">傷害 +${Math.round(shape.sides * SHIELD.buffPerSide * 100)}%　·　` +
          (world.shieldDown > 0
            ? `破盾　恢復中 ${world.shieldDown.toFixed(1)}s`
            : `護盾 ${hp}/${SHIELD.maxHp}`) +
          `</div>`,
      };
    }
    const short = 360 - (((shape.turnTotal % 360) + 360) % 360);
    return {
      cls: "warn",
      html:
        `<div class="status-main">⚠️ 圖形沒有閉合，這局沒有護盾</div>` +
        `<div class="status-sub">缺口 ${shape.gap.toFixed(0)}px　·　` +
        `轉角總和 ${shape.turnTotal}°，還差 ${short}°</div>`,
    };
  }

  const script = editor.read();
  const used = editor.used();
  const left = editor.capacity() - used;
  return {
    cls: left <= 0 ? "danger" : left <= 2 ? "warn" : "",
    html:
      `<div class="status-main">${script.name}　·　容量 ${used}/${editor.capacity()} 格` +
      `${left <= 0 ? "（已滿）" : ""}</div>` +
      `<div class="status-sub">每輪 ${countFires(script.body)} 發　·　` +
      `展開寫需 ${countExpanded(script.body)} 格　·　` +
      `移速 ${Math.round(world.mobilityMultiplier * 100)}%</div>`,
  };
}
shapeEditor.load(SHIELD_PRESET);

// 注入完成後才隱藏。**順序不能反** —— Blockly 若注入到 display:none 的容器，
// 會以 0×0 算完內部座標，之後即使改了尺寸，捲動原點仍然是錯的，
// 症狀就是切過去時積木位置整個跑掉。
shapeRoot.classList.add("hidden");

// 分頁切換。隱藏的工作區量測會得到 0，切回來時必須重新 resize
tabs.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("button");
  if (!btn) return;
  const isShape = btn.dataset.tab === "shape";
  blocklyRoot.classList.toggle("hidden", isShape);
  shapeRoot.classList.toggle("hidden", !isShape);
  shapeTab = isShape;
  updatePanelStatus();
  // 圖例跟著換：容量與 ×N 是攻擊腳本的概念，在護盾分頁只會誤導
  headAttack.classList.toggle("hidden", isShape);
  headShape.classList.toggle("hidden", !isShape);
  // 暫停預覽跟著分頁切換內容：看護盾就顯示形狀，看攻擊就顯示彈幕
  preview.setMode(isShape ? "shape" : "attack");
  for (const b of tabs.querySelectorAll("button")) {
    b.classList.toggle("active", b === btn);
  }
  // 隱藏期間 Blockly 量不到尺寸，切回來一定要重新量測並回到原點，
  // 否則積木會停在上次隱藏前的捲動位置
  const active = isShape ? shapeEditor : editor;
  active.resize();
  active.resetView();
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
  updatePanelStatus();
});

// 分隔線負責決定編輯器寬度；每次變動都要讓畫布與 Blockly 一起重新量測
const splitter = new Splitter(splitterRoot, editorRoot, () => {
  resize();
  // 維持「面板開著 ⇔ 遊戲暫停」的一致性：玩到一半把面板拉出來，
  // 就等於進入編輯狀態。否則會出現一邊被追殺一邊拖積木的荒謬狀況
  if (splitter.width > 0 && started && !paused) setPaused(true);
});

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
// 點回戰場就收掉積木的欄位編輯器 —— 否則它會保持焦點，
// 之後按空白鍵會被當成在輸入框裡打字，遊戲不會恢復
canvas.addEventListener("pointerdown", () => {
  editor.dismissEditors();
  shapeEditor.dismissEditors();
  canvas.focus();
});

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
  // 積木面板只在暫停時拉出。玩的時候戰場佔滿畫面，
  // 停下來才是編輯時間 —— 這跟暫停既有的三個用途（升級、改排列、
  // 檢查幾何）是一致的
  splitter.setCollapsed(!paused);
  syncPreviewVisibility();
  if (paused) {
    // 從頭跑一輪：否則會看到藏起來期間殘留的子彈，形狀是亂的
    preview.resize();
    preview.setScript(editor.read());
  }
  // 預覽收合會改變積木區高度，Blockly 要重新量測
  if (splitter.width > 0) editor.resize();
}

/**
 * 預覽面板的顯示**由狀態推導，而不是在切換時設定**。
 *
 * 只在轉換點設定的話，任何一條沒走到 setPaused 的路徑都會讓面板卡住
 * （症狀就是恢復遊戲後預覽不收回去）。每幀對照一次，狀態與畫面
 * 就不可能不同步 —— 成本只有一次 classList 比對。
 */
function syncPreviewVisibility(): void {
  previewPanel.classList.toggle("hidden", !paused);
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
        started = true;
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

  syncPreviewVisibility();

  // 護盾血量會在戰鬥中變動，狀態列要跟著走（內容沒變就不會動 DOM）
  if (shapeTab) updatePanelStatus();

  renderer.draw(world, viewW, viewH, dpr);
  // 暫停時傳 dt=0 凍結餘輝 —— 空白鍵就成了「定格檢視腳本跑到哪」的工具
  editor.updateHeat(world.runner.drainTrace(), paused ? 0 : dt, world.runner.cycles);
  hud.update(world, fps, paused, started);
  input.endFrame();
}

// 開局停在準備狀態：積木面板是拉開的，學生先看到自己的攻擊腳本與預覽，
// 按空白鍵才開始。若一開始就直接開打，多數人不會發現左邊可以編輯。
setPaused(true);
requestAnimationFrame(frame);
