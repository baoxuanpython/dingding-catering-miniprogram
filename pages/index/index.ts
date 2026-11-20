import { request } from "../../utils/request";
import { normalizeImageUrl } from "../../utils/image";
import type { Category } from "../../types/category";
import type { DishVO } from "../../types/dish";
import type { Setmeal } from "../../types/setmeal";
import type { ShoppingCart } from "../../types/shoppingCart";

interface IApp {
  waitForLogin(): Promise<void>;
  requireLogin(): boolean;
  globalData: { cartCount: number; cartTotal: number };
  updateCartData(cartList: ShoppingCart[]): void;
}

interface ProductTapDataset {
  type: "dish" | "setmeal";
  id: number;
}

interface ProductItem {
  key: string;
  id: number;
  type: "dish" | "setmeal";
  name: string;
  price: number;
  description: string;
  image: string;
  status: number;
  hasFlavor: boolean;
}

Page({
  data: {
    categories: [] as Category[],
    currentCategory: null as Category | null,
    dishList: [] as DishVO[],
    setmealList: [] as Setmeal[],
    productList: [] as ProductItem[],
    keyword: "",
    loading: true,
    isEmpty: false,
    emptyText: "该分类下暂无商品",
    shopOpen: false,
    shopStatusText: "休息中",
    cartCount: 0,
    cartTotalText: "0.00",
    scrollIntoView: "",
    popupVisible: false,
    popupDish: null as DishVO | null,
    setmealPopupVisible: false,
    popupSetmeal: null as Setmeal | null,
  },

  requestSeq: 0,

  inited: false,

  addingKey: "",

  onLoad() {
    this.initPage();
  },

  onShow() {
    if (!this.inited) {
      return;
    }

    this.loadCartInfo();

    if (this.data.currentCategory) {
      this.loadProducts(this.data.currentCategory, true);
    }
  },

  async initPage() {
    const app = getApp<IApp>();
    await app.waitForLogin();

    if (!app.requireLogin()) {
      return;
    }

    this.inited = true;
    this.loadShopStatus();
    this.loadCartInfo();
    this.loadCategories();
  },

  async loadShopStatus() {
    try {
      const res = await request<number>({ url: "/user/shop/status" });
      const open = res.data === 1;
      this.setData({
        shopOpen: open,
        shopStatusText: open ? "营业中" : "休息中",
      });
    } catch (err) {
      console.error("加载店铺状态失败:", err);
    }
  },

  async loadCartInfo() {
    try {
      const res = await request<ShoppingCart[]>({
        url: "/user/shoppingCart/list",
      });
      const app = getApp<IApp>();
      app.updateCartData(res.data);
      this.syncCartView();
    } catch (err) {
      console.error("加载购物车失败:", err);
    }
  },

  syncCartView() {
    const app = getApp<IApp>();
    const count = app.globalData.cartCount;
    const total = app.globalData.cartTotal;

    // 角标已由 app.updateCartData 统一同步，这里只负责页面内的购物车栏
    this.setData({
      cartCount: count,
      cartTotalText: total.toFixed(2),
    });
  },

  async loadCategories() {
    try {
      const res = await request<Category[]>({
        url: "/user/category/list",
        showLoading: true,
      });

      const categories = res.data
        .filter((item) => item.status === 1)
        .sort((a, b) => a.sort - b.sort);

      if (categories.length === 0) {
        this.setData({
          categories: [],
          currentCategory: null,
          dishList: [],
          setmealList: [],
          productList: [],
          loading: false,
          isEmpty: true,
          emptyText: "暂无商品分类",
        });
        return;
      }

      const first = categories[0];
      this.setData({ categories, currentCategory: first });
      this.loadProducts(first);
    } catch (err) {
      console.error("加载分类失败:", err);
      this.setData({ loading: false, isEmpty: true });
    }
  },

  onCategoryTap(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as unknown as { id: number };
    const category = this.data.categories.find((item) => item.id === id);

    if (!category || category.id === this.data.currentCategory?.id) {
      return;
    }

    this.setData({ currentCategory: category, keyword: "" });
    this.loadProducts(category);
    this.scrollToTop();
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value });
    this.buildProductList();
  },

  onClearKeyword() {
    this.setData({ keyword: "" });
    this.buildProductList();
  },

  scrollToTop() {
    this.setData({ scrollIntoView: "" });
    setTimeout(() => {
      this.setData({ scrollIntoView: "list-top" });
    }, 0);
  },

  buildProductList() {
    const keyword = this.data.keyword.trim().toLowerCase();

    const items: ProductItem[] = [
      ...this.data.dishList.map((dish) => ({
        key: `dish-${dish.id}`,
        id: dish.id,
        type: "dish" as const,
        name: dish.name,
        price: dish.price,
        description: dish.description || "",
        image: dish.image,
        status: dish.status,
        hasFlavor: (dish.flavors || []).length > 0,
      })),
      ...this.data.setmealList.map((setmeal) => ({
        key: `setmeal-${setmeal.id}`,
        id: setmeal.id,
        type: "setmeal" as const,
        name: setmeal.name,
        price: setmeal.price,
        description: setmeal.description || "",
        image: setmeal.image,
        status: setmeal.status,
        hasFlavor: false,
      })),
    ];

    const filtered = keyword
      ? items.filter(
          (item) =>
            item.name.toLowerCase().includes(keyword) ||
            item.description.toLowerCase().includes(keyword),
        )
      : items;

    const sorted = filtered.sort((a, b) => {
      if (a.status === b.status) {
        return 0;
      }
      return a.status === 1 ? -1 : 1;
    });

    this.setData({
      productList: sorted,
      isEmpty: sorted.length === 0,
      emptyText: keyword ? "未找到相关商品" : "该分类下暂无商品",
    });
  },

  async loadProducts(category: Category, silent = false) {
    const seq = ++this.requestSeq;

    if (!silent) {
      this.setData({
        dishList: [],
        setmealList: [],
        productList: [],
        loading: true,
        isEmpty: false,
      });
    }

    try {
      if (category.type === 1) {
        const res = await request<DishVO[]>({
          url: "/user/dish/list",
          data: { categoryId: category.id },
        });
        if (seq !== this.requestSeq) {
          return;
        }
        this.setData({
          dishList: res.data.map((item) => ({
            ...item,
            image: normalizeImageUrl(item.image),
          })),
          setmealList: [],
        });
        this.buildProductList();
      } else if (category.type === 2) {
        const res = await request<Setmeal[]>({
          url: "/user/setmeal/list",
          data: { categoryId: category.id },
        });
        if (seq !== this.requestSeq) {
          return;
        }
        this.setData({
          setmealList: res.data.map((item) => ({
            ...item,
            image: normalizeImageUrl(item.image),
          })),
          dishList: [],
        });
        this.buildProductList();
      } else {
        this.setData({
          dishList: [],
          setmealList: [],
          productList: [],
          isEmpty: true,
        });
      }
    } catch (err) {
      console.error("加载商品失败:", err);
      if (seq === this.requestSeq && !silent) {
        this.setData({ isEmpty: true });
      }
    } finally {
      if (seq === this.requestSeq && !silent) {
        this.setData({ loading: false });
      }
    }
  },

  onTapProduct(e: WechatMiniprogram.TouchEvent) {
    const { type, id } = e.currentTarget
      .dataset as unknown as ProductTapDataset;
    this.openDetail(type, id);
  },

  openDetail(type: "dish" | "setmeal", id: number) {
    const item =
      type === "dish"
        ? this.data.dishList.find((dish) => dish.id === id)
        : this.data.setmealList.find((setmeal) => setmeal.id === id);

    if (!item) {
      return;
    }

    if (item.status !== 1) {
      wx.showToast({ title: "该商品已停售", icon: "none" });
      return;
    }

    const url =
      type === "dish"
        ? "/subpackages/browse/pages/dish/detail"
        : "/subpackages/browse/pages/setmeal/detail";

    wx.navigateTo({
      url,
      success: (res) => {
        res.eventChannel.emit("product", { type, product: item });
      },
    });
  },

  async onAddToCart(e: WechatMiniprogram.TouchEvent) {
    const { type, id } = e.currentTarget
      .dataset as unknown as ProductTapDataset;

    const item = this.data.productList.find(
      (product) => product.id === id && product.type === type,
    );

    if (!item) {
      return;
    }

    if (item.status !== 1) {
      wx.showToast({ title: "该商品已停售", icon: "none" });
      return;
    }

    if (item.hasFlavor && item.type === "dish") {
      this.openPopup(id);
      return;
    }

    // 套餐是否含可选口味要查过套餐明细才知道，统一走弹窗，由弹窗内部判断
    if (item.type === "setmeal") {
      this.openSetmealPopup(id);
      return;
    }

    if (this.addingKey) {
      return;
    }

    this.addingKey = item.key;

    try {
      await request({
        url: "/user/shoppingCart/add",
        method: "POST",
        data: type === "dish" ? { dishId: id } : { setmealId: id },
      });
      wx.showToast({ title: "已加入购物车", icon: "none" });
      await this.loadCartInfo();
    } catch (err) {
      console.error("加入购物车失败:", err);
      wx.showToast({ title: "加入购物车失败", icon: "none" });
    } finally {
      this.addingKey = "";
    }
  },

  openPopup(id: number) {
    const dish = this.data.dishList.find((item) => item.id === id);

    if (!dish) {
      return;
    }

    this.setData({ popupDish: dish, popupVisible: true });
  },

  onClosePopup() {
    this.setData({ popupVisible: false });
  },

  onPopupAdded() {
    this.setData({ popupVisible: false });
    this.loadCartInfo();
  },

  openSetmealPopup(id: number) {
    const setmeal = this.data.setmealList.find((item) => item.id === id);

    if (!setmeal) {
      return;
    }

    this.setData({ popupSetmeal: setmeal, setmealPopupVisible: true });
  },

  onCloseSetmealPopup() {
    this.setData({ setmealPopupVisible: false });
  },

  onSetmealPopupAdded() {
    this.setData({ setmealPopupVisible: false });
    this.loadCartInfo();
  },

  onTapCart() {
    wx.switchTab({ url: "/pages/cart/index" });
  },

  onCheckout() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: "请先选购商品", icon: "none" });
      return;
    }
    wx.switchTab({ url: "/pages/cart/index" });
  },
});
