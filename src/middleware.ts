import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);
  
  // If the request comes to the Vercel subdomain, permanently redirect (301) to the main custom domain
  if (url.hostname.endsWith('.vercel.app')) {
    const newUrl = new URL(url.pathname + url.search, 'https://instadownloder.com');
    return context.redirect(newUrl.toString(), 301);
  }
  
  return next();
});
