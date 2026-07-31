# Graph Report - automation-portal  (2026-07-12)

## Corpus Check
- 88 files · ~42,252 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 628 nodes · 1541 edges · 46 communities (24 shown, 22 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `456157cb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Shared UI Components & Layout Shell|Shared UI Components & Layout Shell]]
- [[_COMMUNITY_PPC Top-Up Automation|PPC Top-Up Automation]]
- [[_COMMUNITY_Auth & Staff Management|Auth & Staff Management]]
- [[_COMMUNITY_Package Dependencies (package.json)|Package Dependencies (package.json)]]
- [[_COMMUNITY_Sponsored Brands Upload - Campaign Data|Sponsored Brands Upload - Campaign Data]]
- [[_COMMUNITY_shadcnui Component Registry Config|shadcn/ui Component Registry Config]]
- [[_COMMUNITY_PPC Schedule AI Import|PPC Schedule AI Import]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_product-block.tsx|product-block.tsx]]
- [[_COMMUNITY_Dashboard, Projects & Tools Registry|Dashboard, Projects & Tools Registry]]
- [[_COMMUNITY_utils.ts|utils.ts]]
- [[_COMMUNITY_Sponsored Brands Bulk XLSX Builder|Sponsored Brands Bulk XLSX Builder]]
- [[_COMMUNITY_Project Docs & External References|Project Docs & External References]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_File Icon Asset|File Icon Asset]]
- [[_COMMUNITY_Globe Icon Asset|Globe Icon Asset]]
- [[_COMMUNITY_Next.js Logo Asset|Next.js Logo Asset]]
- [[_COMMUNITY_Vercel Logo Asset|Vercel Logo Asset]]
- [[_COMMUNITY_Window Icon Asset|Window Icon Asset]]
- [[_COMMUNITY_LaLaGreen Automation Portal — Developer Guide|LaLaGreen Automation Portal — Developer Guide]]
- [[_COMMUNITY_sp-api.ts|sp-api.ts]]
- [[_COMMUNITY_projects.ts|projects.ts]]
- [[_COMMUNITY_chart.tsx|chart.tsx]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_AGENTS|AGENTS.md]]
- [[_COMMUNITY_Next.js Breaking Changes Notice|Next.js Breaking Changes Notice]]
- [[_COMMUNITY_Admin Role Restriction Policy|Admin Role Restriction Policy]]
- [[_COMMUNITY_portal_session JWT Cookie|portal_session JWT Cookie]]
- [[_COMMUNITY_LaLaGreen Automation Portal (Project Overview)|LaLaGreen Automation Portal (Project Overview)]]
- [[_COMMUNITY_No Self-Service Signup Policy|No Self-Service Signup Policy]]
- [[_COMMUNITY_Server Actions {data, error} Return Shape Convention|Server Actions {data, error} Return Shape Convention]]
- [[_COMMUNITY_Supabase staff Table|Supabase staff Table]]
- [[_COMMUNITY_Geist Font (nextfont)|Geist Font (next/font)]]
- [[_COMMUNITY_Next.js Documentation|Next.js Documentation]]
- [[_COMMUNITY_create-next-app Bootstrapped Project|create-next-app Bootstrapped Project]]
- [[_COMMUNITY_Vercel Platform|Vercel Platform]]
- [[_COMMUNITY_build.ts|build.ts]]
- [[_COMMUNITY_sku-list.ts|sku-list.ts]]
- [[_COMMUNITY_tabs.tsx|tabs.tsx]]
- [[_COMMUNITY_page-header.tsx|page-header.tsx]]
- [[_COMMUNITY_tools.ts|tools.ts]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 88 edges
2. `getSession()` - 33 edges
3. `createServiceClient()` - 32 edges
4. `createClient()` - 30 edges
5. `requireStaff()` - 21 edges
6. `compilerOptions` - 16 edges
7. `Button()` - 13 edges
8. `getMyPermissions()` - 13 edges
9. `LaLaGreen Automation Portal — Developer Guide` - 12 edges
10. `POST()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `SheetOverlay()` --calls--> `cn()`  [EXTRACTED]
  components/ui/sheet.tsx → lib/utils.ts
- `PpcTopUpLayout()` --calls--> `assertItemAccess()`  [EXTRACTED]
  app/(portal)/automations/ppc-top-up/layout.tsx → lib/permissions.ts
- `PriceChangePlansLayout()` --calls--> `assertItemAccess()`  [EXTRACTED]
  app/(portal)/automations/price-change-plans/layout.tsx → lib/permissions.ts
- `NewPricePlanSheet()` --calls--> `listSkus()`  [EXTRACTED]
  app/(portal)/automations/price-change-plans/page.tsx → lib/actions/sku-list.ts
- `MasterListLayout()` --calls--> `assertItemAccess()`  [EXTRACTED]
  app/(portal)/configuration/master-list/layout.tsx → lib/permissions.ts

## Import Cycles
- None detected.

## Communities (46 total, 22 thin omitted)

### Community 0 - "Shared UI Components & Layout Shell"
Cohesion: 0.16
Nodes (18): POST(), BrandRow, IncomingCampaign, ResolveErr, resolveMarketplace(), ResolveOk, isAllowed(), BaseCampaignInput (+10 more)

### Community 1 - "PPC Top-Up Automation"
Cohesion: 0.11
Nodes (44): isManualTopUpFuture(), LiveProjectionCard(), nextUpcomingSlot(), PpcTopUpPage(), relativeDayLabel(), statusBadgeClass(), toNumericAmount(), PpcTopUpCharts() (+36 more)

### Community 2 - "Auth & Staff Management"
Cohesion: 0.13
Nodes (28): budgetFor(), POST(), AD_GROUP_MEDIA, AD_MEDIA, AdsCountry, adsHeaders(), adsPost(), AdsProfile (+20 more)

### Community 3 - "Package Dependencies (package.json)"
Cohesion: 0.05
Nodes (41): dependencies, @anthropic-ai/sdk, @base-ui/react, bcryptjs, class-variance-authority, clsx, @dnd-kit/core, @dnd-kit/sortable (+33 more)

### Community 4 - "Sponsored Brands Upload - Campaign Data"
Cohesion: 0.13
Nodes (31): COUNTRIES, STEPS, WizardStep, Brand, CampaignProduct, createBrand(), createKeywordTheme(), createVideoAsset() (+23 more)

### Community 5 - "shadcn/ui Component Registry Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 6 - "PPC Schedule AI Import"
Cohesion: 0.16
Nodes (18): AMOUNT_HINTS, analyzeScheduleImport(), ColumnDetectSchema, ColumnMapping, COUNTRY_ALIASES, COUNTRY_HINTS, detectColumnsHeuristically(), detectColumnsWithAi() (+10 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 8 - "product-block.tsx"
Cohesion: 0.07
Nodes (45): blockIssues(), BlockSummary, buildCampaigns(), buildName(), Campaign, campaignCountForBlock(), distributeKeywords(), shuffle() (+37 more)

### Community 9 - "Dashboard, Projects & Tools Registry"
Cohesion: 0.23
Nodes (12): SidebarContent(), ALL_ITEM_IDS, canManageUsers(), EMPTY_PERMISSIONS, filterItems(), PermissionSet, Role, ROLES (+4 more)

### Community 10 - "utils.ts"
Cohesion: 0.27
Nodes (14): ACCESS_SECTIONS, accessSummary(), ManageUsersPage(), StaffMember, createStaffMember(), deleteStaffMember(), getCurrentUser(), listStaff() (+6 more)

### Community 11 - "Sponsored Brands Bulk XLSX Builder"
Cohesion: 0.06
Nodes (44): ChatPanel(), markdownComponents, AlertDialogMedia(), AlertDialogOverlay(), Avatar(), AvatarBadge(), AvatarFallback(), AvatarGroup() (+36 more)

### Community 23 - "LaLaGreen Automation Portal — Developer Guide"
Cohesion: 0.07
Nodes (26): Adding a New Project, Adding a new staff member, Adding a New Tool, Amazon Advertising API (Sponsored Brands Upload → "Upload to Amazon"), Architecture, Auth System, Database (Supabase), Environment variables (+18 more)

### Community 24 - "sp-api.ts"
Cohesion: 0.08
Nodes (45): daysRemaining(), EditPricePlanForm(), formatDate(), formatPrice(), HistoryTable(), NewPricePlanSheet(), PlanCard(), PlansList() (+37 more)

### Community 25 - "projects.ts"
Cohesion: 0.17
Nodes (13): ConfigurationItem, ConfigurationItemInput, configurationItems, defineConfigurationItem(), masterList, slugify(), AutomationProject, defineProject() (+5 more)

### Community 26 - "chart.tsx"
Cohesion: 0.29
Nodes (10): POST(), POST(), toRole(), clearSessionCookie(), getSecretKey(), setSessionCookie(), signSession(), verifySessionToken() (+2 more)

### Community 27 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 41 - "build.ts"
Cohesion: 0.23
Nodes (9): DirectoryEntry, TeamPage(), sendAiChatMessage(), getStaffDirectory(), ChatMessage, generateAssistantReply(), chatToolDefinitions, runChatTool() (+1 more)

### Community 42 - "sku-list.ts"
Cohesion: 0.10
Nodes (27): formatPrice(), SkuDetailDialog(), LoginForm(), PageHeader(), Card(), CardAction(), CardContent(), CardDescription() (+19 more)

### Community 43 - "tabs.tsx"
Cohesion: 0.33
Nodes (5): PpcTopUpLayout(), PriceChangePlansLayout(), MasterListLayout(), SponsoredBrandsUploadLayout(), assertItemAccess()

### Community 44 - "page-header.tsx"
Cohesion: 0.48
Nodes (6): DashboardPage(), PortalLayout(), Sidebar(), Topbar(), getMyPermissions(), getSession()

### Community 45 - "tools.ts"
Cohesion: 0.33
Nodes (6): AutomationTool, bulkCampaignUpload, defineTool(), slugify(), ToolInput, tools

## Knowledge Gaps
- **174 isolated node(s):** `StaffMember`, `ACCESS_SECTIONS`, `PRICE_TYPES`, `PriceTypeOption`, `DirectoryEntry` (+169 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Sponsored Brands Bulk XLSX Builder` to `PPC Top-Up Automation`, `product-block.tsx`, `Dashboard, Projects & Tools Registry`, `sku-list.ts`, `page-header.tsx`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Package Dependencies (package.json)` to `PPC Top-Up Automation`, `PPC Schedule AI Import`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `xlsx` connect `PPC Schedule AI Import` to `Shared UI Components & Layout Shell`, `sku-list.ts`, `Package Dependencies (package.json)`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **What connects `StaffMember`, `ACCESS_SECTIONS`, `PRICE_TYPES` to the rest of the system?**
  _177 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `PPC Top-Up Automation` be split into smaller, more focused modules?**
  _Cohesion score 0.10784313725490197 - nodes in this community are weakly interconnected._
- **Should `Auth & Staff Management` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Should `Package Dependencies (package.json)` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._