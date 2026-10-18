import { createAuthClient } from "better-auth/react";
import { managedAuthClient } from "@runablehq/managed-auth/client";
const tokenKey = "midway-email-session";
const emailToken = () => localStorage.getItem(tokenKey) || "";
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_WEBSITE_URL ?? window.location.origin,
  basePath: "/api/auth",
  fetchOptions: {
    auth: { type: "Bearer", token: emailToken },
    onSuccess(ctx) {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) localStorage.setItem(tokenKey, token);
      if (new URL(ctx.request.url).pathname.endsWith("/sign-out"))
        localStorage.removeItem(tokenKey);
    },
  },
  plugins: [
    managedAuthClient({
      applicationId: import.meta.env.VITE_APPLICATION_ID,
      issuer: import.meta.env.VITE_RUNABLE_AUTH_ISSUER,
    }),
  ],
});
export const sessionToken = () => authClient.managedAuth.getToken() || emailToken();
