export interface ApiResponse<T = unknown> {
  code: number;
  msg: string;
  data: T;
}

export interface PageResult<T> {
  total: number;
  records: T[];
}
