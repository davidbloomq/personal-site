<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="3.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
      <head>
        <title><xsl:value-of select="/rss/channel/title"/> — RSS Feed</title>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Georgia', serif;
            color: #000;
            background: #faf8f8;
            padding: 3rem 2rem 2.5rem;
            line-height: 1.6;
          }
          .shell {
            max-width: 560px;
            margin: 0 auto;
          }
          h1 {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 1.55rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            line-height: 1;
          }
          .about {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 0.9rem;
            color: rgba(35, 34, 33, 0.5);
            margin-bottom: 2rem;
            line-height: 1.55;
          }
          .about a {
            color: #C46157;
            text-decoration: none;
          }
          .about a:hover { text-decoration: underline; }
          .about code {
            background: #f1efef;
            padding: 0.15em 0.4em;
            border-radius: 3px;
            font-size: 0.85em;
          }
          .label {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 0.9rem;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: rgba(35, 34, 33, 0.5);
            margin-bottom: 0.6em;
          }
          .post { margin-bottom: 0.9em; }
          .post-date {
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 0.8rem;
            color: rgba(35, 34, 33, 0.5);
          }
          .post-title {
            display: block;
            font-size: 1.25rem;
            font-weight: 400;
            color: #000;
            text-decoration: none;
            line-height: 1.3;
          }
          .post-title:hover {
            color: #C46157;
            text-decoration: none;
          }
          .post-desc {
            font-size: 0.9rem;
            font-weight: 300;
            color: rgba(35, 34, 33, 0.5);
            line-height: 1.45;
            margin-top: 0.2em;
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <h1><xsl:value-of select="/rss/channel/title"/></h1>
          <p class="about">
            This is an RSS feed. Copy the URL into your feed reader to subscribe.
            Visit <a href="https://aboutfeeds.com">About Feeds</a> to learn more.
          </p>
          <p class="label">Essays</p>
          <xsl:for-each select="/rss/channel/item">
            <div class="post">
              <span class="post-date"><xsl:value-of select="pubDate"/></span>
              <a class="post-title" href="{link}">
                <xsl:value-of select="title"/>
              </a>
              <xsl:if test="description">
                <p class="post-desc"><xsl:value-of select="description"/></p>
              </xsl:if>
            </div>
          </xsl:for-each>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
