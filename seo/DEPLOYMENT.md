# SEO Deployment Instructions

1. Place `sitemap.xml` in the web root so it is publicly available at `{{BASE_URL}}/sitemap.xml`.
2. Place `robots.txt` in the web root so it is publicly available at `{{BASE_URL}}/robots.txt`.
3. In Google Search Console:
   - Add and verify the domain property (or URL prefix).
   - Open **Sitemaps**.
   - Submit `{{BASE_URL}}/sitemap.xml`.
   - Use **URL Inspection** to request indexing for key pages.
4. When moving domains, update `BASE_URL` in your build/runtime config and regenerate canonical links, `robots.txt` sitemap URL, and sitemap `<loc>` values.
