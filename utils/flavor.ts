import type { DishFlavorVO } from "../types/dish";
import type { SetMealDish } from "../types/setmeal";

export interface FlavorGroup {
  flavorId: number;
  name: string;
  values: string[];
  selectedIndex: number;
}

export interface FlavorPayload {
  flavorId: number[];
  flavorVal: string[];
}

// 套餐内单个菜品的口味选择（一个菜品可能有多组口味类型）
export interface SetmealFlavorItem {
  dishId: number;
  dishName: string;
  copies: number;
  groups: FlavorGroup[];
}

// 提交给后端的套餐口味结构：套餐内每道菜一组口味
export interface SetmealFlavorPayload {
  dishId: number;
  flavorId: number[];
  flavorVal: string[];
}

// 后端把口味可选值存成逗号分隔字符串，这里统一解析，避免各页面各写一份
export function parseFlavorValues(valueList: string): string[] {
  return (valueList || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

// 每个口味类型默认选中第一个可选值
export function buildFlavorGroups(flavors: DishFlavorVO[]): FlavorGroup[] {
  return (flavors || []).map((flavor) => ({
    flavorId: flavor.flavorId,
    name: flavor.flavorName,
    values: parseFlavorValues(flavor.valueList),
    selectedIndex: 0,
  }));
}

// 汇总选中的口味；存在空选项时返回 null，由调用方提示用户
export function collectFlavorPayload(
  groups: FlavorGroup[],
): FlavorPayload | null {
  const flavorVal = groups.map(
    (group) => group.values[group.selectedIndex] || "",
  );

  if (flavorVal.some((value) => value.length === 0)) {
    return null;
  }

  return {
    flavorId: groups.map((group) => group.flavorId),
    flavorVal,
  };
}

// 套餐内每道菜的口味默认选中后端下发的 flavorValue，找不到时退回第一个可选值
export function buildSetmealFlavorItems(
  dishes: SetMealDish[],
): SetmealFlavorItem[] {
  return (dishes || [])
    .map((dish) => ({
      dishId: dish.dishId,
      dishName: dish.name,
      copies: dish.copies,
      groups: (dish.setmealDishFlavors || [])
        .map((flavor) => {
          const values = parseFlavorValues(flavor.valueList);
          const defaultIndex = values.indexOf(flavor.flavorValue);
          return {
            flavorId: flavor.flavorId,
            name: flavor.flavorName,
            values,
            selectedIndex: defaultIndex >= 0 ? defaultIndex : 0,
          };
        })
        .filter((group) => group.values.length > 0),
    }))
    .filter((item) => item.groups.length > 0);
}

// 汇总套餐内各菜品的口味；存在空选项时返回 null，由调用方提示用户
export function collectSetmealFlavorPayload(
  items: SetmealFlavorItem[],
): SetmealFlavorPayload[] | null {
  const payload: SetmealFlavorPayload[] = [];

  for (const item of items) {
    if (item.groups.length === 0) {
      continue;
    }

    const flavorVal = item.groups.map(
      (group) => group.values[group.selectedIndex] || "",
    );

    if (flavorVal.some((value) => value.length === 0)) {
      return null;
    }

    payload.push({
      dishId: item.dishId,
      flavorId: item.groups.map((group) => group.flavorId),
      flavorVal,
    });
  }

  return payload;
}
