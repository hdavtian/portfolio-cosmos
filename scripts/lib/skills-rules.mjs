// The naming rules R1-R10 (plan 4.7): what splits, what folds to one spelling,
// and the exceptions where mechanical splitting gets it wrong. Imported by the
// analyzer and the migration writer so one change reaches both.

/** R6/R7: strings the mechanical rules get wrong. The table in plan 4.7. */
export const EXCEPTIONS = {
  "Adobe Test & Target": { keep: "Adobe Test & Target" },
  "CI/CD": { keep: "CI/CD" },
  "Tax & Financial Content": { drop: "not a technology (R7)" },
  "Marketing Microsites": { drop: "not a technology (R7)" },
  "OpenTable Integration": { drop: "not a technology (R7)" },
  "IBM iStore": { drop: "not a technology (R7)" },
  "Early Internet": { drop: "not a technology (R7)" },
  "First Client Websites": { drop: "not a technology (R7)" },
  "PHP Workflows": { drop: "not a technology (R7)" },
  "Modem + Browser Config": { drop: "not a technology (R7)" },
  "Windows + Mac Support": { keep: "Desktop support" },
  "Client delivery / consulting": { keep: "Client delivery" },
  "Shared + Dedicated Hosting": { keep: "Web hosting" },
  "Dial-up / ISDN / networking": { split: ["Dial-up", "ISDN", "Networking"] },
  "Dial-up + ISDN": { split: ["Dial-up", "ISDN"] },
  "Linux hosting / LAMP": { split: ["Linux", "LAMP"] },
  "Animation (GSAP, Framer, Three.js)": { split: ["GSAP", "Framer Motion", "Three.js"] },
  "SCSS / design systems": { split: ["SCSS", "Design systems"] },
  "CMS / e-commerce platforms": { split: ["CMS", "E-commerce"] },
  "Semantic HTML": { keep: "HTML" },
  "Semantic HTML + SCSS": { split: ["HTML", "SCSS"] },
  "Cross-browser CSS": { keep: "CSS" },
  "Data Center Ops": { keep: "Data center operations" },
  "Dreamweaver-era Tools": { keep: "Dreamweaver" },
  "Front-line tech support": { keep: "Technical support" },
  "Mac Support": { keep: "Desktop support" },
};

/** R10: top-level tree entries keep their ampersands and never split. */
export const CATEGORY_NAMES = new Set(["Cloud & DevOps", "Data & Messaging", "Frontend", "Backend", "Testing"]);

/** R2/R4: the one spelling, keyed by the folded form. */
export const CANON = new Map(
  Object.entries({
    js: "JavaScript",
    javascript: "JavaScript",
    typescript: "TypeScript",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    php: "PHP",
    mysql: "MySQL",
    postgresql: "PostgreSQL",
    mongodb: "MongoDB",
    rabbitmq: "RabbitMQ",
    "node.js": "Node.js",
    nodejs: "Node.js",
    ".net": ".NET",
    "c#": "C#",
    scrum: "Scrum",
    agile: "Agile",
    "agile scrum": "Agile, Scrum",
    ecommerce: "E-commerce",
    "e-commerce": "E-commerce",
    framer: "Framer Motion",
    "lamp stack": "LAMP",
    "rest apis": "REST APIs",
    "ci/cd": "CI/CD",
    "three.js": "Three.js",
    gsap: "GSAP",
    seo: "SEO",
    dns: "DNS",
    aws: "AWS",
    azure: "Azure",
    ec2: "EC2",
    rds: "RDS",
    s3: "S3",
  }),
);

export const fold = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** R3/R5: split a compound into its parts, leaving unspaced slashes alone. */
export const splitCompound = (raw) => {
  const withParens = raw.replace(/\s*\(([^)]*)\)\s*$/, ", $1");
  return withParens
    .split(/\s+\+\s+|\s+\/\s+|\s+&\s+|\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
};

/** Every source string -> the technology names it becomes, with the rule used. */
export function resolve(raw) {
  const value = raw.trim();
  if (!value) return { parts: [], rule: "empty" };
  if (CATEGORY_NAMES.has(value)) return { parts: [value], rule: "R10 category" };
  const exception = EXCEPTIONS[value];
  if (exception) {
    if (exception.drop) return { parts: [], rule: `R7 dropped: ${exception.drop}` };
    if (exception.split) return { parts: exception.split, rule: "R6 exception (split)" };
    return { parts: [exception.keep], rule: "R6 exception (kept whole)" };
  }
  const parts = splitCompound(value);
  const canonical = parts.flatMap((part) => {
    const hit = CANON.get(fold(part));
    if (!hit) return [part];
    // A canon entry may itself expand ("Agile Scrum" -> two).
    return hit.includes(", ") ? hit.split(", ") : [hit];
  });
  const rule = parts.length > 1 ? "R3 split" : canonical[0] !== value ? "R2/R4 canonical" : "unchanged";
  return { parts: canonical, rule };
}
