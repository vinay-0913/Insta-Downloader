import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
  
  // Only redirect GET requests (page visits) to the custom domain.
  // We don't redirect POST requests (like API calls) to avoid breaking form submissions and fetch requests.
  if (context.request.method === 'GET' && url.hostname.endsWith('.vercel.app')) {
    const newUrl = new URL(url.pathname + url.search, 'https://instadownloder.com');
    return context.redirect(newUrl.toString(), 301);
  }
  
  return next();
});
