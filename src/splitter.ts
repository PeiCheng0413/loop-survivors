import { EDITOR_WIDTH } from "./config";

const STORAGE_KEY = "ls.editorWidth";
const MIN_WIDTH = 260;
/** 面板最寬不超過視窗的一半：再寬下去戰場就看不清了，那違背了並排的初衷 */
const MAX_RATIO = 0.5;
/** 移動超過這個距離才算拖曳，否則視為點擊（用來區分「拖寬」與「收合」） */
const DRAG_THRESHOLD = 3;

/**
 * 編輯器與戰場之間的可拖曳分隔線，附收合按鈕。
 *
 * 為什麼需要：巢狀積木縮排兩層之後會想要更寬，而觀察彈幕全貌時又會想要
 * 更窄甚至收起來 —— 這兩種需求在同一堂課裡會反覆切換。
 *
 * 寬度存進 localStorage：老師調好一次之後，每次開課不必重調。
 */
export class Splitter {
  private el: HTMLElement;
  private editorEl: HTMLElement;
  private button: HTMLElement;
  private onChange: () => void;
  private editorWidth: number;
  private collapsed = false;
  private pending = false;

  constructor(el: HTMLElement, editor: HTMLElement, onChange: () => void) {
    this.el = el;
    this.editorEl = editor;
    this.onChange = onChange;

    const saved = Number(localStorage.getItem(STORAGE_KEY));
    this.editorWidth = this.clamp(saved > 0 ? saved : EDITOR_WIDTH);

    this.button = document.createElement("button");
    this.button.className = "splitter-btn";
    el.appendChild(this.button);

    let startX = 0;
    let dragged = false;

    el.addEventListener("pointerdown", (e) => {
      startX = e.clientX;
      dragged = false;
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
      e.preventDefault();
    });

    el.addEventListener("pointermove", (e) => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      if (Math.abs(e.clientX - startX) > DRAG_THRESHOLD) dragged = true;
      if (!dragged) return;
      // 拖曳時自動展開：使用者顯然想調寬度，不必先按一次展開
      this.collapsed = false;
      this.editorWidth = this.clamp(e.clientX);
      this.apply();
    });

    el.addEventListener("pointerup", (e) => {
      el.releasePointerCapture(e.pointerId);
      el.classList.remove("dragging");
      // 沒有拖動 = 單純點擊 → 收合／展開
      if (!dragged) this.toggle();
      else localStorage.setItem(STORAGE_KEY, String(this.editorWidth));
    });

    // 雙擊還原成預設寬度，調壞了不必慢慢拖回來
    el.addEventListener("dblclick", () => {
      this.collapsed = false;
      this.editorWidth = EDITOR_WIDTH;
      localStorage.setItem(STORAGE_KEY, String(this.editorWidth));
      this.apply();
    });

    window.addEventListener("resize", () => {
      // 視窗縮小後，原本的寬度可能已經超過一半，要重新夾一次
      this.editorWidth = this.clamp(this.editorWidth);
      this.apply();
    });

    this.apply();
  }

  /** 目前戰場左緣的位置。收合時為 0 */
  get width(): number {
    return this.collapsed ? 0 : this.editorWidth;
  }

  toggle(): void {
    this.setCollapsed(!this.collapsed);
  }

  /**
   * 由外部控制收合。遊戲進行時收起、暫停時拉出 ——
   * 積木只有在暫停時才用得到，玩的時候讓戰場佔滿畫面。
   */
  setCollapsed(collapsed: boolean): void {
    if (this.collapsed === collapsed) return;
    this.collapsed = collapsed;
    this.apply();
  }

  private clamp(px: number): number {
    return Math.max(MIN_WIDTH, Math.min(px, window.innerWidth * MAX_RATIO));
  }

  private apply(): void {
    const w = this.width;
    document.documentElement.style.setProperty("--editor-w", `${w}px`);
    // 收合時整個藏起來，而不是設成 0 寬 —— Blockly 在零尺寸容器裡
    // 會持續嘗試量測與重繪，白白吃效能
    this.editorEl.style.display = this.collapsed ? "none" : "";
    // 收合後分隔線要靠齊左緣並加寬，否則把手有一半在畫面外、幾乎點不到
    this.el.classList.toggle("collapsed", this.collapsed);
    this.button.textContent = this.collapsed ? "›" : "‹";
    this.button.title = this.collapsed ? "展開積木編輯器" : "收合積木編輯器";

    // 拖曳會連續觸發，用 rAF 併成每幀一次，避免 Blockly 反覆重排
    if (this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      this.onChange();
    });
  }
}
