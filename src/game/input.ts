/**
 * 鍵盤輸入。滑鼠刻意完全不參與戰鬥 —— 見 docs/DECISIONS.md §6：
 * 允許瞄準會讓遊戲退化成手速競賽，等於告訴學生「程式寫得好不重要」。
 */
export class Input {
  private keys = new Set<string>();
  /** 這一幀被按下的鍵（單次觸發用），每幀結束後清空 */
  private pressed = new Set<string>();

  constructor(target: Window = window) {
    target.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      // 方向鍵與空白鍵會捲動頁面，遊戲中要擋掉
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    });
    target.addEventListener("keyup", (e) => this.keys.delete(e.code));
    target.addEventListener("blur", () => this.keys.clear());
  }

  /** 回傳已正規化的移動向量 */
  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  justPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
