import type { APIRoute } from 'astro';
import { scrapeInstagram, parseInstagramUrl } from '../../lib/instagram';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  // CORS headers for cross-origin requests (useful if frontend is on a different domain)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight OPTIONS request
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Parse the request body
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Please provide an Instagram URL.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Quick URL validation before making any external requests
    const parsed = parseInstagramUrl(url);
    if (!parsed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid Instagram URL. Supported formats: posts (/p/) and reels (/reel/).',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }

    // Scrape the content
    const result = await scrapeInstagram(url);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 422,
      headers: {
        'Content-Type': 'application/json',
        // Cache successful responses for 5 minutes to reduce Instagram requests
        ...(result.success && { 'Cache-Control': 'public, max-age=300' }),
        ...corsHeaders,
      },
    });

  } catch (err: any) {
    console.error('Download API error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error. Please try again later.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
};
