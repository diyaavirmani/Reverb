export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      role?: "OWNER" | "MANAGER";
    };
  }
}