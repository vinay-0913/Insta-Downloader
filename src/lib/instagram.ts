/**
 * Instagram Scraping Library
 * 
 * Extracts media URLs from public Instagram posts, reels, and stories
 * by fetching the page HTML and parsing embedded data.
 * 
 * Strategy:
 *   1. Fetch the Instagram page HTML
 *   2. Extract video from "video_versions" JSON embedded in the page
 *   3. Extract images from "display_url" or OG meta tags
 *   4. Extract caption/author from OG meta tags
 * 
 * Supports optional proxy via PROXY_URL environment variable.
 */

// ─── Types ───

export interface MediaItem {
  url: string;
  type: 'video' | 'image';
  thumbnail?: string;
  width?: number;
  height?: number;
  quality?: string;
  size?: string;
}

export interface DownloadResult {
  success: boolean;
  type: 'video' | 'image' | 'reel' | 'story' | 'carousel';
  media: MediaItem[];
  caption: string;
  author: string;
  error?: string;
}

interface ParsedUrl {
  type: 'post' | 'reel' | 'story' | 'tv';
  shortcode: string;
  username?: string;
}

// ─── URL Parsing ───

export function parseInstagramUrl(url: string): ParsedUrl | null {
  try {
    let cleanUrl = url.trim();
    // Remove tracking parameters
    cleanUrl = cleanUrl.split('?')[0];
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    const urlObj = new URL(cleanUrl);

    if (!urlObj.hostname.includes('instagram.com')) {
      return null;
    }

    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return null;

    const pathType = pathParts[0].toLowerCase();

    switch (pathType) {
      case 'p':
        return { type: 'post', shortcode: pathParts[1] };
      case 'reel':
      case 'reels':
        return { type: 'reel', shortcode: pathParts[1] };
      case 'tv':
        return { type: 'tv', shortcode: pathParts[1] };
      case 'stories':
        if (pathParts.length >= 3) {
          return { type: 'story', shortcode: pathParts[2], username: pathParts[1] };
        }
        return null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ─── Browser-like Headers ───

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

// ─── HTML Fetching ───

async function fetchInstagramPage(url: string): Promise<string> {
  const proxyUrl = getProxyUrl();

  let fetchUrl = url;
  let fetchOptions: RequestInit = {
    headers: BROWSER_HEADERS,
    redirect: 'follow',
  };

  if (proxyUrl) {
    fetchUrl = `${proxyUrl}?url=${encodeURIComponent(url)}`;
    fetchOptions = {
      headers: {
        ...BROWSER_HEADERS,
        'X-Target-URL': url,
      },
      redirect: 'follow',
    };
  }

  const response = await fetch(fetchUrl, fetchOptions);

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limited by Instagram. Please try again in a few minutes.');
    }
    if (response.status === 404) {
      throw new Error('Content not found. The post may have been deleted or is from a private account.');
    }
    throw new Error(`Failed to fetch from Instagram (HTTP ${response.status})`);
  }

  return await response.text();
}

function getProxyUrl(): string | null {
  return import.meta.env.PROXY_URL ?? null;
}

// ─── HTML Parsing Helpers ───

function extractMetaTag(html: string, property: string): string | null {
  // property="X" content="Y"
  const propRegex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  let match = html.match(propRegex);
  if (match) return decodeEntities(match[1]);

  // content="Y" property="X" (reversed order)
  const reversedRegex = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegex(property)}["']`,
    'i'
  );
  match = html.match(reversedRegex);
  if (match) return decodeEntities(match[1]);

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

// ─── Video Extraction ───

/**
 * Extract video URLs from "video_versions" JSON embedded in the page.
 * Instagram embeds this in script tags as part of the server-rendered data.
 * 
 * Format: "video_versions":[{"type":101,"url":"https://...mp4?...","width":X,"height":Y}, ...]
 */
function extractVideoVersions(html: string): MediaItem[] {
  const media: MediaItem[] = [];
  
  // Find video_versions array
  const vvMatch = html.match(/"video_versions"\s*:\s*\[([\s\S]*?)\]/);
  if (!vvMatch) {
    // Fallback: find any .mp4 URLs from Instagram CDN domains
    return extractMp4Urls(html);
  }

  try {
    const block = vvMatch[0];
    
    // Split the block into individual objects to ensure we match the right width with the right URL
    const chunks = block.split(/\{"type"/);
    
    const seenWidths = new Set<number>();
    const seenUrls = new Set<string>();

    chunks.forEach(chunk => {
      const urlMatch = chunk.match(/"url"\s*:\s*"([^"]+\.mp4[^"]*)"/);
      if (!urlMatch) return;

      const url = decodeEntities(urlMatch[1]);
      
      // Instagram sometimes includes the exact same URL multiple times
      // We also want to prevent duplicate widths (same quality)
      const wMatch = chunk.match(/"width"\s*:\s*(\d+)/);
      const width = wMatch ? parseInt(wMatch[1]) : 0;
      
      const cleanUrl = url.split('?')[0]; // compare base url to catch dupes

      if (seenUrls.has(cleanUrl)) return;
      if (width > 0 && seenWidths.has(width)) return;

      seenUrls.add(cleanUrl);
      if (width > 0) seenWidths.add(width);

      const hMatch = chunk.match(/"height"\s*:\s*(\d+)/);
      const height = hMatch ? parseInt(hMatch[1]) : undefined;

      let quality = 'Auto';
      if (width >= 1080) quality = 'HD (1080p)';
      else if (width >= 720) quality = 'HD (720p)';
      else if (width >= 480) quality = 'SD (480p)';
      else if (width > 0) quality = `SD (${width}p)`;

      media.push({ url, type: 'video', width: width || undefined, height, quality });
    });
    
  } catch {
    return extractMp4Urls(html);
  }

  return media;
}

/**
 * Fallback: extract .mp4 URLs directly from Instagram CDN domains.
 */
function extractMp4Urls(html: string): MediaItem[] {
  const media: MediaItem[] = [];
  const mp4Regex = /https?:\/\/(?:instagram\.[a-z0-9.-]+\.fna\.fbcdn\.net|scontent[a-z0-9.-]*\.cdninstagram\.com)\/[^\s"'\\]+\.mp4[^\s"'\\]*/g;
  const seen = new Set<string>();
  let mp4Match;
  
  while ((mp4Match = mp4Regex.exec(html)) !== null) {
    const url = decodeEntities(mp4Match[0]);
    if (!seen.has(url)) {
      seen.add(url);
      media.push({ url, type: 'video', quality: 'Auto' });
    }
  }
  
  return media;
}

/**
 * Extract image URLs from embedded data.
 * Looks for display_url, image_versions2, or falls back to og:image.
 */
function extractImages(html: string): MediaItem[] {
  const media: MediaItem[] = [];
  const seen = new Set<string>();

  // Method 1: image_versions2 (Instagram's modern format)
  const imgVersionsMatch = html.match(/"image_versions2"\s*:\s*\{"candidates"\s*:\s*\[([\s\S]*?)\]\}/);
  if (imgVersionsMatch) {
    const candidateRegex = /"url"\s*:\s*"([^"]+)"(?:[\s\S]*?"width"\s*:\s*(\d+))?(?:[\s\S]*?"height"\s*:\s*(\d+))?/g;
    let cMatch;
    while ((cMatch = candidateRegex.exec(imgVersionsMatch[1])) !== null) {
      const url = decodeEntities(cMatch[1]);
      if (!seen.has(url)) {
        seen.add(url);
        const width = cMatch[2] ? parseInt(cMatch[2]) : undefined;
        media.push({
          url,
          type: 'image',
          width,
          height: cMatch[3] ? parseInt(cMatch[3]) : undefined,
          quality: width && width >= 1080 ? 'HD' : 'Original',
        });
      }
    }
  }

  // Method 2: display_url
  const displayUrlMatch = html.match(/"display_url"\s*:\s*"([^"]+)"/);
  if (displayUrlMatch) {
    const url = decodeEntities(displayUrlMatch[1]);
    if (!seen.has(url)) {
      seen.add(url);
      media.push({ url, type: 'image', quality: 'Original' });
    }
  }

  return media;
}

/**
 * Extract carousel items (multiple images/videos in one post).
 */
function extractCarouselItems(html: string): MediaItem[] {
  const media: MediaItem[] = [];
  
  // Look for carousel_media or edge_sidecar_to_children
  const carouselMatch = html.match(/"carousel_media"\s*:\s*\[([\s\S]*?)\]\s*,\s*"/);
  if (!carouselMatch) return media;

  // Within carousel, find each item's video_versions or image_versions2
  const items = carouselMatch[1];
  
  // Split by item boundaries — look for "pk" or "id" patterns that separate items
  const itemChunks = items.split(/"pk"\s*:/);
  
  for (const chunk of itemChunks) {
    if (chunk.length < 50) continue;
    
    // Check if this item has video
    const videoVersions = extractVideoVersions('"video_versions":' + chunk);
    if (videoVersions.length > 0) {
      // Take the best quality video
      media.push(videoVersions[0]);
      continue;
    }
    
    // Otherwise it's an image
    const images = extractImages(chunk);
    if (images.length > 0) {
      media.push(images[0]);
    }
  }

  return media;
}

// ─── Main Scraping Function ───

async function getFileSize(url: string): Promise<string | undefined> {
  try {
    const resp = await fetch(url, { method: 'HEAD' });
    const length = resp.headers.get('content-length');
    if (length) {
      const bytes = parseInt(length);
      if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
      }
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function scrapeInstagram(inputUrl: string): Promise<DownloadResult> {
  // 1. Parse the URL
  const parsed = parseInstagramUrl(inputUrl);
  if (!parsed) {
    return {
      success: false,
      type: 'image',
      media: [],
      caption: '',
      author: '',
      error: 'Invalid Instagram URL. Please provide a link to a post or reel.',
    };
  }

  // Stories require authentication
  if (parsed.type === 'story') {
    return {
      success: false,
      type: 'story',
      media: [],
      caption: '',
      author: parsed.username || '',
      error: 'Story download requires Instagram authentication. This feature is not available yet.',
    };
  }

  try {
    // 2. Build the Instagram URL (strip tracking params)
    const typePrefix = parsed.type === 'reel' ? 'reel' : parsed.type === 'tv' ? 'tv' : 'p';
    const instagramUrl = `https://www.instagram.com/${typePrefix}/${parsed.shortcode}/`;

    // 3. Fetch the page
    const html = await fetchInstagramPage(instagramUrl);

    // 4. Check for actual hard login wall (very specific check)
    // Don't check for /accounts/login/ since Instagram includes that in JS even for public pages
    if (html.includes('"loginForm"') || html.includes('"require_login":true')) {
      return {
        success: false,
        type: parsed.type === 'reel' ? 'reel' : 'image',
        media: [],
        caption: '',
        author: '',
        error: 'This content is from a private account or Instagram requires login.',
      };
    }

    // 5. Extract metadata from OG tags
    const ogImage = extractMetaTag(html, 'og:image');
    const ogTitle = extractMetaTag(html, 'og:title');
    const ogDescription = extractMetaTag(html, 'og:description');

    let caption = ogTitle || ogDescription || '';
    let author = '';

    // Extract author from title (format: "Username on Instagram: ...")
    const authorFromTitle = ogTitle?.match(/^(.+?)\s+on\s+Instagram/i);
    if (authorFromTitle) {
      author = `@${authorFromTitle[1].trim()}`;
    }
    // Also try to extract @mention from caption
    const mentionMatch = caption.match(/@([\w.]+)/);
    if (!author && mentionMatch) {
      author = `@${mentionMatch[1]}`;
    }

    // 6. Extract media using multiple strategies
    let media: MediaItem[] = [];
    let contentType: DownloadResult['type'] = parsed.type === 'reel' ? 'reel' : 'image';

    // Strategy A: Extract video versions (works for reels and video posts)
    let videos = extractVideoVersions(html);
    if (videos.length > 0) {
      contentType = parsed.type === 'reel' ? 'reel' : 'video';
      
      // Sort videos by width descending to get best quality first
      videos.sort((a, b) => (b.width || 0) - (a.width || 0));
      
      // Keep up to 3 qualities
      videos = videos.slice(0, 3);
      const qualityLabels = videos.length === 3 ? ['Full HD', 'HD', 'Medium'] : 
                            videos.length === 2 ? ['Full HD', 'HD'] : ['Full HD'];
                            
      videos.forEach((vid, idx) => {
        vid.quality = qualityLabels[idx];
        if (idx === 0 && ogImage) {
          vid.thumbnail = ogImage;
        }
        media.push(vid);
      });
    }

    // Strategy B: Extract carousel items
    if (media.length === 0) {
      const carouselItems = extractCarouselItems(html);
      if (carouselItems.length > 0) {
        contentType = 'carousel';
        media = carouselItems;
      }
    }

    // Strategy C: Extract single image
    if (media.length === 0) {
      let images = extractImages(html);
      if (images.length > 0) {
        contentType = 'image';
        
        images.sort((a, b) => (b.width || 0) - (a.width || 0));
        images = images.slice(0, 3);
        const qualityLabels = images.length === 3 ? ['Full HD', 'HD', 'Medium'] : 
                              images.length === 2 ? ['Full HD', 'HD'] : ['Full HD'];
                              
        images.forEach((img, idx) => {
          img.quality = qualityLabels[idx];
          media.push(img);
        });
      }
    }

    // Strategy D: Fallback to OG image (always available for public posts)
    if (media.length === 0 && ogImage) {
      media.push({
        url: ogImage,
        type: 'image',
        quality: 'Standard',
      });
    }

    // 7. Check results
    if (media.length === 0) {
      return {
        success: false,
        type: contentType,
        media: [],
        caption: cleanCaption(caption),
        author,
        error: 'Could not extract media from this post. It may be from a private account.',
      };
    }

    // Fetch file sizes in parallel
    await Promise.all(media.map(async (m) => {
      const size = await getFileSize(m.url);
      if (size) m.size = size;
    }));

    return {
      success: true,
      type: contentType,
      media,
      caption: cleanCaption(caption),
      author,
    };

  } catch (err: any) {
    return {
      success: false,
      type: 'image',
      media: [],
      caption: '',
      author: '',
      error: err.message || 'An unexpected error occurred. Please try again.',
    };
  }
}

function cleanCaption(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.replace(/^.*?on Instagram:\s*[""\u201c]?/i, '');
  cleaned = cleaned.replace(/[""\u201d]$/g, '');
  // Decode HTML entities
  cleaned = cleaned.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  cleaned = cleaned.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec)));
  cleaned = cleaned.trim();
  if (cleaned.length > 200) {
    cleaned = cleaned.substring(0, 200) + '...';
  }
  return cleaned;
}
