import Script from "next/script";

/**
 * Cloudflare Web Analytics: page views and Core Web Vitals, with no cookies
 * and no personal data, so no consent banner is needed.
 *
 * Renders only where CF_ANALYTICS_TOKEN is set (the production server's
 * .env), so local and test builds send nothing. The token is public by
 * design: it ends up in every page.
 */
export function WebAnalytics() {
  const token = process.env.CF_ANALYTICS_TOKEN;
  if (!token) return null;
  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="lazyOnload"
      data-cf-beacon={JSON.stringify({ token })}
    />
  );
}
