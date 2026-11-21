import { request } from "./request";

export interface AddToCartResult {
  successCount: number;
  failedCount: number;
}

// 后端 /user/shoppingCart/add 一次只加一份，多份只能逐次提交。
// 逐次提交必然存在「部分成功」窗口：中途失败时前几次已经入库，
// 因此这里不抛错，而是把成功次数交回调用方，由调用方决定提示与后续跳转，
// 避免用户看到「失败」却已有商品进了购物车，再点一次又重复加购。
export async function addToCartTimes(
  data: Record<string, unknown>,
  times: number,
): Promise<AddToCartResult> {
  let successCount = 0;

  for (let i = 0; i < times; i++) {
    try {
      await request({
        url: "/user/shoppingCart/add",
        method: "POST",
        data,
        // 提示统一由调用方按成功份数决定，避免通用提示覆盖更具体的结果
        silentError: true,
      });
      successCount += 1;
    } catch (err) {
      console.error("加入购物车失败:", err);
      return { successCount, failedCount: times - successCount };
    }
  }

  return { successCount, failedCount: 0 };
}
