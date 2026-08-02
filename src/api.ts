import axios, { type AxiosInstance } from "axios";
import { config } from "./config.js";
import { checkoutFromHold, resolveCheckoutUrls, type CheckoutUrls } from "./paycom.js";
import type { HoldPayload, HoldResult, RepertorySession, SeatsResponse } from "./types.js";

export class CinematicaApi {
  private client: AxiosInstance;
  private sessionCookie: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${config.baseUrl}/api/v1`,
      timeout: 20_000,
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "X-Language": "ru",
        Origin: config.baseUrl,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      validateStatus: () => true,
    });

    this.client.interceptors.response.use((response) => {
      const setCookie = response.headers["set-cookie"];
      if (setCookie) {
        const session = setCookie
          .map((c) => c.split(";")[0])
          .find((c) => c.startsWith("session="));
        if (session) this.sessionCookie = session;
      }
      return response;
    });

    this.client.interceptors.request.use((request) => {
      if (this.sessionCookie) {
        request.headers.Cookie = this.sessionCookie;
      }
      return request;
    });
  }

  /** Warm session cookie used by payment endpoints. */
  async initSession(pageId = config.moviePageId): Promise<void> {
    await this.client.get(`/movies/${pageId}`, {
      headers: { Referer: `${config.baseUrl}/movies/${pageId}` },
    });
  }

  async getSessions(pageId: string): Promise<RepertorySession[]> {
    const { data } = await this.client.get(`/repertory/movie/${pageId}/grouped`, {
      headers: { Referer: `${config.baseUrl}/movies/${pageId}` },
    });
    if (data?.result !== 0 || !Array.isArray(data.list)) {
      throw new Error(`Failed to load repertory ${pageId}: ${JSON.stringify(data).slice(0, 200)}`);
    }
    return data.list as RepertorySession[];
  }

  async getSeats(session: RepertorySession): Promise<SeatsResponse> {
    const path = `/repertory/seats/${session.cinema_id}/${session.hall_id}/${session.movie_id}/${session.id}`;
    const { data } = await this.client.get(path);
    if (data?.result !== 0) {
      throw new Error(
        `Failed seats for ${session.hall} ${session.date} ${session.time}: ${data?.message ?? "unknown"}`,
      );
    }
    return data as SeatsResponse;
  }

  /**
   * Creates a Click/Payme checkout hold (~10 minutes) for the selected seats.
   * Does not complete payment.
   */
  async holdWithDis(payload: HoldPayload): Promise<HoldResult> {
    const { data, status } = await this.client.post("/payment/dis", payload);
    if (status >= 400 || data?.result !== 0) {
      throw new Error(
        `Hold failed (${status}): ${data?.message ?? JSON.stringify(data).slice(0, 300)}`,
      );
    }
    return data as HoldResult;
  }

  async getPaymentStatus(paymentId: string | number): Promise<string> {
    const { data } = await this.client.get(`/payment/status/${paymentId}`);
    return data?.status ?? "unknown";
  }

  /** Turn hold params into real Payme / Click checkout URLs. */
  async resolveCheckout(hold: HoldResult): Promise<CheckoutUrls> {
    return resolveCheckoutUrls(hold);
  }

  checkoutUrl(hold: HoldResult, urls: CheckoutUrls): string | undefined {
    return checkoutFromHold(hold, urls);
  }

  sessionUrl(pageId: string, session: RepertorySession): string {
    return `${config.baseUrl}/movies/${pageId}/${session.cinema_id}/${session.hall_id}/${session.movie_id}/${session.id}/`;
  }

  paymentPageUrl(hold: HoldResult): string | undefined {
    if (hold.params?.ticket_url) return hold.params.ticket_url;
    if (hold.url) return hold.url.startsWith("http") ? hold.url : `${config.baseUrl}${hold.url}`;
    if (hold.payment_id) return `${config.baseUrl}/pay`;
    return undefined;
  }
}
