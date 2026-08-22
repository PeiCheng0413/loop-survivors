import type { Script } from "./script/ast";

/**
 * 攻擊腳本的記憶槽（docs/DECISIONS.md §9c）。
 *
 * 存好幾套排列，用快速鍵即時切換 —— 遇到裝甲兵按 2 換蓄力流、
 * 遇到蟲群按 1 換散射流，不必暫停拖積木。
 *
 * **這是後期獎勵，不是開局功能。** 順序不能反：一開始就給槽位的話，
 * 學生會變成切換預存檔，永遠不會真的理解排列的意義。手拖階段是學習，
 * 槽位是給已經學會的人的獎勵，所以要打贏王才解鎖。
 */

const STORAGE_KEY = "ls.slotsUnlocked";
export const MAX_SLOTS = 3;

export class SlotManager {
  private scripts: (Script | null)[] = Array.from({ length: MAX_SLOTS }, () => null);
  private active = 0;
  /** 已解鎖幾個槽。跨局保留 —— 它是「永久能力」 */
  private unlockedCount = 1;

  constructor() {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (saved >= 1 && saved <= MAX_SLOTS) this.unlockedCount = saved;
  }

  get unlocked(): number {
    return this.unlockedCount;
  }

  get activeIndex(): number {
    return this.active;
  }

  /** 槽位系統是否已經啟用（解鎖第二格之後才有意義） */
  get enabled(): boolean {
    return this.unlockedCount > 1;
  }

  /** 目前這一格存的腳本，還沒存過則為 null */
  scriptAt(index: number): Script | null {
    return this.scripts[index] ?? null;
  }

  /** 把目前編輯中的腳本寫回當前槽位。切換或存檔前一定要先呼叫 */
  store(script: Script): void {
    this.scripts[this.active] = script;
  }

  /**
   * 切到指定槽位，回傳該槽的腳本（null 代表這格還是空的）。
   * 已鎖或已在該格時回傳 undefined，呼叫端據此判斷「沒有發生切換」。
   */
  switchTo(index: number, current: Script): Script | null | undefined {
    if (index < 0 || index >= this.unlockedCount || index === this.active) return undefined;
    this.store(current);
    this.active = index;
    return this.scripts[index] ?? null;
  }

  /**
   * 解鎖下一格，並把目前的腳本複製進去當起點。
   *
   * 複製而非留空是刻意的：空白的槽位在戰鬥中毫無用處，學生也不可能
   * 在被追殺時從零拖一套。從現有的複製一份再改，才是實際會發生的用法。
   */
  unlockNext(current: Script): boolean {
    if (this.unlockedCount >= MAX_SLOTS) return false;
    this.scripts[this.unlockedCount] = structuredClone(current);
    this.unlockedCount += 1;
    try {
      localStorage.setItem(STORAGE_KEY, String(this.unlockedCount));
    } catch {
      // 存不下來只影響「跨局保留」，這一局仍然可以用
    }
    return true;
  }
}
