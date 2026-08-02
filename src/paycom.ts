import axios from "axios";
import type { HoldResult } from "./types.js";

const GTICKETS_URL = "https://cinematica.gtickets.uz/";

export type CheckoutUrls = {
  payme?: string;
  click?: string;
  gticketsPage?: string;
};

/** Cinematica "Continue on Click/Payme" posts one JSON field named `param`. */
export async function resolveCheckoutUrls(hold: HoldResult): Promise<CheckoutUrls> {
  if (!hold.params || typeof hold.params !== "object") {
    return {};
  }

  const body = new URLSearchParams({ param: JSON.stringify(hold.params) });
  const { data: html } = await axios.post<string>(GTICKETS_URL, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: "https://cinematica.uz/",
      Origin: "https://cinematica.uz",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    responseType: "text",
    validateStatus: () => true,
  });

  const decoded = html.replace(/&amp;/g, "&");
  const payme = decoded.match(/https:\/\/checkout\.paycom\.uz\/[A-Za-z0-9+/=]+/)?.[0];
  const click = decoded.match(/https:\/\/my\.click\.uz\/services\/pay\/\?[^"'\s<>]+/)?.[0];

  if (decoded.toLowerCase().includes("bad request")) {
    throw new Error("gtickets rejected checkout params");
  }

  return {
    payme,
    click,
    gticketsPage: payme || click ? GTICKETS_URL : undefined,
  };
}

export function checkoutFromHold(hold: HoldResult, urls: CheckoutUrls): string | undefined {
  return urls.payme ?? urls.click ?? hold.params?.ticket_url;
}
