import type { Script } from "../script/ast";
import type { BulletOpts } from "../script/vm";

/**
 * 一把武器的完整定義。
 *
 * **新增武器只需要在 weapons/ 底下多一個檔案**，不必動 World、VM 或工具箱 ——
 * 這是這層抽象存在的唯一理由。在它出現之前，武器的數值散在 BULLET 常數、
 * VM 的預設值、World 的發射邏輯與工具箱四個地方，加一把武器要改四處。
 *
 * 設計約束（見 docs/DECISIONS.md §9d）：
 * - 每把武器都應該**逼出不同的積木排列**，否則只是換皮的數值差異
 * - 武器不影響護盾：護盾是獨立插件，兩者不共用任何狀態
 */
export interface WeaponDef {
  id: string;
  name: string;
  /** 一句話說明這把武器逼出什麼樣的排列。給升級卡與解鎖提示用 */
  description: string;

  /** 工具箱提供哪些積木（積木型別 id）。這就是「這把武器能怎麼寫」的定義 */
  blocks: string[];

  /** 攻擊腳本的容量上限 */
  capacity: number;
  /** 一輪腳本跑完後的冷卻（秒）。越短攻速越快 */
  cooldown: number;

  /**
   * 子彈的基礎屬性。
   *
   * 腳本裡的「子彈速度設為」等積木**以此為起點**，每輪重置回這組值；
   * 火力換機動的負載也以它為基準（超過基準才算加規格）。
   */
  bullet: BulletOpts & { damage: number };

  /** 這把武器可選的起手腳本 */
  presets: Script[];
}
