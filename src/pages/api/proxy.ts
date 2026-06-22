import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Proxy endpoint that fetches media from Instagram's CDN and streams it
 * to the user with proper Content-Disposition headers for direct download.
 * 
 * Usage: GET /api/proxy?url=<encoded_instagram_cdn_url>
 */
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const mediaUrl = url.searchParams.get('url');

  if (!mediaUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only allow Instagram CDN domains for security
  try {
    const mediaUrlObj = new URL(mediaUrl);
    const allowedHosts = [
      'cdninstagram.com',
      'fbcdn.net',
      'instagram.com',
    ];

    const isAllowed = allowedHosts.some(host => mediaUrlObj.hostname.endsWith(host));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Invalid media URL' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch the media from Instagram's CDN
    const response = await fetch(mediaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/',
      },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch media (HTTP ${response.status})` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine file extension and content type
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    let extension = 'mp4';
    let fileType = 'video';

    if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) {
      extension = 'jpg';
      fileType = 'image';
    } else if (contentType.includes('image/png')) {
      extension = 'png';
      fileType = 'image';
    } else if (contentType.includes('image/webp')) {
      extension = 'webp';
      fileType = 'image';
    } else if (contentType.includes('video/mp4') || mediaUrl.includes('.mp4')) {
      extension = 'mp4';
      fileType = 'video';
    }

    // Generate a filename
    const timestamp = Date.now();
    const filename = `instadownloader_${fileType}_${timestamp}.${extension}`;

    // Stream the response body to the client with download headers
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        // Forward content-length if available
        ...(response.headers.get('content-length') && {
          'Content-Length': response.headers.get('content-length')!,
        }),
      },
    });

  } catch (err: any) {
    console.error('Proxy error:', err);
    return new Response(JSON.stringify({ error: 'Failed to download media' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
