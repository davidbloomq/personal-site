<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet version="3.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="en">
      <head>
        <meta charset="utf-8"/>
        <meta http-equiv="refresh" content="0;url=/feed"/>
        <title>Redirecting to feed…</title>
      </head>
      <body>
        <p>Redirecting to <a href="/feed">/feed</a>…</p>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
