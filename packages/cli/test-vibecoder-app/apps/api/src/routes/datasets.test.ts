// @ts-nocheck
/**
 * Tests for DataSets Routes
 * 
 * Run with: bun test src/routes/datasets.test.ts
 */

import { describe, it, expect, beforeEach } from 'bun:test';

import { createMockContext, resetTestDatabase } from '../lib/test-utils';

import { dataSetsFullRoutes } from './datasets';

describe('DataSets Routes', () => {
	beforeEach(async () => {
		await resetTestDatabase();
	});

	describe('GET /', () => {
		it('should return empty array when no datasets exist', async () => {
			const c = createMockContext();
			
			// Note: In real tests, we'd need to mount the route and test via HTTP
			// This is a simplified example showing the test structure
			const response = await dataSetsFullRoutes.request('/');
			
			expect(response.status).toBe(200);
			const body = await response.json() as { docs: unknown[]; totalDocs: number };
			expect(body.docs).toEqual([]);
			expect(body.totalDocs).toBe(0);
		});
	});

	describe('POST /', () => {
		it('should create a new dataset with valid data', async () => {
			const newDataset = {
				name: 'Test Dataset',
				slug: 'test-dataset',
				fields: [
					{
						id: 'field-1',
						key: 'title',
						type: 'text' as const,
						label: 'Title',
						isRequired: true,
						isUnique: false
					}
				]
			};

			const response = await dataSetsFullRoutes.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newDataset)
			});

			expect(response.status).toBe(201);
			const body = await response.json() as { name: string; slug: string; fields: unknown[] };
			expect(body.name).toBe('Test Dataset');
			expect(body.slug).toBe('test-dataset');
			expect(body.fields).toHaveLength(1);
		});

		it('should reject invalid dataset data', async () => {
			const invalidDataset = {
				name: '', // Empty name should fail
				fields: []
			};

			const response = await dataSetsFullRoutes.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(invalidDataset)
			});

			expect(response.status).toBe(400);
		});
	});

	describe('GET /:id', () => {
		it('should return 404 for non-existent dataset', async () => {
			const response = await dataSetsFullRoutes.request('/non-existent-id');
			
			expect(response.status).toBe(404);
			const body = await response.json() as { error: string };
			expect(body.error).toContain('not found');
		});
	});

	describe('PATCH /:id', () => {
		it('should update dataset name', async () => {
			// First create a dataset
			const createResponse = await dataSetsFullRoutes.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'Original Name',
					slug: 'original-name',
					fields: []
				})
			});

			const created = await createResponse.json() as { id: string };
			
			// Then update it
			const updateResponse = await dataSetsFullRoutes.request(`/${created.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'Updated Name' })
			});

			expect(updateResponse.status).toBe(200);
			const updated = await updateResponse.json() as { name: string };
			expect(updated.name).toBe('Updated Name');
		});
	});

	describe('DELETE /:id', () => {
		it('should delete existing dataset', async () => {
			// First create a dataset
			const createResponse = await dataSetsFullRoutes.request('/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'To Delete',
					slug: 'to-delete',
					fields: []
				})
			});

			const created = await createResponse.json() as { id: string };
			
			// Delete it
			const deleteResponse = await dataSetsFullRoutes.request(`/${created.id}`, {
				method: 'DELETE'
			});

			expect(deleteResponse.status).toBe(200);
			
			// Verify it's gone
			const getResponse = await dataSetsFullRoutes.request(`/${created.id}`);
			expect(getResponse.status).toBe(404);
		});
	});
});
