export interface UserLoginDTO {
  code: string;
}

export interface UserLoginVO {
  id: number;
  openid: string;
  name: string;
  avatar: string;
  token: string;
}

export interface UserEditDTO {
  name?: string;
  avatar?: string;
  phone?: string;
  sex?: string;
  idNumber?: string;
}

export interface User {
  id: number;
  openid: string;
  name: string;
  phone: string;
  sex: string;
  idNumber: string;
  avatar: string;
  createTime: string;
}
