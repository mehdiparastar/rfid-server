export type JwtAccessPayload = {
  sub: string;          // user id (stringified)
  email: string;
  roles?: string[];
  iat?: number;
  exp?: number;
};
