import { request } from "./request";

// 后端 /user/shop/status 返回 1=营业中、0=打烊
// 返回 null 表示状态无法确认（网络异常/服务端故障），调用方按「可下单」放行，
// 否则断网时用户会被永久挡住，这是比漏拦一单更严重的体验事故
export async function fetchShopOpen(): Promise<boolean | null> {
  try {
    const res = await request<number>({ url: "/user/shop/status" });

    return res.data === 1;
  } catch (err) {
    console.error("获取店铺营业状态失败:", err);
    return null;
  }
}
