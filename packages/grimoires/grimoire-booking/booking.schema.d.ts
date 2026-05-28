/**
 * Gremio CMS — Booking Engine Schema
 *
 * Drizzle ORM schema for room reservations with conflict detection,
 * amenities management, and booking workflows.
 */
export declare const bookingStatusEnum: import("drizzle-orm/pg-core").PgEnum<["pending", "confirmed", "checked_in", "checked_out", "cancelled", "rejected", "no_show"]>;
export declare const roomTypeEnum: import("drizzle-orm/pg-core").PgEnum<["meeting_room", "conference_room", "office", "desk", "studio", "event_space", "classroom", "auditorium", "other"]>;
export declare const roomStatusEnum: import("drizzle-orm/pg-core").PgEnum<["available", "maintenance", "closed", "reserved"]>;
export declare const recurrenceTypeEnum: import("drizzle-orm/pg-core").PgEnum<["none", "daily", "weekly", "monthly"]>;
export declare const rooms: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "booking_rooms";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        slug: import("drizzle-orm/pg-core").PgColumn<{
            name: "slug";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        description: import("drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        type: import("drizzle-orm/pg-core").PgColumn<{
            name: "type";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "other" | "meeting_room" | "conference_room" | "office" | "desk" | "studio" | "event_space" | "classroom" | "auditorium";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["meeting_room", "conference_room", "office", "desk", "studio", "event_space", "classroom", "auditorium", "other"];
            baseColumn: never;
        }, {}, {}>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "closed" | "available" | "maintenance" | "reserved";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["available", "maintenance", "closed", "reserved"];
            baseColumn: never;
        }, {}, {}>;
        capacity: import("drizzle-orm/pg-core").PgColumn<{
            name: "capacity";
            tableName: "booking_rooms";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        location: import("drizzle-orm/pg-core").PgColumn<{
            name: "location";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        floor: import("drizzle-orm/pg-core").PgColumn<{
            name: "floor";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        images: import("drizzle-orm/pg-core").PgColumn<{
            name: "images";
            tableName: "booking_rooms";
            dataType: "json";
            columnType: "PgJsonb";
            data: {
                mediaId: string;
                caption?: string;
            }[];
            driverParam: unknown;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        coverImageId: import("drizzle-orm/pg-core").PgColumn<{
            name: "cover_image_id";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        hourlyRate: import("drizzle-orm/pg-core").PgColumn<{
            name: "hourly_rate";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        dailyRate: import("drizzle-orm/pg-core").PgColumn<{
            name: "daily_rate";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        minBookingHours: import("drizzle-orm/pg-core").PgColumn<{
            name: "min_booking_hours";
            tableName: "booking_rooms";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        maxBookingHours: import("drizzle-orm/pg-core").PgColumn<{
            name: "max_booking_hours";
            tableName: "booking_rooms";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        advanceBookingDays: import("drizzle-orm/pg-core").PgColumn<{
            name: "advance_booking_days";
            tableName: "booking_rooms";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        availableFrom: import("drizzle-orm/pg-core").PgColumn<{
            name: "available_from";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgTime";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        availableUntil: import("drizzle-orm/pg-core").PgColumn<{
            name: "available_until";
            tableName: "booking_rooms";
            dataType: "string";
            columnType: "PgTime";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        availableDays: import("drizzle-orm/pg-core").PgColumn<{
            name: "available_days";
            tableName: "booking_rooms";
            dataType: "json";
            columnType: "PgJsonb";
            data: number[];
            driverParam: unknown;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        features: import("drizzle-orm/pg-core").PgColumn<{
            name: "features";
            tableName: "booking_rooms";
            dataType: "json";
            columnType: "PgJsonb";
            data: RoomFeatures;
            driverParam: unknown;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        requiresApproval: import("drizzle-orm/pg-core").PgColumn<{
            name: "requires_approval";
            tableName: "booking_rooms";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        isActive: import("drizzle-orm/pg-core").PgColumn<{
            name: "is_active";
            tableName: "booking_rooms";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "booking_rooms";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "booking_rooms";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export interface RoomFeatures {
    hasProjector?: boolean;
    hasWhiteboard?: boolean;
    hasVideoConferencing?: boolean;
    hasAudioSystem?: boolean;
    hasParking?: boolean;
    wheelchairAccessible?: boolean;
    naturalLight?: boolean;
    airConditioning?: boolean;
    wifi?: boolean;
    refreshments?: boolean;
    catering?: boolean;
    [key: string]: boolean | undefined;
}
export declare const amenities: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "booking_amenities";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "booking_amenities";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        name: import("drizzle-orm/pg-core").PgColumn<{
            name: "name";
            tableName: "booking_amenities";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        icon: import("drizzle-orm/pg-core").PgColumn<{
            name: "icon";
            tableName: "booking_amenities";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        description: import("drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "booking_amenities";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        category: import("drizzle-orm/pg-core").PgColumn<{
            name: "category";
            tableName: "booking_amenities";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        isActive: import("drizzle-orm/pg-core").PgColumn<{
            name: "is_active";
            tableName: "booking_amenities";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "booking_amenities";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const roomAmenities: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "booking_room_amenities";
    schema: undefined;
    columns: {
        roomId: import("drizzle-orm/pg-core").PgColumn<{
            name: "room_id";
            tableName: "booking_room_amenities";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        amenityId: import("drizzle-orm/pg-core").PgColumn<{
            name: "amenity_id";
            tableName: "booking_room_amenities";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        quantity: import("drizzle-orm/pg-core").PgColumn<{
            name: "quantity";
            tableName: "booking_room_amenities";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        notes: import("drizzle-orm/pg-core").PgColumn<{
            name: "notes";
            tableName: "booking_room_amenities";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const bookings: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "booking_reservations";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        roomId: import("drizzle-orm/pg-core").PgColumn<{
            name: "room_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        bookedForName: import("drizzle-orm/pg-core").PgColumn<{
            name: "booked_for_name";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        bookedForEmail: import("drizzle-orm/pg-core").PgColumn<{
            name: "booked_for_email";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        bookedForPhone: import("drizzle-orm/pg-core").PgColumn<{
            name: "booked_for_phone";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        organizationId: import("drizzle-orm/pg-core").PgColumn<{
            name: "organization_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        departmentId: import("drizzle-orm/pg-core").PgColumn<{
            name: "department_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        title: import("drizzle-orm/pg-core").PgColumn<{
            name: "title";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        description: import("drizzle-orm/pg-core").PgColumn<{
            name: "description";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        eventType: import("drizzle-orm/pg-core").PgColumn<{
            name: "event_type";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        startTime: import("drizzle-orm/pg-core").PgColumn<{
            name: "start_time";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        endTime: import("drizzle-orm/pg-core").PgColumn<{
            name: "end_time";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        timezone: import("drizzle-orm/pg-core").PgColumn<{
            name: "timezone";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "pending" | "cancelled" | "rejected" | "confirmed" | "checked_in" | "checked_out" | "no_show";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "rejected", "no_show"];
            baseColumn: never;
        }, {}, {}>;
        recurrence: import("drizzle-orm/pg-core").PgColumn<{
            name: "recurrence";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "none" | "daily" | "weekly" | "monthly";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["none", "daily", "weekly", "monthly"];
            baseColumn: never;
        }, {}, {}>;
        recurrenceEndDate: import("drizzle-orm/pg-core").PgColumn<{
            name: "recurrence_end_date";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgDateString";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        parentBookingId: import("drizzle-orm/pg-core").PgColumn<{
            name: "parent_booking_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        expectedAttendees: import("drizzle-orm/pg-core").PgColumn<{
            name: "expected_attendees";
            tableName: "booking_reservations";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        maxAttendees: import("drizzle-orm/pg-core").PgColumn<{
            name: "max_attendees";
            tableName: "booking_reservations";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        attendees: import("drizzle-orm/pg-core").PgColumn<{
            name: "attendees";
            tableName: "booking_reservations";
            dataType: "json";
            columnType: "PgJsonb";
            data: BookingAttendee[];
            driverParam: unknown;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        requestedAmenities: import("drizzle-orm/pg-core").PgColumn<{
            name: "requested_amenities";
            tableName: "booking_reservations";
            dataType: "json";
            columnType: "PgJsonb";
            data: string[];
            driverParam: unknown;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        specialRequests: import("drizzle-orm/pg-core").PgColumn<{
            name: "special_requests";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        hourlyRate: import("drizzle-orm/pg-core").PgColumn<{
            name: "hourly_rate";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        totalHours: import("drizzle-orm/pg-core").PgColumn<{
            name: "total_hours";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        totalAmount: import("drizzle-orm/pg-core").PgColumn<{
            name: "total_amount";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        approvedById: import("drizzle-orm/pg-core").PgColumn<{
            name: "approved_by_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        approvedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "approved_at";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        rejectionReason: import("drizzle-orm/pg-core").PgColumn<{
            name: "rejection_reason";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        checkedInAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "checked_in_at";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        checkedInById: import("drizzle-orm/pg-core").PgColumn<{
            name: "checked_in_by_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        checkedOutAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "checked_out_at";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        reminderSentAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "reminder_sent_at";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        cancelledAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "cancelled_at";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        cancelledById: import("drizzle-orm/pg-core").PgColumn<{
            name: "cancelled_by_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        cancellationReason: import("drizzle-orm/pg-core").PgColumn<{
            name: "cancellation_reason";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        source: import("drizzle-orm/pg-core").PgColumn<{
            name: "source";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: true;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        externalCalendarId: import("drizzle-orm/pg-core").PgColumn<{
            name: "external_calendar_id";
            tableName: "booking_reservations";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        metadata: import("drizzle-orm/pg-core").PgColumn<{
            name: "metadata";
            tableName: "booking_reservations";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, any>;
            driverParam: unknown;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "booking_reservations";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export interface BookingAttendee {
    id: string;
    name: string;
    email: string;
    phone?: string;
    isOrganizer?: boolean;
    status?: "pending" | "accepted" | "declined" | "tentative";
}
export declare const bookingNotes: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "booking_notes";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "booking_notes";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        bookingId: import("drizzle-orm/pg-core").PgColumn<{
            name: "booking_id";
            tableName: "booking_notes";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        userId: import("drizzle-orm/pg-core").PgColumn<{
            name: "user_id";
            tableName: "booking_notes";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        note: import("drizzle-orm/pg-core").PgColumn<{
            name: "note";
            tableName: "booking_notes";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        isInternal: import("drizzle-orm/pg-core").PgColumn<{
            name: "is_internal";
            tableName: "booking_notes";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "booking_notes";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const blackoutDates: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "booking_blackout_dates";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "booking_blackout_dates";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        roomId: import("drizzle-orm/pg-core").PgColumn<{
            name: "room_id";
            tableName: "booking_blackout_dates";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        startDate: import("drizzle-orm/pg-core").PgColumn<{
            name: "start_date";
            tableName: "booking_blackout_dates";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        endDate: import("drizzle-orm/pg-core").PgColumn<{
            name: "end_date";
            tableName: "booking_blackout_dates";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        reason: import("drizzle-orm/pg-core").PgColumn<{
            name: "reason";
            tableName: "booking_blackout_dates";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        isRecurring: import("drizzle-orm/pg-core").PgColumn<{
            name: "is_recurring";
            tableName: "booking_blackout_dates";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: false;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdById: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_by_id";
            tableName: "booking_blackout_dates";
            dataType: "string";
            columnType: "PgUUID";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "booking_blackout_dates";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
export declare const roomsRelations: import("drizzle-orm").Relations<"booking_rooms", {
    amenities: import("drizzle-orm").Many<"booking_room_amenities">;
    bookings: import("drizzle-orm").Many<"booking_reservations">;
    blackoutDates: import("drizzle-orm").Many<"booking_blackout_dates">;
}>;
export declare const amenitiesRelations: import("drizzle-orm").Relations<"booking_amenities", {
    rooms: import("drizzle-orm").Many<"booking_room_amenities">;
}>;
export declare const roomAmenitiesRelations: import("drizzle-orm").Relations<"booking_room_amenities", {
    room: import("drizzle-orm").One<"booking_rooms", true>;
    amenity: import("drizzle-orm").One<"booking_amenities", true>;
}>;
export declare const bookingsRelations: import("drizzle-orm").Relations<"booking_reservations", {
    room: import("drizzle-orm").One<"booking_rooms", true>;
    parentBooking: import("drizzle-orm").One<"booking_reservations", false>;
    notes: import("drizzle-orm").Many<"booking_notes">;
}>;
export declare const bookingNotesRelations: import("drizzle-orm").Relations<"booking_notes", {
    booking: import("drizzle-orm").One<"booking_reservations", true>;
}>;
export declare const blackoutDatesRelations: import("drizzle-orm").Relations<"booking_blackout_dates", {
    room: import("drizzle-orm").One<"booking_rooms", true>;
}>;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Amenity = typeof amenities.$inferSelect;
export type NewAmenity = typeof amenities.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingNote = typeof bookingNotes.$inferSelect;
export type NewBookingNote = typeof bookingNotes.$inferInsert;
export type BlackoutDate = typeof blackoutDates.$inferSelect;
export type NewBlackoutDate = typeof blackoutDates.$inferInsert;
//# sourceMappingURL=booking.schema.d.ts.map