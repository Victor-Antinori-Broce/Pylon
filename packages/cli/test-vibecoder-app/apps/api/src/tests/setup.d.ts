/**
 * Test Setup and Utilities
 *
 * Provides test database setup, teardown, and utility functions
 * for all test suites.
 */
export declare const TEST_DATABASE_URL: string;
/**
 * Check if database is available
 */
export declare function isDatabaseAvailable(): Promise<boolean>;
/**
 * Clear all test data
 */
export declare function clearTestData(): Promise<void>;
/**
 * Setup test environment
 */
export declare function setupTestEnv(): Promise<boolean>;
/**
 * Generate unique test IDs
 */
export declare function generateTestId(): string;
/**
 * Create test user data
 */
export declare function createTestUserData(): {
    email: string;
    password: string;
    name: string;
};
/**
 * Create test dataset data
 */
export declare function createTestDatasetData(): {
    name: string;
    slug: string;
    description: string;
    schema: {
        fields: {
            id: string;
            key: string;
            type: "text";
            label: string;
            required: boolean;
        }[];
        version: string;
    };
};
//# sourceMappingURL=setup.d.ts.map