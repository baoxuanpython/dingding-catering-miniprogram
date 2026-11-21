import { request } from "../../utils/request";
import { fetchShopOpen } from "../../utils/shop";
import { normalizeImageUrl } from "../../utils/image";
import type { Category } from "../../types/category";
import type { DishVO } from "../../types/dish";
import type { Setmeal } from "../../types/setmeal";
import type { ShoppingCart } from "../../types/shoppingCart";

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
    // 请求失败与「真的没商品」必须区分：失败时若走空态，用户会以为本店没菜
    loadFailed: false,
    emptyText: "该分类下暂无商品",
    shopOpen: false,
    shopStatusText: "休息中",
    // 只有真正拿到营业状态后才置 true，避免首屏未加载完成就闪出「休息中」通栏提示
    shopStatusLoaded: false,
    cartCount: 0,
    cartTotalText: "0.00",
    scrollIntoView: "",
    popupVisible: false,
    popupDish: null as DishVO | null,
    setmealPopupVisible: false,
    popupSetmeal: null as Setmeal | null,
  },

  requestSeq: 0,

  // 「加载中」的复位权归属：只有把 loading 置 true 的非静默请求能复位它
  loadingSeq: 0,

  inited: false,

  // 正在加购的商品 key 集合：同一商品防重复提交，不同商品可并行加购
  addingKeys: new Set<string>(),

  // 搜索防抖句柄：每次输入都全量重建列表会明显掉帧
  keywordTimer: 0,

  onLoad() {
    this.initPage();
  },

  onUnload() {
    // 页面销毁后防抖回调仍会执行并 setData，必须提前清掉
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
      this.keywordTimer = 0;
    }
  },

  onShow() {
    if (!this.inited) {
      return;
    }

    // 营业状态商家随时可改，onShow 是用户回到首页的天然时机，静默拉一次避免徽标长期失真
    this.loadShopStatus();
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
    // 静默刷新：失败时保留上一次已知值，比把徽标改成「状态未知」更不打扰用户
    const open = await fetchShopOpen();

    if (open === null) return;

    this.setData({
      shopOpen: open,
      shopStatusText: open ? "营业中" : "休息中",
      shopStatusLoaded: true,
    });
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
      // 分类都没拿到时不能显示「该分类下暂无商品」，否则用户会误判本店无菜
      this.setData({ loading: false, isEmpty: false, loadFailed: true });
    }
  },

  onRetryLoad() {
    this.setData({ loadFailed: false });

    // 分类为空说明首屏那次请求整体失败，重试要从分类开始
    if (this.data.categories.length === 0) {
      this.loadCategories();
      return;
    }

    if (this.data.currentCategory) {
      this.loadProducts(this.data.currentCategory);
    }
  },

  onCategoryTap(e: WechatMiniprogram.TouchEvent) {
    const { id } = e.currentTarget.dataset as unknown as { id: number };
    const category = this.data.categories.find((item) => item.id === id);

    if (!category || category.id === this.data.currentCategory?.id) {
      return;
    }

    // 旧分类的搜索防抖回调仍在排队，不清掉会在新分类加载途中重建一次空列表
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
      this.keywordTimer = 0;
    }

    this.setData({ currentCategory: category, keyword: "", loadFailed: false });
    this.loadProducts(category);
    this.scrollToTop();
  },

  onKeywordInput(e: WechatMiniprogram.Input) {
    // 先只更新输入框，重建列表推迟到停止输入后再做，避免逐字全量 setData
    this.setData({ keyword: e.detail.value });

    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
    }

    this.keywordTimer = setTimeout(() => {
      this.keywordTimer = 0;
      this.buildProductList();
    }, 200) as unknown as number;
  },

  onClearKeyword() {
    if (this.keywordTimer) {
      clearTimeout(this.keywordTimer);
      this.keywordTimer = 0;
    }

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
      this.loadingSeq = seq;
      this.setData({
        dishList: [],
        setmealList: [],
        productList: [],
        loading: true,
        isEmpty: false,
        loadFailed: false,
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
          loadFailed: false,
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
          loadFailed: false,
        });
        this.buildProductList();
      } else {
        this.setData({
          dishList: [],
          setmealList: [],
          productList: [],
          isEmpty: true,
          loadFailed: false,
        });
      }
    } catch (err) {
      console.error("加载商品失败:", err);
      if (seq === this.requestSeq && !silent) {
        // 失败不能落到「该分类下暂无商品」，那会让用户以为菜品下架了
        this.setData({ isEmpty: false, loadFailed: true });
      }
    } finally {
      // 加载标志属于界面状态，与「数据不被旧响应覆盖」的 seq 职责无关：
      // 由认领者无条件复位，否则被静默刷新顶掉时 loading 会永久停在 true，列表再也不渲染
      if (this.loadingSeq === seq) {
        this.loadingSeq = 0;
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

    if (this.addingKeys.has(item.key)) {
      return;
    }

    this.addingKeys.add(item.key);

    try {
      await request({
        url: "/user/shoppingCart/add",
        method: "POST",
        data: type === "dish" ? { dishId: id } : { setmealId: id },
        // 下方 catch 会弹更具体的「加入购物车失败」，避免被通用提示覆盖
        silentError: true,
      });
      wx.showToast({ title: "已加入购物车", icon: "none" });
      await this.loadCartInfo();
    } catch (err) {
      console.error("加入购物车失败:", err);
      wx.showToast({ title: "加入购物车失败", icon: "none" });
    } finally {
      this.addingKeys.delete(item.key);
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
