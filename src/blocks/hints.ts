import { BULLET, CHARGE, MOBILITY } from "../config";

/**
 * 積木上的動態提示文字 —— 讓每塊積木自己說出代價。
 *
 * 用即時數值而非固定說明：學生把穿透從 3 改成 10，標籤上的移速代價當場
 * 跟著跳。規則不是背來的，是拖動數字時看出來的。
 *
 * 數值與 config.ts 的常數連動，調平衡時提示會自動跟著改，不會對不上。
 */

/** 這段等待會讓下一發的傷害倍率變成多少 */
export function waitHint(seconds: number): string {
  const t = Math.min(1, Math.max(0, seconds) / CHARGE.fullTime);
  const mult = CHARGE.min + (CHARGE.max - CHARGE.min) * t;
  return `▸ 下一發 ×${mult.toFixed(1)}`;
}

/**
 * 單一規格對移速的貢獻。
 *
 * 總負載是各項相加後才換算，所以這裡顯示的是「這塊積木的價碼」——
 * 同號相加時完全準確，正負混用時會有些微出入。以可讀性換取精確度是
 * 值得的：學生需要知道的是「這樣調很貴」，不是小數點後第二位。
 */
function mobilityHint(load: number): string {
  if (Math.abs(load) < 0.005) return "";
  const rate = load >= 0 ? MOBILITY.penaltyPerLoad : MOBILITY.bonusPerLoad;
  const delta = -load * rate * 100;
  return `▸ 移速 ${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(0)}%`;
}

export function speedHint(value: number): string {
  return mobilityHint(MOBILITY.speedWeight * ((value - BULLET.speed) / BULLET.speed));
}

export function sizeHint(value: number): string {
  return mobilityHint(MOBILITY.sizeWeight * ((value - BULLET.size) / BULLET.size));
}

export function pierceHint(value: number): string {
  return mobilityHint((MOBILITY.pierceWeight * (value - BULLET.pierce)) / 2);
}

export function lifeHint(value: number): string {
  return mobilityHint(MOBILITY.lifeWeight * ((value - BULLET.life) / BULLET.life));
}

/** 依積木型別算出提示文字。回傳 null 代表這塊積木沒有提示 */
export function hintFor(type: string, value: number): string | null {
  switch (type) {
    case "ls_wait": return waitHint(value);
    case "ls_set_speed": return speedHint(value);
    case "ls_set_size": return sizeHint(value);
    case "ls_set_pierce": return pierceHint(value);
    case "ls_set_life": return lifeHint(value);
    default: return null;
  }
}

/** 各積木要讀哪個欄位當作提示的輸入值 */
export const HINT_SOURCE: Record<string, string> = {
  ls_wait: "SECONDS",
  ls_set_speed: "VALUE",
  ls_set_size: "VALUE",
  ls_set_pierce: "VALUE",
  ls_set_life: "VALUE",
};
