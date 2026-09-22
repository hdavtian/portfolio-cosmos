# The tree: a draft to correct

Draft for Harma to mark up, 2026-09-22. Source: `npm run skills:migrate`
(dry run against the production copy), which produced 86 technologies of which
64 had no parent. Five of those are the tree's own roots, so 59 needed a home.

Nothing here is built. Correct it and the migration follows it.

## 1. Merges: these are the same thing twice

Each becomes an alias (R8) of the record on the right, so the original string
still finds it in admin.

| Typed somewhere | Merge into | Why |
|---|---|---|
| `.NET Web API` | .NET | a part of .NET, not a separate tool |
| `.NET/C#` | .NET **and** C# | two products, unspaced slash |
| `Selenium/Java` | Selenium **and** Java | same |
| `AWS EC2` | EC2 | EC2 is already under AWS |
| `Azure CI/CD` | Azure **and** CI/CD | a pipeline on a cloud, not a third thing |
| `GitLab CI/CD` | GitLab **and** CI/CD | same |
| `LAMP Stack Deployment` | LAMP | deployment is the work, LAMP is the stack |
| `Ecommerce Integrations` | E-commerce | |
| `Hosting` | Web hosting | |
| `Java Integration` | Java | |

**Kept apart on purpose:** `AngularJS` stays its own entry, not an alias of
Angular. They are different frameworks and the years are different (AngularJS
at InvestCloud predates Angular there).

## 2. Prose: not technologies at all (R7 / D12)

These came from `tech` and `code` memories. They describe work, so they stay
on their job as prose memories rather than entering the tree.

| String | Job |
|---|---|
| `Financial Web Content` | Capital Group |
| `Tax Calculators` | Capital Group |
| `Java Team Integration` | Capital Group |
| `Email Campaign Engineering` | Murad |
| `IBM iStore Ecommerce` | Murad |
| `Marketing Microsites` | Murad |
| `First Client Websites` | HostPro |
| `Modem + Browser Config` | Earthlink |
| `PHP Workflows` | StormScape |
| `Tax & Financial Content` | Capital Group |
| `OpenTable Integration` | StormScape |
| `Early Internet` | Earthlink |

## 3. The tree

Existing entries are unmarked. **New** marks something that has no home today.
Sub-groups are a suggestion: they can be flattened if the nesting feels fussy.

### Frontend
- HTML **new**, CSS **new**, SCSS **new**
- JavaScript, TypeScript
- **SPA frameworks** *(new group)*: Angular, AngularJS **new**, React, Next.js **new**
  - React keeps its existing children: Hooks, Patterns (Context, Provider)
- **Styling & animation** *(new group)*: GSAP **new**, Framer Motion **new**
- **Build tools** *(new group)*: Webpack **new**, Gulp **new**
- jQuery **new**, RxJS **new**, Redux **new**
- Flash **new**, Dreamweaver **new**, HTML Email **new**

### Backend
- C#, .NET **new**, Java, Spring Boot **new**, Node.js
- PHP **new**, CakePHP **new**
- REST APIs, OAuth **new**
- WinForms **new**, Chrome Extension **new**

### CMS & e-commerce *(new root)*
- WordPress **new**, Drupal **new**, ShopSite **new**, E-commerce **new**

### Data & Messaging
- PostgreSQL, MongoDB, RabbitMQ, MySQL **new**

### Cloud & DevOps
- AWS (EC2 **new**, RDS **new**, S3 **new**)
- Azure (Azure Container Apps **new**)
- Docker, CI/CD, GitLab **new**

### Infrastructure & hosting *(new root)*
- Web hosting **new**, DNS **new**, Domains **new**
- LAMP **new**, Linux **new**
- Data centre operations **new**
- Dial-up **new**, ISDN **new**, Networking **new**

### Testing
- Playwright, Selenium, TestNG

### Ways of working *(new root)*
- Agile **new**, Scrum **new**

### Marketing & analytics *(new root)*
- SEO **new**, Analytics **new**, Adobe Test & Target **new**

### Client & support *(new root)*
- Client delivery **new**, Desktop support **new**, Technical support **new**

## 4. What this changes about the shape

- **5 roots become 10.** The five new ones (CMS & e-commerce, Infrastructure &
  hosting, Ways of working, Marketing & analytics, Client & support) are where
  the pre-2005 career and the non-code skills live (D8). None of them is
  ticked for the resume unless Harma wants it, so today's resume is unchanged.
- **Three new sub-groups** inside Frontend, which is otherwise 17 entries flat.
- The deepest branch stays the one that exists today:
  Frontend > React > Patterns > Provider.

## 5. To decide

1. Are the five new roots the right five, and named the way an employer should
   read them?
2. Do the sub-groups inside Frontend earn their nesting, or flatten them?
3. `Chrome Extension` and `WinForms` are under Backend for want of a better
   home. Is there a "Desktop & platform" root hiding here?
4. `HTML Email` under Frontend, or under Marketing & analytics with SEO?
5. Anything in section 2 that is actually a skill, or anything in section 1
   that should stay separate?
