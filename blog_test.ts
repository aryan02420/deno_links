// Copyright 2022 the Deno authors. All rights reserved. MIT license.

import { configureBlog, createBlogHandler, redirects } from "./blog.tsx";
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.193.0/testing/asserts.ts";
import { fromFileUrl, join } from "https://deno.land/std@0.193.0/path/mod.ts";

const BLOG_URL = new URL("./testdata/main.js", import.meta.url).href;
const TESTDATA_PATH = fromFileUrl(new URL("./testdata/", import.meta.url));
const BLOG_SETTINGS = await configureBlog(BLOG_URL, false, {
  author: "The author",
  title: "Test blog",
  description: "This is some description.",
  lang: "en-GB",
  middlewares: [
    redirects({
      "/to_second": "second",
      "/to_second_with_slash": "/second",
      "/external_redirect": "https://example.com",
      "second.html": "second",
    }),
  ],
});
const CONN_INFO = {
  localAddr: {
    transport: "tcp" as const,
    hostname: "0.0.0.0",
    port: 8000,
  },
  remoteAddr: {
    transport: "tcp" as const,
    hostname: "0.0.0.0",
    port: 8001,
  },
};

const blogHandler = createBlogHandler(BLOG_SETTINGS);
const testHandler = (req: Request): Response | Promise<Response> => {
  return blogHandler(req, CONN_INFO);
};

Deno.test("index page", async () => {
  const resp = await testHandler(new Request("https://blog.deno.dev"));
  assert(resp);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "text/html; charset=utf-8");
  const body = await resp.text();
  assertStringIncludes(body, `<html lang="en-GB">`);
  assertStringIncludes(
    body,
    `<link rel="canonical" href="https://blog.deno.dev/" />`,
  );
  assertStringIncludes(body, `Test blog`);
  assertStringIncludes(body, `This is some description.`);
  assertStringIncludes(body, `href="/first"`);
  assertStringIncludes(body, `href="/second"`);
});

Deno.test("external redirects", async () => {
  const resp = await testHandler(
    new Request("https://blog.deno.dev/external_redirect"),
  );
  assert(resp);
  assertEquals(resp.status, 307);
  assertEquals(resp.headers.get("location"), "https://example.com");
  await resp.text();
});

Deno.test("redirect map", async () => {
  {
    const resp = await testHandler(
      new Request("https://blog.deno.dev/second.html"),
    );
    assert(resp);
    assertEquals(resp.status, 307);
    assertEquals(resp.headers.get("location"), "/second");
    await resp.text();
  }
  {
    const resp = await testHandler(
      new Request("https://blog.deno.dev/to_second"),
    );
    assert(resp);
    assertEquals(resp.status, 307);
    assertEquals(resp.headers.get("location"), "/second");
    await resp.text();
  }
  {
    const resp = await testHandler(
      new Request("https://blog.deno.dev/to_second_with_slash"),
    );
    assert(resp);
    assertEquals(resp.status, 307);
    assertEquals(resp.headers.get("location"), "/second");
    await resp.text();
  }
});

Deno.test("static files in root directory", async () => {
  const resp = await testHandler(new Request("https://blog.deno.dev/cat.png"));
  assert(resp);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "image/png");
  const bytes = new Uint8Array(await resp.arrayBuffer());
  assertEquals(bytes, await Deno.readFile(join(TESTDATA_PATH, "./cat.png")));
});

Deno.test(
  "theme-color meta tag when dark theme is used [index page]",
  async () => {
    const darkThemeBlogHandler = createBlogHandler({
      ...BLOG_SETTINGS,
      theme: "dark",
    });
    const darkThemeTestHandler = (req: Request) => {
      return darkThemeBlogHandler(req, CONN_INFO);
    };

    const resp = await darkThemeTestHandler(
      new Request("https://blog.deno.dev"),
    );
    const body = await resp.text();
    assertStringIncludes(body, `<meta name="theme-color" content="#000" />`);
  },
);

Deno.test(
  "theme-color meta tag when dark theme is used [post page]",
  async () => {
    const darkThemeBlogHandler = createBlogHandler({
      ...BLOG_SETTINGS,
      theme: "dark",
    });
    const darkThemeTestHandler = (req: Request) => {
      return darkThemeBlogHandler(req, CONN_INFO);
    };

    const resp = await darkThemeTestHandler(
      new Request("https://blog.deno.dev/first"),
    );
    const body = await resp.text();
    assertStringIncludes(body, `<meta name="theme-color" content="#000" />`);
  },
);

Deno.test("Plaintext response", async () => {
  const plaintext = new Headers({
    Accept: "text/plain",
  });
  const resp = await testHandler(
    new Request("https://blog.deno.dev/first", {
      headers: plaintext,
    }),
  );
  assert(resp);
  assertEquals(resp.status, 200);
  assertEquals(resp.headers.get("content-type"), "text/plain;charset=UTF-8");
  const body = await resp.text();
  assert(body.startsWith("It was popularised in the 1960s"));
});
