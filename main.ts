/** @jsx h */

import blog from "./blog.tsx";

blog({
  title: "aryan02420's Links",
  // description: "This is my new blog.",
  // header: <header>Your custom header</header>,
  // section: <section>Your custom section</section>,
  // footer: <footer>Your custom footer</footer>,
  avatar: "testdata/cat.png",
  avatarClass: "rounded-full",
  author: "aryan02420",
  favicon: "favicon.png",
  ogImage: "/og-image.png",
  links: [
    { title: "Email", url: "mailto:aryan02420@gmail.com" },
    { title: "GitHub", url: "https://github.com/aryan02420" },
    { title: "Twitter", url: "https://twitter.com/aryan02420" },
  ],
  sections: [
    {
      title: 'Contact',
      links: [
        { title: "Email", url: "mailto:aryan02420@gmail.com" },
      ],
    },
    {
      title: 'Social',
      links: [
        { title: "GitHub", url: "https://github.com/aryan02420" },
        { title: "Twitter", url: "https://twitter.com/aryan02420" },
      ],
    },
    {
      title: 'Social',
      links: [
        { title: "GitHub", url: "https://github.com/aryan02420" },
        { title: "Twitter", url: "https://twitter.com/aryan02420" },
      ],
    },
  ],
  lang: "en",
});
