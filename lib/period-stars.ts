import type { StarType } from "./types";

// Fixed 2.6.1 lookup snapshots: stem = kui/yue/chang/qu/lu/yang/tuo;
// branch = ma/luan/xi/yearly-jie. These verify data, not predict events.
const stems: Record<string, number[]> = {
  甲: [11, 5, 3, 7, 0, 1, 11], 乙: [10, 6, 4, 6, 1, 2, 0], 丙: [9, 7, 6, 4, 3, 4, 2], 丁: [9, 7, 7, 3, 4, 5, 3], 戊: [11, 5, 6, 4, 3, 4, 2],
  己: [10, 6, 7, 3, 4, 5, 3], 庚: [11, 5, 9, 1, 6, 7, 5], 辛: [4, 0, 10, 0, 7, 8, 6], 壬: [1, 3, 0, 10, 9, 10, 8], 癸: [1, 3, 1, 9, 10, 11, 9]
};
const branches: Record<string, number[]> = {
  寅: [6, 11, 5, 6], 卯: [3, 10, 4, 5], 辰: [0, 9, 3, 4], 巳: [9, 8, 2, 3], 午: [6, 7, 1, 2], 未: [3, 6, 0, 1],
  申: [0, 5, 11, 0], 酉: [9, 4, 10, 11], 戌: [6, 3, 9, 10], 亥: [3, 2, 8, 9], 子: [0, 1, 7, 8], 丑: [9, 0, 6, 7]
};
for (const table of [stems, branches]) { Object.values(table).forEach(Object.freeze); Object.freeze(table); }
export function periodStarsFor(stem: string, branch: string, scope: "decadal" | "yearly") {
  const result: { name: string; type: StarType }[][] = Array.from({ length: 12 }, () => []);
  const locations = [...stems[stem], ...branches[branch].slice(0, 3)];
  const names = ["魁", "钺", "昌", "曲", "禄", "羊", "陀", "马", "鸾", "喜"];
  const types: StarType[] = ["soft", "soft", "soft", "soft", "lucun", "tough", "tough", "tianma", "flower", "flower"];
  if (scope === "yearly") result[branches[branch][3]].push({ name: "年解", type: "helper" });
  locations.forEach((location, index) => result[location].push({ name: `${scope === "yearly" ? "流" : "运"}${names[index]}`, type: types[index] }));
  return result;
}
