import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { LANG_COOKIE, isLang, type Lang } from "./i18n";

export const getLang = createServerFn({ method: "GET" }).handler(async (): Promise<Lang> => {
  const cookie = getRequestHeader("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return isLang(value) ? value : "bn";
});
