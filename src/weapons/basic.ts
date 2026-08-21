import { BULLET, CYCLE_COOLDOWN } from "../config";
import { PRESETS } from "../script/presets";
import type { WeaponDef } from "./types";

/**
 * 基本射擊 —— 開局就有的武器。
 *
 * 它的積木涵蓋了本作的核心教學內容：迴圈、巢狀、累加器、迴圈變數。
 * 之後解鎖的武器應該往別的方向長（例如事件驅動），而不是給更強的子彈 ——
 * 換武器要換的是**寫法**，不是數字。
 */
export const BASIC_WEAPON: WeaponDef = {
  id: "basic",
  name: "基本射擊",
  description: "迴圈、巢狀與累加器的主場。所有排列技巧都從這裡開始",

  blocks: [
    "ls_repeat",
    "ls_wait",
    "ls_fire",
    "ls_turn",
    "ls_turn_by_index",
    "ls_aim",
    "ls_set_speed",
    "ls_set_size",
    "ls_set_pierce",
    "ls_set_life",
    "ls_set_curve",
    "ls_set_muzzle",
    "ls_wait_by_index",
    "ls_add_speed",
    "ls_add_size",
  ],

  capacity: 12,
  cooldown: CYCLE_COOLDOWN,

  bullet: {
    curve: 0,
    muzzle: 12,
    speed: BULLET.speed,
    size: BULLET.size,
    pierce: BULLET.pierce,
    life: BULLET.life,
    damage: BULLET.damage,
    homing: false,
    explode: false,
    split: false,
  },

  presets: PRESETS,
};
