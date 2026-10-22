import { request } from "../../utils/request";
import type { Category } from "../../types/category";
import type { DishVO } from "../../types/dish";
import type { Setmeal } from "../../types/setmeal";

Page({
  data: {
    categories: [] as Category[],
    currentCategory: null as Category | null,
    dishList: [] as DishVO[],
    setmealList: [] as Setmeal[],
  },

  onLoad() {
    this.waitForLogin();
  },

  waitForLogin() {
    const app = getApp<{ globalData: { loginReady: boolean } }>();
    if (app.globalData.loginReady) {
      this.loadCategories();
      return;
    }
    const timer = setInterval(() => {
      if (app.globalData.loginReady) {
        clearInterval(timer);
        this.loadCategories();
      }
    }, 100);
  },

  async loadCategories() {
    try {
      const res = await request<Category[]>({
        url: "/user/category/list",
        showLoading: true,
      });

      if (res.data.length > 0) {
        this.setData({ categories: res.data, currentCategory: res.data[0] });
        this.loadDishesByCategory(res.data[0].id);
        this.loadSetmealsByCategory(res.data[0].id);
      }
    } catch (err) {
      console.error("加载分类失败:", err);
    }
  },

  onCategoryTap(e: WechatMiniprogram.TouchEvent) {
    const category = e.currentTarget.dataset.category as Category;
    this.setData({ currentCategory: category });
    this.loadDishesByCategory(category.id);
    this.loadSetmealsByCategory(category.id);
  },

  async loadDishesByCategory(categoryId: number) {
    try {
      const res = await request<DishVO[]>({
        url: "/user/dish/list",
        data: { categoryId },
      });
      this.setData({ dishList: res.data });
    } catch (err) {
      console.error("加载菜品失败:", err);
    }
  },

  async loadSetmealsByCategory(categoryId: number) {
    try {
      const res = await request<Setmeal[]>({
        url: "/user/setmeal/list",
        data: { categoryId },
      });
      this.setData({ setmealList: res.data });
    } catch (err) {
      console.error("加载套餐失败:", err);
    }
  },
});
