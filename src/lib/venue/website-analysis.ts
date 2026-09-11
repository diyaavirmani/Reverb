import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { load } from "cheerio";

import type { ReverbVenueProfile } from "./profile";

const maximumBytes = 512 * 1024;
const maximumRedirects = 3;
const timeoutMs = 7_000;

export class WebsiteAnalysisError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WebsiteAnalysisError";
  }
}

export type WebsiteAnalysisResult = ReverbVenueProfile["analysis"] & {
  brand: Partial<ReverbVenueProfile["brand"]>;
};

type ResolvedAddress = { address: string; family: number };

export async function analyzeVenueWebsite(
  profile: ReverbVenueProfile,
  dependencies: {
    resolveHost?: (hostname: string) => Promise<ResolvedAddress[]>;
    fetchHtml?: (url: URL) => Promise<string>;
    now?: () => Date;
  } = {}
): Promise<WebsiteAnalysisResult> {
  const now = dependencies.now ?? (() => new Date());
  const referenceUrls = thirdPartyReferences(profile);
  const sourceStatuses: WebsiteAnalysisResult["sourceStatuses"] = referenceUrls.map((url) => ({
    url,
    status: "reference_only",
    detail: "Saved as an owner-provided reference; no authenticated or restricted access was attempted."
  }));

  if (!profile.venue.websiteUrl) {
    return {
      lastAnalyzedAt: now().toISOString(),
      sourceUrls: referenceUrls,
      sourceStatuses,
      facts: [
        `Owner-entered venue: ${profile.venue.name}`,
        `Owner-entered business type: ${profile.venue.businessType}`,
        `Owner-entered location: ${profile.venue.address}, ${profile.venue.city}`
      ],
      inferences: [],
      brand: {
        summary: profile.brand.summary || `A ${profile.venue.businessType.toLowerCase()} in ${profile.venue.city}.`
      }
    };
  }

  const website = await validatePublicWebsiteUrl(profile.venue.websiteUrl, dependencies.resolveHost);
  try {
    const html = dependencies.fetchHtml
      ? await dependencies.fetchHtml(website.url)
      : await requestPublicHtml(website.url, website.addresses);
    const extracted = extractVenueMetadata(html, website.url);
    return {
      lastAnalyzedAt: now().toISOString(),
      sourceUrls: [website.url.toString(), ...referenceUrls],
      sourceStatuses: [
        { url: website.url.toString(), status: "analyzed", detail: "Public first-party website metadata analyzed." },
        ...sourceStatuses
      ],
      facts: extracted.facts,
      inferences: extracted.inferences,
      pageTitle: extracted.pageTitle,
      metaDescription: extracted.metaDescription,
      openGraphImage: extracted.openGraphImage,
      brand: extracted.brand
    };
  } catch (error) {
    if (error instanceof WebsiteAnalysisError) throw error;
    throw new WebsiteAnalysisError("WEBSITE_UNAVAILABLE", "The public website could not be analyzed. You can continue with the information you entered.");
  }
}

export async function validatePublicWebsiteUrl(
  value: string,
  resolver: (hostname: string) => Promise<ResolvedAddress[]> = defaultResolver
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebsiteAnalysisError("INVALID_URL", "Enter a valid public website URL.");
  }

  if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
    throw new WebsiteAnalysisError("INVALID_PROTOCOL", "Only public HTTP and HTTPS websites can be analyzed.");
  }
  if (url.username || url.password) {
    throw new WebsiteAnalysisError("CREDENTIALS_NOT_ALLOWED", "Website URLs must not include credentials.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new WebsiteAnalysisError("PORT_NOT_ALLOWED", "Only standard website ports can be analyzed.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new WebsiteAnalysisError("PRIVATE_HOST", "Private and local network addresses cannot be analyzed.");
  }
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolver(host);
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new WebsiteAnalysisError("PRIVATE_HOST", "Private and local network addresses cannot be analyzed.");
  }
  return { url, addresses };
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));

  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function extractVenueMetadata(html: string, sourceUrl: URL) {
  const $ = load(html);
  $("script, style, noscript, template").remove();
  const pageTitle = clean($("title").first().text()) || undefined;
  const metaDescription = clean($('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content") ?? "") || undefined;
  const ogImageValue = $("meta[property='og:image']").attr("content");
  const openGraphImage = resolveOptionalUrl(ogImageValue, sourceUrl);
  const headings = $("h1, h2").map((_, node) => clean($(node).text())).get().filter(Boolean).slice(0, 6);
  const bodyText = clean($("body").text()).slice(0, 6000);
  const combined = [pageTitle, metaDescription, ...headings, bodyText].filter(Boolean).join(" ");
  const keywords = recurringKeywords(combined);
  const offering = inferOffering(combined);
  const pricePosition = inferPricePosition(combined);
  const facts = unique([
    pageTitle ? `Website title: ${pageTitle}` : "",
    metaDescription ? `Website description: ${metaDescription}` : "",
    offering ? `Website language mentions: ${offering}` : "",
    ...headings.slice(0, 3).map((heading) => `Website heading: ${heading}`)
  ]).filter(Boolean).slice(0, 12);
  const inferences = unique([
    keywords.length ? `Recurring website themes suggest: ${keywords.slice(0, 5).join(", ")}.` : "",
    pricePosition ? `The website language suggests a ${pricePosition.toLowerCase()} price position.` : ""
  ]).filter(Boolean);

  return {
    pageTitle,
    metaDescription,
    openGraphImage,
    facts,
    inferences,
    brand: {
      summary: metaDescription ?? pageTitle ?? "",
      cuisineOrOffering: offering,
      keywords,
      pricePosition,
      vibe: inferVibe(combined),
      audience: ""
    }
  };
}

async function defaultResolver(hostname: string): Promise<ResolvedAddress[]> {
  try {
    return await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new WebsiteAnalysisError("WEBSITE_UNAVAILABLE", "The website address could not be resolved.");
  }
}

async function requestPublicHtml(url: URL, validatedAddresses: ResolvedAddress[], redirects = 0): Promise<string> {
  const target = validatedAddresses[0];
  if (!target) throw new WebsiteAnalysisError("WEBSITE_UNAVAILABLE", "The website address could not be resolved.");
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = transport({
      protocol: url.protocol,
      hostname: target.address,
      family: target.family,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      method: "GET",
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      headers: {
        host: url.host,
        accept: "text/html,application/xhtml+xml",
        "user-agent": "ReverbVenueAnalyzer/1.0"
      }
    }, async (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirects >= maximumRedirects) {
          reject(new WebsiteAnalysisError("TOO_MANY_REDIRECTS", "The website redirected too many times."));
          return;
        }
        try {
          const redirected = new URL(location, url);
          const validated = await validatePublicWebsiteUrl(redirected.toString());
          resolve(await requestPublicHtml(validated.url, validated.addresses, redirects + 1));
        } catch (error) {
          reject(error);
        }
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new WebsiteAnalysisError("WEBSITE_UNAVAILABLE", `The website returned HTTP ${status}.`));
        return;
      }
      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        response.resume();
        reject(new WebsiteAnalysisError("UNSUPPORTED_CONTENT", "The website did not return an HTML page."));
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maximumBytes) {
          request.destroy(new WebsiteAnalysisError("RESPONSE_TOO_LARGE", "The website page is too large to analyze safely."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      response.on("error", reject);
    });
    request.setTimeout(timeoutMs, () => request.destroy(new WebsiteAnalysisError("TIMEOUT", "The website analysis timed out.")));
    request.on("error", reject);
    request.end();
  });
}

function thirdPartyReferences(profile: ReverbVenueProfile): string[] {
  return [
    profile.venue.googleBusinessUrl,
    profile.venue.bookingUrl,
    profile.venue.instagramUrl,
    profile.venue.facebookUrl,
    profile.venue.otherUrl
  ].filter((value): value is string => Boolean(value));
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveOptionalUrl(value: string | undefined, base: URL): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return (["http:", "https:"] as string[]).includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function recurringKeywords(value: string): string[] {
  const words = value.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  const ignored = new Set(["this", "that", "with", "from", "your", "have", "more", "about", "where", "when", "menu", "home", "contact", "copyright"]);
  const counts = new Map<string, number>();
  for (const word of words) if (!ignored.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([word]) => word);
}

function inferOffering(value: string): string {
  const offerings = ["coffee", "cafe", "bakery", "continental", "italian", "indian", "cocktails", "desserts", "brunch", "sharing platters"];
  return offerings.filter((word) => value.toLowerCase().includes(word)).slice(0, 5).join(", ");
}

function inferPricePosition(value: string): string {
  const lower = value.toLowerCase();
  if (/luxury|fine dining|exclusive|premium/.test(lower)) return "Premium";
  if (/affordable|value|budget|everyday/.test(lower)) return "Accessible";
  return "";
}

function inferVibe(value: string): string {
  const lower = value.toLowerCase();
  if (/family|kids|children/.test(lower)) return "Family-friendly";
  if (/luxury|elegant|fine dining|premium/.test(lower)) return "Premium";
  if (/music|nightlife|cocktail|party/.test(lower)) return "Lively";
  if (/cozy|casual|community|friendly/.test(lower)) return "Casual";
  return "";
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
