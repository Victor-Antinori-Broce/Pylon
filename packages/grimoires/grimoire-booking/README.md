# Grimoire Booking — Room Reservation System

Complete booking engine for room reservations with conflict detection, amenities management, and approval workflows.

## Features

- **Room Management**: CRUD for rooms with types, capacity, and features
- **Amenities**: Attach amenities to rooms (projector, whiteboard, etc.)
- **Conflict Detection**: Automatic checking for overlapping bookings
- **Availability API**: Check room availability and get time slots
- **Approval Workflow**: Optional approval for bookings
- **Check-in/out**: Track actual room usage
- **Blackout Dates**: Block rooms for maintenance or holidays
- **Recurring Bookings**: Support for daily, weekly, monthly recurrences
- **Pricing**: Hourly/daily rates with automatic calculation

## Quick Start

### Create a Room

```bash
POST /api/booking/rooms
{
  "name": "Conference Room A",
  "slug": "conference-room-a",
  "type": "conference_room",
  "capacity": 20,
  "location": "Building 2, Floor 3",
  "features": {
    "hasProjector": true,
    "hasWhiteboard": true,
    "hasVideoConferencing": true
  },
  "hourlyRate": "50.00"
}
```

### Check Availability

```bash
GET /api/booking/availability?roomId={id}&startTime=2024-01-15T09:00:00Z&endTime=2024-01-15T11:00:00Z
```

### Create a Booking

```bash
POST /api/booking/bookings
{
  "roomId": "uuid",
  "title": "Team Standup",
  "startTime": "2024-01-15T09:00:00Z",
  "endTime": "2024-01-15T10:00:00Z",
  "userId": "uuid",
  "expectedAttendees": 8,
  "description": "Daily team standup meeting"
}
```

## API Endpoints

### Rooms

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/booking/rooms` | List rooms (with filters) |
| POST | `/api/booking/rooms` | Create room |
| GET | `/api/booking/rooms/:id` | Get room details |
| PATCH | `/api/booking/rooms/:id` | Update room |
| DELETE | `/api/booking/rooms/:id` | Delete room |
| GET | `/api/booking/rooms/:id/slots` | Get available time slots |
| GET | `/api/booking/rooms/:id/blackout` | List blackout dates |
| POST | `/api/booking/rooms/:id/blackout` | Add blackout period |

### Amenities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/booking/amenities` | List amenities |
| POST | `/api/booking/amenities` | Create amenity |

### Bookings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/booking/bookings` | List bookings (with filters) |
| POST | `/api/booking/bookings` | Create booking |
| GET | `/api/booking/bookings/:id` | Get booking details |
| PATCH | `/api/booking/bookings/:id` | Update booking |
| POST | `/api/booking/bookings/:id/cancel` | Cancel booking |
| POST | `/api/booking/bookings/:id/check-in` | Check in |
| POST | `/api/booking/bookings/:id/check-out` | Check out |
| POST | `/api/booking/bookings/:id/notes` | Add note |

### Availability

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/booking/availability` | Check if slot is available |
| GET | `/api/booking/my-bookings?userId={id}` | Get user's upcoming bookings |

## Room Types

- `meeting_room` — Standard meeting room
- `conference_room` — Large conference room
- `office` — Private office
- `desk` — Individual workstation
- `studio` — Creative studio
- `event_space` — Large event space
- `classroom` — Educational classroom
- `auditorium` — Large auditorium
- `other` — Custom room type

## Booking Statuses

| Status | Description |
|--------|-------------|
| `pending` | Awaiting approval |
| `confirmed` | Booking confirmed |
| `checked_in` | Guest has checked in |
| `checked_out` | Guest has checked out |
| `cancelled` | Cancelled by user |
| `rejected` | Rejected by admin |
| `no_show` | Guest didn't arrive |

## Database Schema

### rooms
- Core room information (name, type, capacity, location)
- Availability settings (hours, days)
- Features (JSON: projector, whiteboard, etc.)
- Pricing (hourly/daily rates)

### amenities
- Shared amenity definitions
- Can be attached to multiple rooms

### room_amenities
- Junction table for rooms ↔ amenities
- Supports quantity and notes per room

### bookings
- Full booking details
- User/guest information
- Timing (start/end, timezone)
- Status workflow
- Attendees list
- Pricing calculation
- Approval workflow fields

### booking_notes
- Internal and public notes
- Activity log per booking

### blackout_dates
- Room unavailability periods
- Supports recurring blackouts

## Conflict Detection

The system prevents double-booking by checking:
1. Existing bookings in the time range
2. Blackout dates
3. Room status (available/maintenance/closed)

## Availability Checking

```bash
# Check specific time slot
GET /api/booking/availability?roomId={id}&startTime=...&endTime=...

# Response
{
  "available": true,
  "room": { "id": "...", "name": "...", "capacity": 20 },
  "duration": { "hours": 2, "minutes": 120 },
  "estimatedCost": "100.00"
}
```

## Time Slots

```bash
# Get available slots for a date
GET /api/booking/rooms/{id}/slots?date=2024-01-15&duration=60

# Response
{
  "roomId": "...",
  "date": "2024-01-15",
  "durationMinutes": 60,
  "slots": [
    { "start": "...", "end": "...", "available": true },
    { "start": "...", "end": "...", "available": false }
  ]
}
```

## License

MIT
