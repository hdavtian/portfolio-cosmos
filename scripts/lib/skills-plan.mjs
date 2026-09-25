// The curation of the skills consolidation: what merges, what is prose, what
// is retired, and where every technology sits in the tree. Imported by both
// the draft generator and the migration writer so they cannot drift apart.
// Settled with Harma on 2026-09-22 (plan D19, D25).

/** Same thing typed twice: left becomes an alias of the right. */
export const MERGES = {
  ".NET/C#": [".NET", "C#"],
  "Selenium/Java": ["Selenium", "Java"],
  "AWS EC2": ["EC2"],
  "Azure CI/CD": ["Azure", "CI/CD"],
  "GitLab CI/CD": ["GitLab", "CI/CD"],
  "LAMP Stack Deployment": ["LAMP"],
  "Ecommerce Integrations": ["E-commerce"],
  Hosting: ["Web hosting"],
  "Java Integration": ["Java"],
  "IBM iStore Ecommerce": ["ShopSite"],
  // Framework names carrying a language or a suffix: the record is the framework.
  ".NET Web API": ["ASP.NET Core Web API"],
  "C# Playwright API": ["Playwright"],
  "Spring Boot API": ["Spring Boot"],
};

/** Work, not a tool: stays on its job as a prose memory (D12). */
export const PROSE = [
  "Financial Web Content",
  "Tax Calculators",
  "Java Team Integration",
  "Email Campaign Engineering",
  "Marketing Microsites",
];

/** Headings that exist today and are dissolved: their children are refiled and
 *  the heading itself is deleted. Nothing claims them as a skill (D16). */
export const RETIRED = {
  "Data & Messaging": "decomposed: Databases for the stores, Backend for RabbitMQ. Few job descriptions ask for the phrase",
};

/**
 * Headings: organising names nobody claims as a skill (D16). Marked, never
 * inferred from having children - React, AWS and Azure all have children and
 * are real technologies, and inferring would drop them from every screen that
 * shows skills only.
 */
export const GROUPINGS = new Set([
  "Frontend",
  "Backend",
  "APIs",
  "AI",
  "Desktop & platform",
  "CMS & e-commerce",
  "Databases",
  "Cloud & DevOps",
  "Infrastructure & hosting",
  "Testing",
  "Ways of working",
  "Marketing & analytics",
  "Client & support",
  "SPA frameworks",
  "Styling",
  "Animation",
  "Build tools",
  "Patterns",
]);

/** technology -> its parent. Roots map to null. */
export const TREE = {
  Frontend: null,
  HTML: "Frontend",
  JavaScript: "Frontend",
  TypeScript: "Frontend",
  jQuery: "Frontend",
  Flash: "Frontend",
  Dreamweaver: "Frontend",
  "HTML Email": "Frontend",
  RxJS: "Frontend",
  Redux: "Frontend",
  "SPA frameworks": "Frontend",
  Angular: "SPA frameworks",
  AngularJS: "SPA frameworks",
  React: "SPA frameworks",
  "Next.js": "SPA frameworks",
  Hooks: "React",
  Patterns: "React",
  Context: "Patterns",
  Provider: "Patterns",
  // Styling and animation are two skills an employer reads differently: CSS
  // craft is not the same as motion work, so they are two groups, not one.
  Styling: "Frontend",
  CSS: "Styling",
  SCSS: "Styling",
  Animation: "Frontend",
  GSAP: "Animation",
  "Framer Motion": "Animation",
  "Build tools": "Frontend",
  Webpack: "Build tools",
  Gulp: "Build tools",

  Backend: null,
  "C#": "Backend",
  ".NET": "Backend",
  Java: "Backend",
  "Node.js": "Backend",
  PHP: "Backend",
  CakePHP: "Backend",
  RabbitMQ: "Backend",

  // APIs earn a root of their own: only a root becomes a heading on the resume
  // and the Skills planet, and job descriptions single out API experience.
  // Backend holds the languages and runtimes; APIs holds the frameworks you
  // build services with. ASP.NET Web API is not C#, Spring Boot is not Java,
  // so one home per skill (D7) is kept and both headings mean something.
  APIs: null,
  "REST APIs": "APIs",
  OAuth: "APIs",
  "ASP.NET Core Web API": "APIs",
  "Spring Boot": "APIs",

  // Employers are increasingly explicit about AI, so it gets a heading of its
  // own. Nothing in the existing data mentions AI, so it arrives empty and
  // Harma enters the records; an empty heading stays unticked until it has them.
  AI: null,

  "Desktop & platform": null,
  WinForms: "Desktop & platform",
  "Chrome Extension": "Desktop & platform",

  "CMS & e-commerce": null,
  WordPress: "CMS & e-commerce",
  Drupal: "CMS & e-commerce",
  ShopSite: "CMS & e-commerce",
  "E-commerce": "CMS & e-commerce",

  // "Data & Messaging" decomposed: few employers ask for that phrase, and
  // "Databases" is what a job description actually says.
  Databases: null,
  PostgreSQL: "Databases",
  MySQL: "Databases",
  MongoDB: "Databases",

  "Cloud & DevOps": null,
  AWS: "Cloud & DevOps",
  EC2: "AWS",
  RDS: "AWS",
  S3: "AWS",
  Azure: "Cloud & DevOps",
  "Azure Container Apps": "Azure",
  Docker: "Cloud & DevOps",
  "CI/CD": "Cloud & DevOps",
  GitLab: "Cloud & DevOps",

  "Infrastructure & hosting": null,
  "Web hosting": "Infrastructure & hosting",
  DNS: "Infrastructure & hosting",
  Domains: "Infrastructure & hosting",
  LAMP: "Infrastructure & hosting",
  Linux: "Infrastructure & hosting",
  "Data center operations": "Infrastructure & hosting",
  "Dial-up": "Infrastructure & hosting",
  ISDN: "Infrastructure & hosting",
  Networking: "Infrastructure & hosting",

  Testing: null,
  Playwright: "Testing",
  Selenium: "Testing",
  TestNG: "Testing",

  "Ways of working": null,
  Agile: "Ways of working",
  Scrum: "Ways of working",

  "Marketing & analytics": null,
  SEO: "Marketing & analytics",
  Analytics: "Marketing & analytics",
  "Adobe Test & Target": "Marketing & analytics",

  "Client & support": null,
  "Client delivery": "Client & support",
  "Desktop support": "Client & support",
  "Technical support": "Client & support",
};
