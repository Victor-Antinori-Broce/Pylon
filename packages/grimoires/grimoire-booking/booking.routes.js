// @ts-nocheck
/**
 * Gremio CMS — Booking Engine Routes (DI Version)
 *
 * REST API for room reservations with conflict detection,
 * availability checking, and booking management.
 *
 * MIGRATED: Now uses Dependency Injection via GrimoireContext
 * - db → ctx.dbInstance.instance
 * - cachedQuery/invalidateCache → ctx.cache
 * - requireAuth/requireRole → ctx.auth
 */
import { Hono } from "hono";
import { eq, and, or, gte, lte, gt, lt, sql, asc, desc, inArray } from "drizzle-orm";
import { rooms, amenities, roomAmenities, bookings, bookingNotes, blackoutDates } from "./booking.schema";
/**
 * Helper to generate media transform URL for a given media ID and preset
 * Uses grimoire-media transform endpoints
 */
function getMediaTransformUrl(mediaId, preset) {
    if (!mediaId)
        return null;
    return `/api/media/preset/${mediaId}/${preset}`;
}
/**
 * Helper to transform room images with transform URLs
 * Adds coverImageUrl and imageUrls array to room data
 */
function transformRoomImages(room) {
    const coverImageUrl = getMediaTransformUrl(room.coverImageId, 'medium');
    const imageUrls = room.images?.map((img) => ({
        url: getMediaTransformUrl(img.mediaId, 'small'),
        caption: img.caption,
    })) || [];
    return {
        ...room,
        coverImageUrl,
        imageUrls,
    };
}
/**
 * Factory function that creates Booking routes with dependency injection
 */
export function createBookingRouter(ctx) {
    const bookingRoutes = new Hono();
    const { cache, auth } = ctx;
    // Helper to get db instance
    const dbInstance = ctx.db.instance;
    // Helper for auth
    const requireAuth = auth.requireAuth;
    const requireRole = auth.requireRole ? auth.requireRole : auth.requireAuth;
    // Helper for cached query
    const cachedQuery = async (key, ttl, fn) => {
        const cached = await cache.get(key);
        if (cached)
            return cached;
        const result = await fn();
        await cache.set(key, result, ttl);
        return result;
    };
    // Helper for cache invalidation
    const invalidateCache = async (pattern) => {
        await cache.invalidate(pattern);
    };
    // ═══════════════════════════════════════════════
    // ROOMS CRUD
    // ═══════════════════════════════════════════════
    // List all rooms
    bookingRoutes.get("/rooms", async (c) => {
        const query = c.req.query();
        const type = query.type;
        const minCapacity = query.minCapacity ? parseInt(query.minCapacity) : null;
        const maxCapacity = query.maxCapacity ? parseInt(query.maxCapacity) : null;
        const features = query.features?.split(",");
        const result = await cachedQuery(`rooms:list:${JSON.stringify(query)}`, 60, async () => {
            let conditions = [eq(rooms.isActive, true)];
            if (type)
                conditions.push(eq(rooms.type, type));
            if (minCapacity)
                conditions.push(gte(rooms.capacity, minCapacity));
            if (maxCapacity)
                conditions.push(lte(rooms.capacity, maxCapacity));
            if (features?.length) {
                // Filter rooms that have all requested features
                for (const feature of features) {
                    conditions.push(sql `${rooms.features}->>${feature} = 'true'`);
                }
            }
            const roomList = await dbInstance
                .select({
                id: rooms.id,
                name: rooms.name,
                slug: rooms.slug,
                description: rooms.description,
                type: rooms.type,
                status: rooms.status,
                capacity: rooms.capacity,
                location: rooms.location,
                floor: rooms.floor,
                coverImageId: rooms.coverImageId,
                images: rooms.images,
                hourlyRate: rooms.hourlyRate,
                features: rooms.features,
                requiresApproval: rooms.requiresApproval,
            })
                .from(rooms)
                .where(and(...conditions))
                .orderBy(asc(rooms.name));
            // Transform room images with URLs
            const roomsWithImageUrls = roomList.map(room => transformRoomImages(room));
            return { docs: roomsWithImageUrls, totalDocs: roomsWithImageUrls.length };
        });
        return c.json(result);
    });
    // Get single room with amenities
    bookingRoutes.get("/rooms/:id", async (c) => {
        const { id } = c.req.param();
        const includeBookings = c.req.query("include_bookings") === "true";
        const [room] = await dbInstance
            .select()
            .from(rooms)
            .where(sql `${rooms.id} = ${id} OR ${rooms.slug} = ${id}`)
            .limit(1);
        if (!room)
            return c.json({ error: "Room not found" }, 404);
        // Get amenities
        const roomAmenitiesList = await dbInstance
            .select({
            id: amenities.id,
            name: amenities.name,
            icon: amenities.icon,
            description: amenities.description,
            category: amenities.category,
            quantity: roomAmenities.quantity,
            notes: roomAmenities.notes,
        })
            .from(roomAmenities)
            .innerJoin(amenities, eq(roomAmenities.amenityId, amenities.id))
            .where(eq(roomAmenities.roomId, room.id));
        let result = transformRoomImages({ ...room, amenities: roomAmenitiesList });
        // Include upcoming bookings if requested
        if (includeBookings) {
            const upcomingBookings = await dbInstance
                .select({
                id: bookings.id,
                title: bookings.title,
                startTime: bookings.startTime,
                endTime: bookings.endTime,
                status: bookings.status,
            })
                .from(bookings)
                .where(and(eq(bookings.roomId, room.id), gte(bookings.endTime, new Date()), eq(bookings.status, "confirmed")))
                .orderBy(asc(bookings.startTime))
                .limit(10);
            result.upcomingBookings = upcomingBookings;
        }
        return c.json(result);
    });
    // Create room
    bookingRoutes.post("/rooms", requireAuth, async (c) => {
        const body = await c.req.json();
        const slug = body.slug || body.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        // Check duplicate slug
        const [existing] = await dbInstance
            .select({ id: rooms.id })
            .from(rooms)
            .where(eq(rooms.slug, slug))
            .limit(1);
        if (existing) {
            return c.json({ error: "A room with this slug already exists" }, 409);
        }
        const [room] = await dbInstance
            .insert(rooms)
            .values({
            name: body.name,
            slug,
            description: body.description,
            type: body.type || "meeting_room",
            status: body.status || "available",
            capacity: body.capacity || 4,
            location: body.location,
            floor: body.floor,
            images: body.images || [],
            coverImageId: body.coverImageId,
            hourlyRate: body.hourlyRate,
            dailyRate: body.dailyRate,
            minBookingHours: body.minBookingHours || 1,
            maxBookingHours: body.maxBookingHours || 8,
            advanceBookingDays: body.advanceBookingDays || 30,
            availableFrom: body.availableFrom,
            availableUntil: body.availableUntil,
            availableDays: body.availableDays || [1, 2, 3, 4, 5],
            features: body.features || {},
            requiresApproval: body.requiresApproval || false,
        })
            .returning();
        // Add amenities if provided
        if (body.amenityIds?.length) {
            await dbInstance.insert(roomAmenities).values(body.amenityIds.map((amenityId) => ({
                roomId: room.id,
                amenityId,
                quantity: 1,
            })));
        }
        await invalidateCache("rooms:*");
        return c.json(room, 201);
    });
    // Update room
    bookingRoutes.patch("/rooms/:id", requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const updates = { updatedAt: new Date() };
        if (body.name !== undefined)
            updates.name = body.name;
        if (body.description !== undefined)
            updates.description = body.description;
        if (body.type !== undefined)
            updates.type = body.type;
        if (body.status !== undefined)
            updates.status = body.status;
        if (body.capacity !== undefined)
            updates.capacity = body.capacity;
        if (body.location !== undefined)
            updates.location = body.location;
        if (body.floor !== undefined)
            updates.floor = body.floor;
        if (body.images !== undefined)
            updates.images = body.images;
        if (body.coverImageId !== undefined)
            updates.coverImageId = body.coverImageId;
        if (body.hourlyRate !== undefined)
            updates.hourlyRate = body.hourlyRate;
        if (body.dailyRate !== undefined)
            updates.dailyRate = body.dailyRate;
        if (body.minBookingHours !== undefined)
            updates.minBookingHours = body.minBookingHours;
        if (body.maxBookingHours !== undefined)
            updates.maxBookingHours = body.maxBookingHours;
        if (body.advanceBookingDays !== undefined)
            updates.advanceBookingDays = body.advanceBookingDays;
        if (body.availableFrom !== undefined)
            updates.availableFrom = body.availableFrom;
        if (body.availableUntil !== undefined)
            updates.availableUntil = body.availableUntil;
        if (body.availableDays !== undefined)
            updates.availableDays = body.availableDays;
        if (body.features !== undefined)
            updates.features = body.features;
        if (body.requiresApproval !== undefined)
            updates.requiresApproval = body.requiresApproval;
        if (body.isActive !== undefined)
            updates.isActive = body.isActive;
        if (body.slug !== undefined) {
            const [existing] = await dbInstance
                .select({ id: rooms.id })
                .from(rooms)
                .where(and(eq(rooms.slug, body.slug), sql `${rooms.id} != ${id}`))
                .limit(1);
            if (existing) {
                return c.json({ error: "A room with this slug already exists" }, 409);
            }
            updates.slug = body.slug;
        }
        const [updated] = await dbInstance
            .update(rooms)
            .set(updates)
            .where(eq(rooms.id, id))
            .returning();
        if (!updated)
            return c.json({ error: "Room not found" }, 404);
        // Update amenities if provided
        if (body.amenityIds !== undefined) {
            await dbInstance.delete(roomAmenities).where(eq(roomAmenities.roomId, id));
            if (body.amenityIds.length > 0) {
                await dbInstance.insert(roomAmenities).values(body.amenityIds.map((amenityId) => ({
                    roomId: id,
                    amenityId,
                    quantity: 1,
                })));
            }
        }
        await invalidateCache(`rooms:*`);
        return c.json(updated);
    });
    // Delete room
    bookingRoutes.delete("/rooms/:id", requireAuth, async (c) => {
        const { id } = c.req.param();
        const [deleted] = await dbInstance
            .delete(rooms)
            .where(eq(rooms.id, id))
            .returning();
        if (!deleted)
            return c.json({ error: "Room not found" }, 404);
        await invalidateCache("rooms:*");
        return c.json({ success: true, id: deleted.id });
    });
    // ═══════════════════════════════════════════════
    // AMENITIES
    // ═══════════════════════════════════════════════
    bookingRoutes.get("/amenities", async (c) => {
        const category = c.req.query("category");
        let conditions = [eq(amenities.isActive, true)];
        if (category)
            conditions.push(eq(amenities.category, category));
        const list = await dbInstance
            .select()
            .from(amenities)
            .where(and(...conditions))
            .orderBy(asc(amenities.name));
        return c.json({ docs: list });
    });
    bookingRoutes.post("/amenities", requireAuth, async (c) => {
        const body = await c.req.json();
        const [amenity] = await dbInstance
            .insert(amenities)
            .values({
            name: body.name,
            icon: body.icon,
            description: body.description,
            category: body.category,
        })
            .returning();
        return c.json(amenity, 201);
    });
    // ═══════════════════════════════════════════════
    // AVAILABILITY CHECKING
    // ═══════════════════════════════════════════════
    // Check room availability
    bookingRoutes.get("/availability", async (c) => {
        const roomId = c.req.query("roomId");
        const startTime = new Date(c.req.query("startTime") || "");
        const endTime = new Date(c.req.query("endTime") || "");
        if (!roomId || isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
            return c.json({ error: "roomId, startTime, and endTime are required" }, 400);
        }
        // Check if room exists and is available
        const [room] = await dbInstance
            .select()
            .from(rooms)
            .where(and(eq(rooms.id, roomId), eq(rooms.isActive, true)))
            .limit(1);
        if (!room) {
            return c.json({ available: false, reason: "Room not found or inactive" });
        }
        if (room.status !== "available") {
            return c.json({ available: false, reason: `Room is ${room.status}` });
        }
        // Check for conflicting bookings
        const conflictingBookings = await dbInstance
            .select({ id: bookings.id, status: bookings.status })
            .from(bookings)
            .where(and(eq(bookings.roomId, roomId), or(and(lte(bookings.startTime, startTime), gt(bookings.endTime, startTime)), and(lt(bookings.startTime, endTime), gte(bookings.endTime, endTime)), and(gte(bookings.startTime, startTime), lte(bookings.endTime, endTime))), or(eq(bookings.status, "pending"), eq(bookings.status, "confirmed"), eq(bookings.status, "checked_in"))));
        if (conflictingBookings.length > 0) {
            return c.json({
                available: false,
                reason: "Time slot is already booked",
                conflictingBookings: conflictingBookings.map(b => b.id),
            });
        }
        // Check blackout dates
        const blackoutConflicts = await dbInstance
            .select({ id: blackoutDates.id, reason: blackoutDates.reason })
            .from(blackoutDates)
            .where(and(eq(blackoutDates.roomId, roomId), or(and(lte(blackoutDates.startDate, startTime), gt(blackoutDates.endDate, startTime)), and(lt(blackoutDates.startDate, endTime), gte(blackoutDates.endDate, endTime)), and(gte(blackoutDates.startDate, startTime), lte(blackoutDates.endDate, endTime)))));
        if (blackoutConflicts.length > 0) {
            return c.json({
                available: false,
                reason: "Room is unavailable during this time",
                blackoutPeriods: blackoutConflicts,
            });
        }
        // Calculate pricing if applicable
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);
        const totalAmount = room.hourlyRate ? (parseFloat(room.hourlyRate) * durationHours).toFixed(2) : null;
        return c.json({
            available: true,
            room: transformRoomImages({
                id: room.id,
                name: room.name,
                capacity: room.capacity,
                hourlyRate: room.hourlyRate,
                coverImageId: room.coverImageId,
                images: room.images,
            }),
            duration: {
                hours: Math.round(durationHours * 100) / 100,
                minutes: Math.round(durationMs / (1000 * 60)),
            },
            estimatedCost: totalAmount,
        });
    });
    // Get available time slots for a room
    bookingRoutes.get("/rooms/:id/slots", async (c) => {
        const { id } = c.req.param();
        const date = c.req.query("date") || new Date().toISOString().split("T")[0];
        const duration = parseInt(c.req.query("duration") || "60"); // minutes
        // Verify room exists
        const [room] = await dbInstance
            .select()
            .from(rooms)
            .where(eq(rooms.id, id))
            .limit(1);
        if (!room)
            return c.json({ error: "Room not found" }, 404);
        const requestedDate = new Date(date);
        const dayStart = new Date(requestedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(requestedDate);
        dayEnd.setHours(23, 59, 59, 999);
        // Get existing bookings for the day
        const existingBookings = await dbInstance
            .select({
            startTime: bookings.startTime,
            endTime: bookings.endTime,
        })
            .from(bookings)
            .where(and(eq(bookings.roomId, id), gte(bookings.startTime, dayStart), lte(bookings.startTime, dayEnd), or(eq(bookings.status, "pending"), eq(bookings.status, "confirmed"), eq(bookings.status, "checked_in"))));
        // Generate time slots (30-minute increments)
        const slots = [];
        const slotDuration = 30; // minutes
        const startHour = room.availableFrom ? parseInt(room.availableFrom.split(":")[0]) : 8;
        const endHour = room.availableUntil ? parseInt(room.availableUntil.split(":")[0]) : 18;
        for (let hour = startHour; hour < endHour; hour++) {
            for (let minute = 0; minute < 60; minute += slotDuration) {
                const slotStart = new Date(requestedDate);
                slotStart.setHours(hour, minute, 0, 0);
                const slotEnd = new Date(slotStart);
                slotEnd.setMinutes(slotEnd.getMinutes() + duration);
                // Check if slot conflicts with existing bookings
                const hasConflict = existingBookings.some(booking => {
                    const bookingStart = new Date(booking.startTime);
                    const bookingEnd = new Date(booking.endTime);
                    return ((slotStart >= bookingStart && slotStart < bookingEnd) ||
                        (slotEnd > bookingStart && slotEnd <= bookingEnd) ||
                        (slotStart <= bookingStart && slotEnd >= bookingEnd));
                });
                // Only add slots that end before the room closes
                if (slotEnd.getHours() < endHour || (slotEnd.getHours() === endHour && slotEnd.getMinutes() === 0)) {
                    slots.push({
                        start: slotStart.toISOString(),
                        end: slotEnd.toISOString(),
                        available: !hasConflict,
                    });
                }
            }
        }
        return c.json({
            roomId: id,
            date,
            durationMinutes: duration,
            slots,
        });
    });
    // ═══════════════════════════════════════════════
    // BOOKINGS CRUD
    // ═══════════════════════════════════════════════
    // List bookings
    bookingRoutes.get("/bookings", async (c) => {
        const query = c.req.query();
        const roomId = query.roomId;
        const userId = query.userId;
        const status = query.status;
        const startAfter = query.startAfter ? new Date(query.startAfter) : null;
        const startBefore = query.startBefore ? new Date(query.startBefore) : null;
        const result = await cachedQuery(`bookings:list:${JSON.stringify(query)}`, 30, async () => {
            let conditions = [];
            if (roomId)
                conditions.push(eq(bookings.roomId, roomId));
            if (userId)
                conditions.push(eq(bookings.userId, userId));
            if (status)
                conditions.push(eq(bookings.status, status));
            if (startAfter)
                conditions.push(gte(bookings.startTime, startAfter));
            if (startBefore)
                conditions.push(lte(bookings.startTime, startBefore));
            const bookingList = await dbInstance
                .select({
                id: bookings.id,
                roomId: bookings.roomId,
                userId: bookings.userId,
                title: bookings.title,
                eventType: bookings.eventType,
                startTime: bookings.startTime,
                endTime: bookings.endTime,
                status: bookings.status,
                expectedAttendees: bookings.expectedAttendees,
                createdAt: bookings.createdAt,
            })
                .from(bookings)
                .where(conditions.length > 0 ? and(...conditions) : undefined)
                .orderBy(desc(bookings.startTime))
                .limit(parseInt(query.limit || "50"));
            // Get room names and cover images
            const roomIds = [...new Set(bookingList.map(b => b.roomId))];
            const roomData = await dbInstance
                .select({ id: rooms.id, name: rooms.name, coverImageId: rooms.coverImageId })
                .from(rooms)
                .where(inArray(rooms.id, roomIds));
            const roomMap = new Map(roomData.map(r => [r.id, { name: r.name, coverImageId: r.coverImageId }]));
            return {
                docs: bookingList.map(b => {
                    const roomInfo = roomMap.get(b.roomId);
                    return {
                        ...b,
                        roomName: roomInfo?.name,
                        roomCoverImageUrl: getMediaTransformUrl(roomInfo?.coverImageId, 'thumbnail'),
                    };
                }),
                totalDocs: bookingList.length,
            };
        });
        return c.json(result);
    });
    // Get single booking
    bookingRoutes.get("/bookings/:id", async (c) => {
        const { id } = c.req.param();
        const [booking] = await dbInstance
            .select()
            .from(bookings)
            .where(eq(bookings.id, id))
            .limit(1);
        if (!booking)
            return c.json({ error: "Booking not found" }, 404);
        // Get room details with transformed images
        const [room] = await dbInstance
            .select({
            id: rooms.id,
            name: rooms.name,
            location: rooms.location,
            capacity: rooms.capacity,
            coverImageId: rooms.coverImageId,
        })
            .from(rooms)
            .where(eq(rooms.id, booking.roomId))
            .limit(1);
        const roomWithImage = room ? transformRoomImages(room) : null;
        // Get notes
        const notes = await dbInstance
            .select()
            .from(bookingNotes)
            .where(eq(bookingNotes.bookingId, id))
            .orderBy(desc(bookingNotes.createdAt));
        return c.json({ ...booking, room: roomWithImage, notes });
    });
    // Create booking
    bookingRoutes.post("/bookings", requireAuth, async (c) => {
        const body = await c.req.json();
        // Validate required fields
        if (!body.roomId || !body.title || !body.startTime || !body.endTime) {
            return c.json({ error: "roomId, title, startTime, and endTime are required" }, 400);
        }
        const startTime = new Date(body.startTime);
        const endTime = new Date(body.endTime);
        if (endTime <= startTime) {
            return c.json({ error: "End time must be after start time" }, 400);
        }
        // Check room availability
        const [room] = await dbInstance
            .select()
            .from(rooms)
            .where(and(eq(rooms.id, body.roomId), eq(rooms.isActive, true)))
            .limit(1);
        if (!room) {
            return c.json({ error: "Room not found or inactive" }, 404);
        }
        // Check for conflicts
        const conflicts = await dbInstance
            .select({ id: bookings.id })
            .from(bookings)
            .where(and(eq(bookings.roomId, body.roomId), or(and(lte(bookings.startTime, startTime), gt(bookings.endTime, startTime)), and(lt(bookings.startTime, endTime), gte(bookings.endTime, endTime)), and(gte(bookings.startTime, startTime), lte(bookings.endTime, endTime))), or(eq(bookings.status, "pending"), eq(bookings.status, "confirmed"), eq(bookings.status, "checked_in"))));
        if (conflicts.length > 0) {
            return c.json({ error: "Time slot conflicts with existing booking", conflicts }, 409);
        }
        // Calculate duration and cost
        const durationHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        const hourlyRate = body.hourlyRate || room.hourlyRate;
        const totalAmount = hourlyRate ? (parseFloat(hourlyRate) * durationHours).toFixed(2) : null;
        // Create booking
        const [booking] = await dbInstance
            .insert(bookings)
            .values({
            roomId: body.roomId,
            userId: body.userId,
            bookedForName: body.bookedForName,
            bookedForEmail: body.bookedForEmail,
            bookedForPhone: body.bookedForPhone,
            organizationId: body.organizationId,
            departmentId: body.departmentId,
            title: body.title,
            description: body.description,
            eventType: body.eventType,
            startTime,
            endTime,
            timezone: body.timezone || "UTC",
            status: room.requiresApproval ? "pending" : "confirmed",
            expectedAttendees: body.expectedAttendees || 1,
            maxAttendees: body.maxAttendees,
            attendees: body.attendees || [],
            requestedAmenities: body.requestedAmenities || [],
            specialRequests: body.specialRequests,
            hourlyRate,
            totalHours: durationHours.toFixed(2),
            totalAmount,
            source: body.source || "web",
            metadata: body.metadata || {},
        })
            .returning();
        await invalidateCache("bookings:*");
        await invalidateCache(`rooms:${body.roomId}*`);
        return c.json(booking, 201);
    });
    // Update booking
    bookingRoutes.patch("/bookings/:id", requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [existing] = await dbInstance.select().from(bookings).where(eq(bookings.id, id)).limit(1);
        if (!existing)
            return c.json({ error: "Booking not found" }, 404);
        const updates = { updatedAt: new Date() };
        // Allow updating various fields
        if (body.title !== undefined)
            updates.title = body.title;
        if (body.description !== undefined)
            updates.description = body.description;
        if (body.eventType !== undefined)
            updates.eventType = body.eventType;
        if (body.expectedAttendees !== undefined)
            updates.expectedAttendees = body.expectedAttendees;
        if (body.attendees !== undefined)
            updates.attendees = body.attendees;
        if (body.specialRequests !== undefined)
            updates.specialRequests = body.specialRequests;
        if (body.metadata !== undefined)
            updates.metadata = body.metadata;
        // Status changes with workflow
        if (body.status !== undefined && body.status !== existing.status) {
            switch (body.status) {
                case "confirmed":
                    updates.status = "confirmed";
                    updates.approvedById = body.approvedById;
                    updates.approvedAt = new Date();
                    break;
                case "cancelled":
                    updates.status = "cancelled";
                    updates.cancelledAt = new Date();
                    updates.cancelledById = body.cancelledById;
                    updates.cancellationReason = body.cancellationReason;
                    break;
                case "rejected":
                    updates.status = "rejected";
                    updates.rejectionReason = body.rejectionReason;
                    break;
                case "checked_in":
                    updates.status = "checked_in";
                    updates.checkedInAt = new Date();
                    updates.checkedInById = body.checkedInById;
                    break;
                case "checked_out":
                    updates.status = "checked_out";
                    updates.checkedOutAt = new Date();
                    break;
                default:
                    updates.status = body.status;
            }
        }
        const [updated] = await dbInstance
            .update(bookings)
            .set(updates)
            .where(eq(bookings.id, id))
            .returning();
        await invalidateCache("bookings:*");
        await invalidateCache(`rooms:${existing.roomId}*`);
        return c.json(updated);
    });
    // Cancel booking
    bookingRoutes.post("/bookings/:id/cancel", requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [existing] = await dbInstance.select({ roomId: bookings.roomId }).from(bookings).where(eq(bookings.id, id)).limit(1);
        if (!existing)
            return c.json({ error: "Booking not found" }, 404);
        const [updated] = await dbInstance
            .update(bookings)
            .set({
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledById: body.cancelledById,
            cancellationReason: body.reason,
            updatedAt: new Date(),
        })
            .where(eq(bookings.id, id))
            .returning();
        await invalidateCache("bookings:*");
        await invalidateCache(`rooms:${existing.roomId}*`);
        return c.json(updated);
    });
    // Check-in
    bookingRoutes.post("/bookings/:id/check-in", requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [existing] = await dbInstance
            .select({ roomId: bookings.roomId, status: bookings.status })
            .from(bookings)
            .where(eq(bookings.id, id))
            .limit(1);
        if (!existing)
            return c.json({ error: "Booking not found" }, 404);
        if (existing.status !== "confirmed") {
            return c.json({ error: `Cannot check in a booking with status: ${existing.status}` }, 400);
        }
        const [updated] = await dbInstance
            .update(bookings)
            .set({
            status: "checked_in",
            checkedInAt: new Date(),
            checkedInById: body.checkedInById,
            updatedAt: new Date(),
        })
            .where(eq(bookings.id, id))
            .returning();
        await invalidateCache("bookings:*");
        return c.json(updated);
    });
    // Check-out
    bookingRoutes.post("/bookings/:id/check-out", requireAuth, async (c) => {
        const { id } = c.req.param();
        const [existing] = await dbInstance
            .select({ roomId: bookings.roomId, status: bookings.status })
            .from(bookings)
            .where(eq(bookings.id, id))
            .limit(1);
        if (!existing)
            return c.json({ error: "Booking not found" }, 404);
        if (existing.status !== "checked_in") {
            return c.json({ error: `Cannot check out a booking with status: ${existing.status}` }, 400);
        }
        const [updated] = await dbInstance
            .update(bookings)
            .set({
            status: "checked_out",
            checkedOutAt: new Date(),
            updatedAt: new Date(),
        })
            .where(eq(bookings.id, id))
            .returning();
        await invalidateCache("bookings:*");
        return c.json(updated);
    });
    // Add note to booking
    bookingRoutes.post("/bookings/:id/notes", requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [note] = await dbInstance
            .insert(bookingNotes)
            .values({
            bookingId: id,
            userId: body.userId,
            note: body.note,
            isInternal: body.isInternal || false,
        })
            .returning();
        return c.json(note, 201);
    });
    // ═══════════════════════════════════════════════
    // BLACKOUT DATES
    // ═══════════════════════════════════════════════
    bookingRoutes.get("/rooms/:id/blackout", async (c) => {
        const { id } = c.req.param();
        const list = await dbInstance
            .select()
            .from(blackoutDates)
            .where(eq(blackoutDates.roomId, id))
            .orderBy(asc(blackoutDates.startDate));
        return c.json({ docs: list });
    });
    bookingRoutes.post("/rooms/:id/blackout", requireAuth, async (c) => {
        const { id } = c.req.param();
        const body = await c.req.json();
        const [blackout] = await dbInstance
            .insert(blackoutDates)
            .values({
            roomId: id,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
            reason: body.reason,
            isRecurring: body.isRecurring || false,
            createdById: body.createdById,
        })
            .returning();
        await invalidateCache(`rooms:${id}*`);
        return c.json(blackout, 201);
    });
    bookingRoutes.delete("/blackout/:blackoutId", requireAuth, async (c) => {
        const { blackoutId } = c.req.param();
        const [deleted] = await dbInstance
            .delete(blackoutDates)
            .where(eq(blackoutDates.id, blackoutId))
            .returning();
        if (!deleted)
            return c.json({ error: "Blackout period not found" }, 404);
        await invalidateCache(`rooms:*`);
        return c.json({ success: true });
    });
    // ═══════════════════════════════════════════════
    // MY BOOKINGS (for current user)
    // ═══════════════════════════════════════════════
    bookingRoutes.get("/my-bookings", async (c) => {
        const userId = c.req.query("userId");
        if (!userId)
            return c.json({ error: "userId is required" }, 400);
        const upcoming = await dbInstance
            .select({
            id: bookings.id,
            roomId: bookings.roomId,
            title: bookings.title,
            startTime: bookings.startTime,
            endTime: bookings.endTime,
            status: bookings.status,
        })
            .from(bookings)
            .where(and(eq(bookings.userId, userId), gte(bookings.endTime, new Date()), or(eq(bookings.status, "confirmed"), eq(bookings.status, "pending"), eq(bookings.status, "checked_in"))))
            .orderBy(asc(bookings.startTime));
        // Get room names and cover images
        const roomIds = [...new Set(upcoming.map(b => b.roomId))];
        const roomData = roomIds.length > 0 ? await dbInstance
            .select({ id: rooms.id, name: rooms.name, coverImageId: rooms.coverImageId })
            .from(rooms)
            .where(inArray(rooms.id, roomIds)) : [];
        const roomMap = new Map(roomData.map(r => [r.id, { name: r.name, coverImageId: r.coverImageId }]));
        return c.json({
            docs: upcoming.map(b => {
                const roomInfo = roomMap.get(b.roomId);
                return {
                    ...b,
                    roomName: roomInfo?.name,
                    roomCoverImageUrl: getMediaTransformUrl(roomInfo?.coverImageId, 'thumbnail'),
                };
            }),
        });
    });
    // Return the configured router
    return bookingRoutes;
}
// Legacy export for backward compatibility
export { createBookingRouter as bookingRoutes };
//# sourceMappingURL=booking.routes.js.map