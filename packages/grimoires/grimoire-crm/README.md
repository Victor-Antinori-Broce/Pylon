# @gremius/grimoire-crm

Complete CRM & Pipeline Management system for Gremius CMS.

## Features

- **Companies**: Manage accounts and organizations
- **Contacts**: Track people with lead scoring
- **Pipelines**: Customizable sales pipelines
- **Deals**: Opportunity tracking with Kanban view
- **Activities**: Calls, emails, meetings, tasks

## Database Schema

### Tables
- `crm_companies` - Company/Account records
- `crm_contacts` - Contact/People records
- `crm_pipelines` - Sales pipeline definitions
- `crm_pipeline_stages` - Pipeline columns/stages
- `crm_deals` - Opportunities
- `crm_activities` - Activities and tasks

### Enums
- `crm_contact_status`: lead, prospect, customer, churned, archived
- `crm_deal_status`: open, won, lost, paused
- `crm_activity_type`: call, email, meeting, task, note, sms, demo
- `crm_priority`: low, medium, high, urgent

## API Endpoints

### Companies
- `GET /api/crm/companies` - List companies
- `POST /api/crm/companies` - Create company
- `GET /api/crm/companies/:id` - Get company
- `PATCH /api/crm/companies/:id` - Update company
- `DELETE /api/crm/companies/:id` - Delete company

### Contacts
- `GET /api/crm/contacts` - List contacts
- `POST /api/crm/contacts` - Create contact
- `GET /api/crm/contacts/:id` - Get contact
- `PATCH /api/crm/contacts/:id` - Update contact
- `DELETE /api/crm/contacts/:id` - Delete contact

### Pipelines
- `GET /api/crm/pipelines` - List pipelines
- `POST /api/crm/pipelines` - Create pipeline
- `GET /api/crm/pipelines/:id` - Get pipeline with stages
- `PATCH /api/crm/pipelines/:id` - Update pipeline
- `DELETE /api/crm/pipelines/:id` - Delete pipeline

### Pipeline Stages
- `POST /api/crm/pipelines/:id/stages` - Add stage
- `PATCH /api/crm/stages/:id` - Update stage
- `DELETE /api/crm/stages/:id` - Delete stage

### Deals
- `GET /api/crm/deals` - List deals
- `POST /api/crm/deals` - Create deal
- `GET /api/crm/deals/:id` - Get deal
- `PATCH /api/crm/deals/:id` - Update deal
- `DELETE /api/crm/deals/:id` - Delete deal
- `POST /api/crm/deals/:id/move` - Move deal to stage
- `POST /api/crm/deals/reorder` - Batch reorder deals

### Kanban
- `GET /api/crm/pipelines/:id/kanban` - Get full kanban board

### Activities
- `GET /api/crm/activities` - List activities
- `POST /api/crm/activities` - Create activity
- `GET /api/crm/activities/:id` - Get activity
- `PATCH /api/crm/activities/:id` - Update activity
- `POST /api/crm/activities/:id/complete` - Mark complete
- `DELETE /api/crm/activities/:id` - Delete activity

### Dashboard
- `GET /api/crm/stats` - Get CRM statistics

## Setup

1. Run migrations:
```bash
cd apps/api
bun run db:migrate
```

2. The grimoire will auto-activate when the realm includes it.

## Dependencies

- `@gremius/shared` - Core types and GrimoireContext
- `@paralleldrive/cuid2` - ID generation
- `hono` - Web framework
- `drizzle-orm` - Database ORM
