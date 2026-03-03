<script lang="ts">
	import { Gauge, ImagePlus, X, CheckCircle2, XCircle } from 'lucide-svelte';

	export interface SEOData {
		title: string;
		slug: string;
		seoTitle: string;
		seoDescription: string;
		ogImageUrl: string;
	}

	interface Props {
		data: SEOData;
		onUpdate: (data: SEOData) => void;
	}

	let { data, onUpdate }: Props = $props();

	let dragOver = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	const checks = $derived([
		{ label: 'Title present', pass: !!data.title },
		{ label: 'Slug is set', pass: !!data.slug },
		{ label: `SEO title ≤ 60 chars (${data.seoTitle.length})`, pass: data.seoTitle.length > 0 && data.seoTitle.length <= 60 },
		{ label: `Meta desc ≤ 160 chars (${data.seoDescription.length})`, pass: data.seoDescription.length > 0 && data.seoDescription.length <= 160 },
		{ label: 'OG Image uploaded', pass: !!data.ogImageUrl },
	]);

	const overallScore = $derived(() => {
		const passed = checks.filter((c) => c.pass).length;
		return Math.round((passed / checks.length) * 100);
	});

	function onDrop(e: DragEvent) {
		dragOver = false;
		const file = e.dataTransfer?.files?.[0];
		if (file && file.type.startsWith('image/')) previewFile(file);
	}

	function onFileSelect(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) previewFile(file);
	}

	function previewFile(file: File) {
		const reader = new FileReader();
		reader.onload = () => onUpdate({ ...data, ogImageUrl: reader.result as string });
		reader.readAsDataURL(file);
	}
</script>

{#snippet charCounter(count: number, max: number)}
	{@const cls = count === 0 ? 'text-gremius-subtle' : count <= max ? 'text-gremius-green' : 'text-gremius-pink'}
	<span class="text-[10px] font-mono {cls}">{count}/{max}</span>
{/snippet}

<div class="space-y-5">
	<div class="flex items-center gap-2 mb-4">
		<Gauge class="w-4 h-4 text-gremius-cyan" />
		<h3 class="text-sm font-semibold uppercase tracking-wider text-gremius-text-dim">SEO Guardian</h3>
		<span class="ml-auto badge {overallScore >= 80 ? 'badge-green' : overallScore >= 50 ? 'badge-amber' : 'badge-pink'}">
			{overallScore}%
		</span>
	</div>

	<!-- Slug -->
	<div>
		<label class="label mb-1.5 block">URL Slug</label>
		<div class="flex items-center gap-0 rounded-lg border border-gremius-border overflow-hidden bg-gremius-bg">
			<span class="px-3 py-2 text-xs text-gremius-subtle bg-gremius-card border-r border-gremius-border font-mono">/blog/</span>
			<input
				value={data.slug}
				oninput={(e) => onUpdate({ ...data, slug: e.currentTarget.value })}
				class="flex-1 bg-transparent px-3 py-2 text-sm text-gremius-cyan font-mono outline-none"
				placeholder="post-slug"
			/>
		</div>
	</div>

	<!-- SEO Title -->
	<div>
		<div class="flex items-center justify-between mb-1.5">
			<label class="label">SEO Title</label>
			{@render charCounter(data.seoTitle.length, 60)}
		</div>
		<input
			value={data.seoTitle}
			oninput={(e) => onUpdate({ ...data, seoTitle: e.currentTarget.value })}
			class="input"
			placeholder="SEO optimized title..."
		/>
	</div>

	<!-- SEO Description -->
	<div>
		<div class="flex items-center justify-between mb-1.5">
			<label class="label">Meta Description</label>
			{@render charCounter(data.seoDescription.length, 160)}
		</div>
		<textarea
			value={data.seoDescription}
			oninput={(e) => onUpdate({ ...data, seoDescription: e.currentTarget.value })}
			class="textarea"
			rows="3"
			placeholder="Compelling description for search results..."
		></textarea>
	</div>

	<!-- OG Image -->
	<div>
		<label class="label mb-1.5 block">OG Image (Social Preview)</label>
		<div
			ondragover={(e) => { e.preventDefault(); dragOver = true; }}
			ondragleave={() => dragOver = false}
			ondrop={onDrop}
			class="border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer {dragOver ? 'border-gremius-cyan bg-gremius-cyan/5' : 'border-gremius-border hover:border-gremius-subtle'}"
			onclick={() => fileInput?.click()}
		>
			{#if data.ogImageUrl}
				<div class="relative">
					<img src={data.ogImageUrl} class="w-full rounded-lg border border-gremius-border" alt="OG Image" />
					<button onclick={(e) => { e.stopPropagation(); onUpdate({ ...data, ogImageUrl: '' }); }} class="absolute top-2 right-2 btn-icon bg-black/60 p-1 rounded-md">
						<X class="w-3 h-3" />
					</button>
				</div>
			{:else}
				<div class="flex flex-col items-center gap-2 text-gremius-subtle">
					<ImagePlus class="w-8 h-8" />
					<p class="text-xs">Drop image or click to upload</p>
					<p class="text-[10px]">Recommended: 1200×630px</p>
				</div>
			{/if}
		</div>
		<input bind:this={fileInput} type="file" accept="image/*" class="hidden" onchange={onFileSelect} />
	</div>

	<!-- Google Preview -->
	<div>
		<label class="label mb-2 block">Search Preview</label>
		<div class="rounded-lg bg-white p-4 space-y-1">
			<p class="text-sm text-[#1a0dab] truncate font-medium">
				{data.seoTitle || data.title || 'Page Title'}
			</p>
			<p class="text-xs text-[#006621] font-mono truncate">
				yoursite.com/blog/{data.slug || 'post-slug'}
			</p>
			<p class="text-xs text-[#545454] line-clamp-2 leading-relaxed">
				{data.seoDescription || 'Add a meta description to improve your search result appearance.'}
			</p>
		</div>
	</div>

	<!-- Checks -->
	<div class="space-y-2">
		<label class="label mb-2 block">SEO Checklist</label>
		{#each checks as check}
			<div class="flex items-center gap-2 text-xs">
				{#if check.pass}
					<CheckCircle2 class="w-3.5 h-3.5 text-gremius-green shrink-0" />
				{:else}
					<XCircle class="w-3.5 h-3.5 text-gremius-pink shrink-0" />
				{/if}
				<span class={check.pass ? 'text-gremius-text-dim' : 'text-gremius-pink'}>{check.label}</span>
			</div>
		{/each}
	</div>
</div>
