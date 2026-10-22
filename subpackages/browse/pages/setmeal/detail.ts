import type { SetMealVO } from "../../../../types/setmeal";

Page({
  data: {
    setmeal: null as SetMealVO | null,
    quantity: 1,
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.id) {
      this.loadSetmealDetail(Number(options.id));
    }
  },

  async loadSetmealDetail(id: number) {
    console.log("加载套餐详情:", id);
  },
});
