export interface IJWTTokensPair {
    accessToken: string;
    refreshToken: string;
}

export interface IJwtPayload {
    sub: number;
    email: string;
}