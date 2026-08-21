import { BASIC_WEAPON } from "./basic";
import type { WeaponDef } from "./types";

export type { WeaponDef } from "./types";

/**
 * 武器登錄表。新增武器時在這裡加一行，其餘程式碼不需要知道它的存在。
 *
 * 解鎖順序見 docs/DECISIONS.md §9c：每打贏一隻王解鎖一項能力，
 * 武器是其中一種。
 */
export const WEAPONS: WeaponDef[] = [BASIC_WEAPON];

/** 開局預設的武器 */
export const DEFAULT_WEAPON = BASIC_WEAPON;

export function getWeapon(id: string): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? DEFAULT_WEAPON;
}
