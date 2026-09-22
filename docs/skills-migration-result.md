# Skills migration: what it wrote

`resume_cosmos_prodcopy` -> `resume_cosmos_migrated`, 2026-09-22 14:48. Production untouched.

| | Before | After |
|---|---|---|
| Technology records | 50 (tree + skills + categories) | **89** |
| Free-text job labels | 53 | 0 |
| Skill uses | 0 | **88** |
| Memories | 52 | 21 (prose only) |

## Skill uses per job

| Job | Uses | From labels | Harvested from memories |
|---|---|---|---|
| investcloud | 25 | 22 | 3 |
| rpa | 18 | 18 | 0 |
| boingo | 14 | 14 | 0 |
| capital-group | 4 | 4 | 0 |
| murad | 5 | 4 | 1 |
| unitedlayer | 5 | 5 | 0 |
| stormscape | 8 | 8 | 0 |
| hostpro | 6 | 6 | 0 |
| earthlink | 3 | 3 | 0 |
| stormscape-freelance | 0 | 0 | 0 |

## Technologies rescued from memories

Recorded nowhere else. Deleting the tech memories without harvesting these
would have lost them silently.

- **AngularJS** - from `AngularJS` on investcloud
- **Node.js** - from `Node.js` on investcloud
- **Azure Container Apps** - from `Azure Container Apps` on investcloud
- **ShopSite** - from `IBM iStore Ecommerce` on murad

## What happened to every tech and code memory

| Job | Memory | Action |
|---|---|---|
| investcloud | `Angular` | deleted (already a label on this job) |
| investcloud | `AngularJS` | became a skill used |
| investcloud | `TypeScript` | deleted (already a label on this job) |
| investcloud | `.NET + C#` | deleted (already a label on this job) |
| investcloud | `Java + Spring Boot` | deleted (already a label on this job) |
| investcloud | `Node.js` | became a skill used |
| investcloud | `Selenium + TestNG` | deleted (already a label on this job) |
| investcloud | `C# Playwright API` | deleted (already a label on this job) |
| investcloud | `Azure Container Apps` | became a skill used |
| investcloud | `RabbitMQ + MongoDB` | deleted (already a label on this job) |
| rpa | `React + Redux` | deleted (already a label on this job) |
| rpa | `Next.js` | deleted (already a label on this job) |
| rpa | `Framer Motion + GSAP` | deleted (already a label on this job) |
| rpa | `Spring Boot API` | deleted (already a label on this job) |
| rpa | `MySQL + Docker` | deleted (already a label on this job) |
| rpa | `AWS + Azure CI/CD` | deleted (already a label on this job) |
| boingo | `PHP` | deleted (already a label on this job) |
| boingo | `JavaScript + jQuery` | deleted (already a label on this job) |
| boingo | `CakePHP + MySQL` | deleted (already a label on this job) |
| boingo | `AWS EC2 + RDS + S3` | deleted (already a label on this job) |
| boingo | `Agile Scrum` | deleted (already a label on this job) |
| capital-group | `HTML + CSS + JavaScript` | deleted (already a label on this job) |
| capital-group | `Financial Web Content` | re-typed as prose |
| capital-group | `Tax Calculators` | re-typed as prose |
| capital-group | `Java Team Integration` | re-typed as prose |
| murad | `Marketing Microsites` | re-typed as prose |
| murad | `Email Campaign Engineering` | re-typed as prose |
| murad | `IBM iStore Ecommerce` | became a skill used |
| murad | `SEO + Analytics` | deleted (already a label on this job) |
| murad | `Cross-browser CSS` | deleted (already a label on this job) |
| unitedlayer | `HTML + CSS + PHP` | deleted (already a label on this job) |
| unitedlayer | `LAMP Stack Deployment` | deleted (already a label on this job) |
| stormscape | `Drupal + WordPress` | deleted (already a label on this job) |
| stormscape | `PHP Workflows` | kept as prose (no technology matched) |
| stormscape | `Ecommerce Integrations` | deleted (already a label on this job) |
| hostpro | `Shared + Dedicated Hosting` | deleted (already a label on this job) |
| hostpro | `First Client Websites` | kept as prose (no technology matched) |
| earthlink | `Dial-up + ISDN` | deleted (already a label on this job) |
| earthlink | `Modem + Browser Config` | kept as prose (no technology matched) |

## Prose memories that are a technology name

Left untouched: these are `memory` type, which the migration does not
claim to clean up (D12 covers `tech` and `code`). Each duplicates a skill
the job already records, so they are Harma's to keep or remove.

- `Data Center Operations` on unitedlayer

## Unmatched: nothing was created or dropped for these

Each needs a decision: add a technology, add an alias to an existing one,
or leave it out. Auto-creating is how junk got into the tree the first time.

None.
