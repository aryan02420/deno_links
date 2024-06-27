// Copyright 2022 the Deno authors. All rights reserved. MIT license.

/** @jsx h */
/// <reference no-default-lib="true"/>
/// <reference lib="dom" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />

import {
  callsites,
  ColorScheme,
  createReporter,
  Fragment,
  h,
  html,
  HtmlOptions,
  serve,
  serveDir,
  UnoCSS,
} from "./deps.ts";
import { Index } from "./components.tsx";
import type { ConnInfo } from "./deps.ts";
import type {
  BlogContext,
  BlogMiddleware,
  BlogSettings,
  BlogState,
} from "./types.d.ts";

export { Fragment, h };

const IS_DEV = Deno.args.includes("--dev") && "watchFs" in Deno;
const HMR_SOCKETS: Set<WebSocket> = new Set();

const HMR_CLIENT = `let socket;
let reconnectTimer;

const wsOrigin = window.location.origin
  .replace("http", "ws")
  .replace("https", "wss");
const hmrUrl = wsOrigin + "/hmr";

hmrSocket();

function hmrSocket(callback) {
  if (socket) {
    socket.close();
  }

  socket = new WebSocket(hmrUrl);
  socket.addEventListener("open", callback);
  socket.addEventListener("message", (event) => {
    if (event.data === "refresh") {
      console.log("refreshings");
      window.location.reload();
    }
  });

  socket.addEventListener("close", () => {
    console.log("reconnecting...");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      hmrSocket(() => {
        window.location.reload();
      });
    }, 1000);
  });
}
`;

function errorHandler(err: unknown) {
  return new Response(`Internal server error: ${(err as Error)?.message}`, {
    status: 500,
  });
}

/** The main function of the library.
 *
 * ```jsx
 * import blog, { ga } from "https://deno.land/x/blog/blog.tsx";
 *
 * blog({
 *   title: "My Blog",
 *   description: "The blog description.",
 *   avatar: "./avatar.png",
 *   middlewares: [
 *     ga("GA-ANALYTICS-KEY"),
 *   ],
 * });
 * ```
 */
export default async function blog(settings?: BlogSettings) {
  html.use(UnoCSS(settings?.unocss)); // Load custom unocss module if provided
  html.use(ColorScheme("auto"));

  const url = callsites()[1].getFileName()!;
  const blogState = await configureBlog(url, IS_DEV, settings);

  const blogHandler = createBlogHandler(blogState);
  serve(blogHandler, {
    port: blogState.port,
    hostname: blogState.hostname,
    onError: errorHandler,
  });
}

export function createBlogHandler(state: BlogState) {
  const inner = handler;
  const withMiddlewares = composeMiddlewares(state);
  return function handler(req: Request, connInfo: ConnInfo) {
    // Redirect requests that end with a trailing slash
    // to their non-trailing slash counterpart.
    // Ex: /about/ -> /about
    const url = new URL(req.url);
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
      return Response.redirect(url.href, 307);
    }
    return withMiddlewares(req, connInfo, inner);
  };
}

function composeMiddlewares(state: BlogState) {
  return (
    req: Request,
    connInfo: ConnInfo,
    inner: (req: Request, ctx: BlogContext) => Promise<Response>,
  ) => {
    const mws = state.middlewares?.slice().reverse();

    const handlers: (() => Response | Promise<Response>)[] = [];

    const ctx = {
      next() {
        const handler = handlers.shift()!;
        return Promise.resolve(handler());
      },
      connInfo,
      state,
    };

    if (mws) {
      for (const mw of mws) {
        handlers.push(() => mw(req, ctx));
      }
    }

    handlers.push(() => inner(req, ctx));

    const handler = handlers.shift()!;
    return handler();
  };
}

export function configureBlog(
  _url: string,
  _isDev: boolean,
  settings?: BlogSettings,
): Promise<BlogState> {
  const state: BlogState = {
    ...settings,
  };

  return Promise.resolve(state);
}

export async function handler(
  req: Request,
  ctx: BlogContext,
) {
  const { state: blogState } = ctx;
  const { pathname } = new URL(req.url);
  const canonicalUrl = blogState.canonicalUrl || new URL(req.url).origin;
  const ogImage = typeof blogState.ogImage !== "string"
    ? blogState.ogImage?.url
    : blogState.ogImage;
  const twitterCard = typeof blogState.ogImage !== "string"
    ? blogState.ogImage?.twitterCard
    : "summary_large_image";

  if (IS_DEV) {
    if (pathname == "/hmr.js") {
      return new Response(HMR_CLIENT, {
        headers: {
          "content-type": "application/javascript",
        },
      });
    }

    if (pathname == "/hmr") {
      const { response, socket } = Deno.upgradeWebSocket(req);
      HMR_SOCKETS.add(socket);
      socket.onclose = () => {
        HMR_SOCKETS.delete(socket);
      };

      return response;
    }
  }

  const sharedHtmlOptions: HtmlOptions = {
    lang: blogState.lang ?? "en",
    scripts: IS_DEV ? [{ src: "/hmr.js" }] : undefined,
    links: [
      { href: `${canonicalUrl}${new URL(req.url).pathname}`, rel: "canonical" },
    ],
  };

  const sharedMetaTags = {
    "theme-color": blogState.theme === "dark" ? "#000" : null,
  };

  if (typeof blogState.favicon === "string") {
    sharedHtmlOptions.links?.push({
      href: blogState.favicon,
      type: "image/x-icon",
      rel: "icon",
    });
  } else {
    if (blogState.favicon?.light) {
      sharedHtmlOptions.links?.push({
        href: blogState.favicon.light,
        type: "image/x-icon",
        media: "(prefers-color-scheme:light)",
        rel: "icon",
      });
    }

    if (blogState.favicon?.dark) {
      sharedHtmlOptions.links?.push({
        href: blogState.favicon.dark,
        type: "image/x-icon",
        media: "(prefers-color-scheme:dark)",
        rel: "icon",
      });
    }
  }

  if (pathname === "/") {
    return html({
      ...sharedHtmlOptions,
      title: blogState.title ?? "My Blog",
      meta: {
        ...sharedMetaTags,
        "description": blogState.description,
        "og:title": blogState.title,
        "og:description": blogState.description,
        "og:image": ogImage ?? blogState.cover,
        "twitter:title": blogState.title,
        "twitter:description": blogState.description,
        "twitter:image": ogImage ?? blogState.cover,
        "twitter:card": ogImage ? twitterCard : undefined,
      },
      styles: [
        ...(blogState.style ? [blogState.style] : []),
      ],
      body: (
        <Index
          state={blogState}
        />
      ),
    });
  }

  return await serveDir(req);
}

export function ga(gaKey: string): BlogMiddleware {
  if (gaKey.length === 0) {
    throw new Error("GA key cannot be empty.");
  }

  const gaReporter = createReporter({ id: gaKey });

  return async function (
    request: Request,
    ctx: BlogContext,
  ): Promise<Response> {
    let err: undefined | Error;
    let res: undefined | Response;

    const start = performance.now();
    try {
      res = await ctx.next() as Response;
    } catch (e) {
      err = e as Error;
      res = new Response(`Internal server error: ${err.message}`, {
        status: 500,
      });
    } finally {
      if (gaReporter) {
        gaReporter(request, ctx.connInfo, res!, start, err);
      }
    }
    return res;
  };
}

export function redirects(redirectMap: Record<string, string>): BlogMiddleware {
  return async function (req: Request, ctx: BlogContext): Promise<Response> {
    const { pathname } = new URL(req.url);

    let maybeRedirect = redirectMap[pathname];

    if (!maybeRedirect) {
      // trim leading slash
      maybeRedirect = redirectMap[pathname.slice(1)];
    }

    if (maybeRedirect) {
      if (
        !maybeRedirect.startsWith("/") && !(maybeRedirect.startsWith("http"))
      ) {
        maybeRedirect = "/" + maybeRedirect;
      }

      return new Response(null, {
        status: 307,
        headers: {
          "location": maybeRedirect,
        },
      });
    }
    try {
      return await ctx.next();
    } catch (e) {
      console.error(e);
      return new Response(`Internal server error: ${e.message}`, {
        status: 500,
      });
    }
  };
}
