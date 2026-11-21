// 真机调试时 localhost 指向手机自己而不是开发电脑，必须填电脑在局域网中的 IP。
// 换网络后 IP 会变：在电脑上执行 ipconfig，取与手机同一网段的 IPv4 地址填到这里。
// 模拟器与真机共用同一地址（后端绑 0.0.0.0，两种环境都能访问）。
export const ENV = {
  BASE_URL: "http://192.168.5.11:8080",
  // BASE_URL: "http://localhost:8080",
  IMAGE_BASE_URL: "https://dingding-catering.oss-cn-beijing.aliyuncs.com",
};
