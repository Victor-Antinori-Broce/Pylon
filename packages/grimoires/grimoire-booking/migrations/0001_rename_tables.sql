-- Rename tables
ALTER TABLE IF EXISTS rooms RENAME TO booking_rooms;
ALTER TABLE IF EXISTS amenities RENAME TO booking_amenities;
ALTER TABLE IF EXISTS room_amenities RENAME TO booking_room_amenities;
ALTER TABLE IF EXISTS bookings RENAME TO booking_reservations;
ALTER TABLE IF EXISTS booking_notes RENAME TO booking_notes; -- no change needed
ALTER TABLE IF EXISTS blackout_dates RENAME TO booking_blackout_dates;

-- Rename enums (PostgreSQL syntax)
-- Note: rename only works if no columns reference the enum. If they do, 
-- we need to create new enum, alter columns, drop old.
DO $$
BEGIN
  -- booking_status
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status') THEN
    ALTER TYPE booking_status RENAME TO booking_status; -- already correct
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_type') THEN
    ALTER TYPE room_type RENAME TO booking_room_type;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_status') THEN
    ALTER TYPE room_status RENAME TO booking_room_status;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recurrence_type') THEN
    ALTER TYPE recurrence_type RENAME TO booking_recurrence_type;
  END IF;
END $$;
