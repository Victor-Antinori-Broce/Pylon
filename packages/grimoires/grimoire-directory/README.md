# Grimoire Directory — Employee Directory

Employee profiles, departments, positions, and organizational hierarchy.

## Features

- **Organizations**: Multi-tenant support for multiple companies
- **Departments**: Nested hierarchy with unlimited depth
- **Positions**: Job titles with levels and reporting structure
- **Employees**: Rich profiles with skills, social links, documents
- **Org Charts**: Automatic tree generation
- **Reporting Chains**: View full management chain
- **Search**: Global search across all entities
- **Statistics**: Employee counts, breakdowns

## Quick Start

### Create an Organization

```bash
POST /api/directory/organizations
{
  "name": "Acme Corporation",
  "slug": "acme-corp",
  "website": "https://acme.com",
  "city": "San Francisco",
  "country": "USA"
}
```

### Create a Department

```bash
POST /api/directory/departments
{
  "organizationId": "uuid",
  "name": "Engineering",
  "slug": "engineering",
  "location": "Building A, Floor 2"
}
```

### Create an Employee

```bash
POST /api/directory/employees
{
  "organizationId": "uuid",
  "employeeId": "EMP001",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@acme.com",
  "departmentId": "uuid",
  "positionId": "uuid",
  "startDate": "2024-01-15",
  "skills": ["JavaScript", "TypeScript", "React"]
}
```

### Get Org Chart

```bash
GET /api/directory/org-chart?organizationId={id}
```

## API Endpoints

### Organizations

| Method | Endpoint                           | Description                  |
| ------ | ---------------------------------- | ---------------------------- |
| GET    | `/api/directory/organizations`     | List organizations           |
| POST   | `/api/directory/organizations`     | Create organization          |
| GET    | `/api/directory/organizations/:id` | Get details with departments |

### Departments

| Method | Endpoint                         | Description         |
| ------ | -------------------------------- | ------------------- |
| GET    | `/api/directory/departments`     | List (with filters) |
| POST   | `/api/directory/departments`     | Create department   |
| GET    | `/api/directory/departments/:id` | Get with employees  |

### Positions

| Method | Endpoint                   | Description     |
| ------ | -------------------------- | --------------- |
| GET    | `/api/directory/positions` | List positions  |
| POST   | `/api/directory/positions` | Create position |

### Employees

| Method | Endpoint                                       | Description          |
| ------ | ---------------------------------------------- | -------------------- |
| GET    | `/api/directory/employees`                     | List with filters    |
| POST   | `/api/directory/employees`                     | Create employee      |
| GET    | `/api/directory/employees/:id`                 | Get full profile     |
| PATCH  | `/api/directory/employees/:id`                 | Update employee      |
| DELETE | `/api/directory/employees/:id`                 | Soft delete          |
| GET    | `/api/directory/employees/:id/reporting-chain` | Get management chain |
| GET    | `/api/directory/employees/:id/documents`       | List documents       |
| POST   | `/api/directory/employees/:id/documents`       | Add document         |

### Org Chart & Search

| Method | Endpoint                          | Description             |
| ------ | --------------------------------- | ----------------------- |
| GET    | `/api/directory/org-chart`        | Get full org chart      |
| GET    | `/api/directory/search?q={query}` | Global search           |
| GET    | `/api/directory/stats`            | Organization statistics |

## Employee Statuses

| Status       | Description         |
| ------------ | ------------------- |
| `active`     | Currently employed  |
| `on_leave`   | Temporarily away    |
| `remote`     | Working remotely    |
| `terminated` | No longer employed  |
| `contractor` | External contractor |
| `intern`     | Internship          |

## Database Schema

### organizations

- Company/entity information
- Multi-tenant support

### departments

- Nested hierarchy (parent/child)
- Department heads
- Cost centers

### positions

- Job titles and levels
- Reporting structure
- Management flags

### employees

- Personal and work info
- Skills and languages
- Social links
- Emergency contacts
- Custom fields

### employee_documents

- Contracts, IDs, certificates
- Expiration tracking
- Confidential flags

### org_chart_cache

- Pre-computed hierarchy
- Fast tree queries

## Search

```bash
GET /api/directory/search?q=john&organizationId={id}

Response:
{
  "employees": [...],
  "departments": [...],
  "total": 5
}
```

## Org Chart

```bash
GET /api/directory/org-chart?organizationId={id}

Response:
{
  "organizationId": "...",
  "roots": [{
    "id": "...",
    "firstName": "Jane",
    "lastName": "CEO",
    "positionTitle": "Chief Executive Officer",
    "children": [...]
  }],
  "totalEmployees": 150
}
```

## Reporting Chain

```bash
GET /api/directory/employees/{id}/reporting-chain

Response:
{
  "chain": [
    { "id": "...", "firstName": "Jane", "positionTitle": "CEO" },
    { "id": "...", "firstName": "Bob", "positionTitle": "VP Engineering" },
    { "id": "...", "firstName": "Alice", "positionTitle": "Engineering Manager" }
  ]
}
```

## Statistics

```bash
GET /api/directory/stats?organizationId={id}

Response:
{
  "totalEmployees": 150,
  "byStatus": { "active": 140, "on_leave": 5, "remote": 20 },
  "byDepartment": { "...": 50, "...": 30 },
  "remoteEmployees": 45,
  "onSiteEmployees": 105
}
```

## License

MIT
