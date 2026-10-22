import type { DishVO } from "../../../../types/dish";

Page({
  data: {
    dish: null as DishVO | null,
    selectedFlavors: [] as Array<{ name: string; value: string }>,
    quantity: 1,
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.id) {
      this.loadDishDetail(Number(options.id));
    }
  },

  async loadDishDetail(id: number) {
    console.log("加载菜品详情:", id);
  },
});
